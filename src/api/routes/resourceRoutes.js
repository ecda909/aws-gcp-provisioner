const resourceService = require('../../services/resourceService');

/**
 * Resource routes
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Route options
 */
async function routes(fastify, options) {
  // Get all resources
  fastify.get('/', {
    schema: {
      description: 'Get all resources',
      tags: ['resources'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              provider: { type: 'string', enum: ['AWS', 'GCP'] },
              type: { type: 'string' },
              status: { type: 'string' },
              resourceId: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const resources = await resourceService.getAllResources();
        return resources;
      } catch (error) {
        request.log.error(`Error fetching resources: ${error.message}`);
        reply.code(500).send({ error: 'Failed to fetch resources' });
      }
    }
  });

  // Get a resource by ID
  fastify.get('/:id', {
    schema: {
      description: 'Get a resource by ID',
      tags: ['resources'],
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
            provider: { type: 'string', enum: ['AWS', 'GCP'] },
            type: { type: 'string' },
            status: { type: 'string' },
            config: { type: 'object' },
            metadata: { type: 'object' },
            resourceId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            jobs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  status: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
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
          const resource = await resourceService.getResourceById(id);
          return resource;
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Resource not found' });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error fetching resource: ${error.message}`);
        reply.code(500).send({ error: 'Failed to fetch resource' });
      }
    }
  });

  // Create a new resource
  fastify.post('/', {
    schema: {
      description: 'Create a new resource',
      tags: ['resources'],
      body: {
        type: 'object',
        required: ['name', 'provider', 'type', 'config'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          provider: { type: 'string', enum: ['AWS', 'GCP'] },
          type: { type: 'string' },
          config: { type: 'object' }
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
        const { name, description, provider, type, config } = request.body;

        // Create resource using the service
        const { resource, job } = await resourceService.createResource({
          name,
          description,
          provider,
          type,
          config
        });

        request.log.info(`Resource ${resource.id} created and job ${job.id} queued`);

        return reply.code(202).send({
          id: resource.id,
          name: resource.name,
          jobId: job.id,
          message: 'Resource creation has been queued'
        });
      } catch (error) {
        request.log.error(`Error creating resource: ${error.message}`);
        reply.code(500).send({ error: 'Failed to create resource' });
      }
    }
  });

  // Update a resource
  fastify.put('/:id', {
    schema: {
      description: 'Update a resource',
      tags: ['resources'],
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
          config: { type: 'object' }
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
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { id } = request.params;
        const updates = request.body;

        try {
          // Update resource using the service
          const result = await resourceService.updateResource(id, updates);

          // If a job was created (config update), return 202 Accepted
          if (result.job) {
            request.log.info(`Resource ${result.resource.id} update job ${result.job.id} queued`);

            return reply.code(202).send({
              id: result.resource.id,
              jobId: result.job.id,
              message: 'Resource update has been queued'
            });
          } else {
            // If only metadata was updated, return 200 OK
            return reply.code(200).send({
              id: result.resource.id,
              message: 'Resource metadata updated successfully'
            });
          }
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Resource not found' });
          }
          if (error.message.includes('cannot be updated')) {
            return reply.code(400).send({ error: error.message });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error updating resource: ${error.message}`);
        reply.code(500).send({ error: 'Failed to update resource' });
      }
    }
  });

  // Delete a resource
  fastify.delete('/:id', {
    schema: {
      description: 'Delete a resource',
      tags: ['resources'],
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
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { id } = request.params;

        try {
          // Delete resource using the service
          const { resource, job } = await resourceService.deleteResource(id);

          request.log.info(`Resource ${resource.id} deletion job ${job.id} queued`);

          return reply.code(202).send({
            id: resource.id,
            jobId: job.id,
            message: 'Resource deletion has been queued'
          });
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Resource not found' });
          }
          if (error.message.includes('already in')) {
            return reply.code(400).send({ error: error.message });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error deleting resource: ${error.message}`);
        reply.code(500).send({ error: 'Failed to delete resource' });
      }
    }
  });
}

module.exports = routes;
