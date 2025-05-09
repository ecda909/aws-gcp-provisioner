/**
 * Routes for managing cloud provider credentials
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

/**
 * Credential routes
 */
module.exports = async function (fastify, opts) {
  // Schema for credential creation
  const credentialCreateSchema = {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'provider', 'credentials'],
        properties: {
          name: { type: 'string' },
          provider: { type: 'string', enum: ['AWS', 'GCP'] },
          credentials: {
            type: 'object',
            additionalProperties: true
          }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            provider: { type: 'string' }
          }
        }
      }
    }
  };

  // Create a new credential
  fastify.post('/', credentialCreateSchema, async (request, reply) => {
    const { name, provider, credentials } = request.body;

    try {
      // Check if credential with same name already exists
      const existingCredential = await prisma.credential.findUnique({
        where: { name }
      });

      if (existingCredential) {
        return reply.code(409).send({ error: 'Credential with this name already exists' });
      }

      // Validate credentials based on provider
      if (provider === 'AWS') {
        if (!credentials.accessKeyId || !credentials.secretAccessKey) {
          return reply.code(400).send({
            error: 'AWS credentials must include accessKeyId and secretAccessKey'
          });
        }
      } else if (provider === 'GCP') {
        if (!credentials.projectId || !credentials.clientEmail || !credentials.privateKey) {
          return reply.code(400).send({
            error: 'GCP credentials must include projectId, clientEmail, and privateKey'
          });
        }
      }

      // Create credential record
      const credential = await prisma.credential.create({
        data: {
          name,
          provider,
          credentials
        }
      });

      return reply.code(201).send({
        id: credential.id,
        name: credential.name,
        provider: credential.provider
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create credential' });
    }
  });

  // Get all credentials
  fastify.get('/', async (request, reply) => {
    try {
      const credentials = await prisma.credential.findMany({
        select: {
          id: true,
          name: true,
          provider: true,
          createdAt: true,
          updatedAt: true
        }
      });
      return reply.send(credentials);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch credentials' });
    }
  });

  // Get credential by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const credential = await prisma.credential.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          provider: true,
          credentials: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!credential) {
        return reply.code(404).send({ error: 'Credential not found' });
      }

      return reply.send(credential);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch credential' });
    }
  });

  // Update credential
  fastify.put('/:id', {
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
          name: { type: 'string' },
          credentials: {
            type: 'object',
            additionalProperties: true
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { name, credentials } = request.body;

    try {
      const existingCredential = await prisma.credential.findUnique({
        where: { id }
      });

      if (!existingCredential) {
        return reply.code(404).send({ error: 'Credential not found' });
      }

      // Check if new name conflicts with existing credential
      if (name && name !== existingCredential.name) {
        const nameExists = await prisma.credential.findUnique({
          where: { name }
        });

        if (nameExists) {
          return reply.code(409).send({ error: 'Credential with this name already exists' });
        }
      }

      // Update credential
      const updateData = {};
      if (name) updateData.name = name;
      if (credentials) updateData.credentials = credentials;

      const updatedCredential = await prisma.credential.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          provider: true,
          updatedAt: true
        }
      });

      return reply.send(updatedCredential);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update credential' });
    }
  });

  // Delete credential
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      // Check if credential is being used by any deployments
      const deploymentCount = await prisma.deployment.count({
        where: { credentialId: id }
      });

      if (deploymentCount > 0) {
        return reply.code(400).send({
          error: 'Cannot delete credential that is being used by deployments',
          deploymentCount
        });
      }

      // Delete credential
      await prisma.credential.delete({
        where: { id }
      });

      return reply.code(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete credential' });
    }
  });
};
