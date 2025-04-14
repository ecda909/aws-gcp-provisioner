const jobService = require('../../services/jobService');

/**
 * Job routes
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Route options
 */
async function routes(fastify, options) {
  // Get all jobs
  fastify.get('/', {
    schema: {
      description: 'Get all jobs',
      tags: ['jobs'],
      querystring: {
        type: 'object',
        properties: {
          resourceId: { type: 'string' },
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] },
          type: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE'] },
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            jobs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  resourceId: { type: 'string' },
                  type: { type: 'string' },
                  status: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
                }
              }
            },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { resourceId, status, type, limit = 50, offset = 0 } = request.query;

        // Get jobs with pagination using job service
        const result = await jobService.getAllJobs(
          { resourceId, status, type },
          { limit: parseInt(limit), offset: parseInt(offset) }
        );

        return result;
      } catch (error) {
        request.log.error(`Error fetching jobs: ${error.message}`);
        reply.code(500).send({ error: 'Failed to fetch jobs' });
      }
    }
  });

  // Get a job by ID
  fastify.get('/:id', {
    schema: {
      description: 'Get a job by ID',
      tags: ['jobs'],
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
            resourceId: { type: 'string' },
            type: { type: 'string' },
            status: { type: 'string' },
            result: { type: 'object' },
            error: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            resource: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                provider: { type: 'string' },
                type: { type: 'string' },
                status: { type: 'string' }
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
          const job = await jobService.getJobById(id);
          return job;
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Job not found' });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error fetching job: ${error.message}`);
        reply.code(500).send({ error: 'Failed to fetch job' });
      }
    }
  });

  // Get jobs for a specific resource
  fastify.get('/resource/:resourceId', {
    schema: {
      description: 'Get jobs for a specific resource',
      tags: ['jobs'],
      params: {
        type: 'object',
        required: ['resourceId'],
        properties: {
          resourceId: { type: 'string' }
        }
      },
      response: {
        200: {
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
        const { resourceId } = request.params;

        try {
          const jobs = await jobService.getJobsByResourceId(resourceId);
          return jobs;
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Resource not found' });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error fetching jobs for resource: ${error.message}`);
        reply.code(500).send({ error: 'Failed to fetch jobs' });
      }
    }
  });
}

module.exports = routes;
