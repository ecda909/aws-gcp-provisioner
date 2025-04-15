const deploymentService = require('../../services/deploymentService');

/**
 * Deployment routes
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Route options
 */
async function routes(fastify, options) {
  // Get all deployments
  fastify.get('/', {
    schema: {
      description: 'Get all deployments',
      tags: ['deployments'],
      querystring: {
        type: 'object',
        properties: {
          templateId: { type: 'string' },
          status: { type: 'string', enum: ['PENDING', 'CREATING', 'ACTIVE', 'UPDATING', 'DELETING', 'DELETED', 'FAILED'] },
          isFailover: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              status: { type: 'string' },
              primaryRegion: { type: 'string' },
              failoverRegion: { type: 'string' },
              isFailover: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
              template: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  provider: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { templateId, status, isFailover } = request.query;
        
        // Get deployments using deployment service
        const deployments = await deploymentService.getAllDeployments({ 
          templateId, 
          status,
          isFailover: isFailover !== undefined ? isFailover === 'true' : undefined
        });
        
        return deployments;
      } catch (error) {
        request.log.error(`Error fetching deployments: ${error.message}`);
        reply.code(500).send({ error: 'Failed to fetch deployments' });
      }
    }
  });
  
  // Get a deployment by ID
  fastify.get('/:id', {
    schema: {
      description: 'Get a deployment by ID',
      tags: ['deployments'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string' },
            parameters: { type: 'object' },
            primaryRegion: { type: 'string' },
            failoverRegion: { type: 'string' },
            isFailover: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            template: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                provider: { type: 'string' },
                version: { type: 'string' }
              }
            },
            resources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string' },
                  status: { type: 'string' },
                  region: { type: 'string' }
                }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { id } = request.params;
        
        try {
          // Get deployment using deployment service
          const deployment = await deploymentService.getDeploymentById(id);
          return deployment;
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Deployment not found' });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error fetching deployment: ${error.message}`);
        reply.code(500).send({ error: 'Failed to fetch deployment' });
      }
    }
  });
  
  // Create a new deployment
  fastify.post('/', {
    schema: {
      description: 'Create a new deployment from a template',
      tags: ['deployments'],
      body: {
        type: 'object',
        required: ['name', 'templateId', 'parameters', 'primaryRegion'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          templateId: { type: 'string' },
          parameters: { type: 'object' },
          primaryRegion: { type: 'string' },
          failoverRegion: { type: 'string' }
        }
      },
      response: {
        202: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            jobId: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const deploymentData = request.body;
        
        // Create deployment using deployment service
        const { deployment, job } = await deploymentService.createDeployment(deploymentData);
        
        request.log.info(`Deployment ${deployment.id} created and job ${job.id} queued`);
        
        return reply.code(202).send({
          id: deployment.id,
          name: deployment.name,
          jobId: job.id,
          message: 'Deployment creation has been queued'
        });
      } catch (error) {
        request.log.error(`Error creating deployment: ${error.message}`);
        reply.code(500).send({ error: `Failed to create deployment: ${error.message}` });
      }
    }
  });
  
  // Update a deployment
  fastify.put('/:id', {
    schema: {
      description: 'Update a deployment',
      tags: ['deployments'],
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
          description: { type: 'string' },
          parameters: { type: 'object' },
          failoverRegion: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            message: { type: 'string' }
          }
        },
        202: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jobId: { type: 'string' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { id } = request.params;
        const updates = request.body;
        
        try {
          // Update deployment using deployment service
          const result = await deploymentService.updateDeployment(id, updates);
          
          // If a job was created (parameters update), return 202 Accepted
          if (result.job) {
            request.log.info(`Deployment ${result.deployment.id} update job ${result.job.id} queued`);
            
            return reply.code(202).send({
              id: result.deployment.id,
              jobId: result.job.id,
              message: 'Deployment update has been queued'
            });
          } else {
            // If only metadata was updated, return 200 OK
            return reply.code(200).send({
              id: result.deployment.id,
              message: 'Deployment metadata updated successfully'
            });
          }
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Deployment not found' });
          }
          if (error.message.includes('cannot be updated')) {
            return reply.code(400).send({ error: error.message });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error updating deployment: ${error.message}`);
        reply.code(500).send({ error: 'Failed to update deployment' });
      }
    }
  });
  
  // Delete a deployment
  fastify.delete('/:id', {
    schema: {
      description: 'Delete a deployment',
      tags: ['deployments'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        202: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jobId: { type: 'string' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { id } = request.params;
        
        try {
          // Delete deployment using deployment service
          const { deployment, job } = await deploymentService.deleteDeployment(id);
          
          request.log.info(`Deployment ${deployment.id} deletion job ${job.id} queued`);
          
          return reply.code(202).send({
            id: deployment.id,
            jobId: job.id,
            message: 'Deployment deletion has been queued'
          });
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Deployment not found' });
          }
          if (error.message.includes('already in')) {
            return reply.code(400).send({ error: error.message });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error deleting deployment: ${error.message}`);
        reply.code(500).send({ error: 'Failed to delete deployment' });
      }
    }
  });
  
  // Initiate failover for a deployment
  fastify.post('/:id/failover', {
    schema: {
      description: 'Initiate failover for a deployment',
      tags: ['deployments'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        202: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jobId: { type: 'string' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { id } = request.params;
        
        try {
          // Initiate failover using deployment service
          const { deployment, job } = await deploymentService.initiateFailover(id);
          
          request.log.info(`Deployment ${deployment.id} failover job ${job.id} queued`);
          
          return reply.code(202).send({
            id: deployment.id,
            jobId: job.id,
            message: 'Deployment failover has been queued'
          });
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Deployment not found' });
          }
          if (error.message.includes('failover region')) {
            return reply.code(400).send({ error: error.message });
          }
          if (error.message.includes('ACTIVE state')) {
            return reply.code(400).send({ error: error.message });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error initiating failover: ${error.message}`);
        reply.code(500).send({ error: 'Failed to initiate failover' });
      }
    }
  });
}

module.exports = routes;
