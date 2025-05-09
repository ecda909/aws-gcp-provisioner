/**
 * Routes for managing Terraform deployments
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
let prisma;
try {
  prisma = new PrismaClient();
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  process.exit(1);
}
const terraformService = require('../services/terraform');

/**
 * Deployment routes
 */
module.exports = async function (fastify, opts) {
  // Schema for deployment creation
  const deploymentCreateSchema = {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'provider', 'region', 'parameters', 'credentialId', 'terraformPath', 'gitRepo', 'gitBranch'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          provider: { type: 'string', enum: ['AWS', 'GCP'] },
          region: { type: 'string' },
          parameters: { type: 'object' },
          credentialId: { type: 'string' },
          failoverRegion: { type: 'string' },
          failoverProvider: { type: 'string', enum: ['AWS', 'GCP'] },
          terraformPath: { type: 'string' },
          gitRepo: { type: 'string' },
          gitBranch: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string' }
          }
        }
      }
    }
  };

  // Create a new deployment
  fastify.post('/', deploymentCreateSchema, async (request, reply) => {
    const {
      name, description, provider, region, parameters,
      credentialId, failoverRegion, failoverProvider,
      terraformPath, gitRepo, gitBranch
    } = request.body;

    try {
      // Check if credential exists
      const credential = await prisma.credential.findUnique({
        where: { id: credentialId }
      });

      if (!credential) {
        return reply.code(404).send({ error: 'Credential not found' });
      }

      // Create deployment record
      const deployment = await prisma.deployment.create({
        data: {
          name,
          description,
          provider,
          region,
          parameters,
          status: 'PENDING',
          credentialId,
          failoverRegion,
          failoverProvider,
          terraformPath,
          gitRepo,
          gitBranch
        }
      });

      // Create operation log
      await prisma.operationLog.create({
        data: {
          deploymentId: deployment.id,
          operation: 'DEPLOY',
          status: 'PENDING',
          details: { provider, region }
        }
      });

      // Start deployment process asynchronously
      terraformService.deploy(deployment.id).catch(err => {
        fastify.log.error(`Deployment error for ${deployment.id}: ${err.message}`);
      });

      return reply.code(201).send({
        id: deployment.id,
        name: deployment.name,
        status: deployment.status
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create deployment' });
    }
  });

  // Get all deployments
  fastify.get('/', async (request, reply) => {
    try {
      const deployments = await prisma.deployment.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          provider: true,
          region: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          failoverRegion: true,
          failoverProvider: true
        }
      });
      return reply.send(deployments);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch deployments' });
    }
  });

  // Get deployment by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const deployment = await prisma.deployment.findUnique({
        where: { id },
        include: {
          credential: {
            select: {
              id: true,
              name: true,
              provider: true
            }
          }
        }
      });

      if (!deployment) {
        return reply.code(404).send({ error: 'Deployment not found' });
      }

      return reply.send(deployment);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch deployment' });
    }
  });

  // Switch region for a deployment
  fastify.post('/:id/switch-region', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['region'],
        properties: {
          region: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { region } = request.body;

    try {
      const deployment = await prisma.deployment.findUnique({
        where: { id }
      });

      if (!deployment) {
        return reply.code(404).send({ error: 'Deployment not found' });
      }

      if (deployment.status === 'RUNNING') {
        return reply.code(400).send({ error: 'Deployment is currently running' });
      }

      // Update deployment status
      await prisma.deployment.update({
        where: { id },
        data: { status: 'PENDING' }
      });

      // Create operation log
      await prisma.operationLog.create({
        data: {
          deploymentId: id,
          operation: 'SWITCH_REGION',
          status: 'PENDING',
          details: {
            oldRegion: deployment.region,
            newRegion: region
          }
        }
      });

      // Start region switch process asynchronously
      terraformService.switchRegion(id, region).catch(err => {
        fastify.log.error(`Region switch error for ${id}: ${err.message}`);
      });

      return reply.send({
        id,
        status: 'PENDING',
        message: `Switching from ${deployment.region} to ${region}`
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to switch region' });
    }
  });

  // Failover to another provider
  fastify.post('/:id/failover', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['AWS', 'GCP'] },
          region: { type: 'string' },
          credentialId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { provider, region } = request.body;

    try {
      const deployment = await prisma.deployment.findUnique({
        where: { id }
      });

      if (!deployment) {
        return reply.code(404).send({ error: 'Deployment not found' });
      }

      if (deployment.status === 'RUNNING') {
        return reply.code(400).send({ error: 'Deployment is currently running' });
      }

      const targetProvider = provider || deployment.failoverProvider;
      const targetRegion = region || deployment.failoverRegion;

      if (!targetProvider || !targetRegion) {
        return reply.code(400).send({
          error: 'Failover provider and region must be specified either in the request or in the deployment configuration'
        });
      }

      // Update deployment status
      await prisma.deployment.update({
        where: { id },
        data: { status: 'PENDING' }
      });

      // Create operation log
      await prisma.operationLog.create({
        data: {
          deploymentId: id,
          operation: 'FAILOVER',
          status: 'PENDING',
          details: {
            fromProvider: deployment.provider,
            fromRegion: deployment.region,
            toProvider: targetProvider,
            toRegion: targetRegion
          }
        }
      });

      // Start failover process asynchronously
      terraformService.failover(id, targetProvider, targetRegion, request).catch(err => {
        fastify.log.error(`Failover error for ${id}: ${err.message}`);
      });

      return reply.send({
        id,
        status: 'PENDING',
        message: `Failing over from ${deployment.provider}/${deployment.region} to ${targetProvider}/${targetRegion}`
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to initiate failover' });
    }
  });
};
