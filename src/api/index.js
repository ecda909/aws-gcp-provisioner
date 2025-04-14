const resourceRoutes = require('./routes/resourceRoutes');
const jobRoutes = require('./routes/jobRoutes');

/**
 * Register all API routes
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Route options
 */
async function routes(fastify, options) {
  // Register routes
  fastify.register(resourceRoutes, { prefix: '/resources' });
  fastify.register(jobRoutes, { prefix: '/jobs' });
  
  // Root route
  fastify.get('/', {
    schema: {
      description: 'API root',
      tags: ['root'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            version: { type: 'string' },
            endpoints: { 
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    },
    handler: async (request, reply) => {
      return {
        message: 'AWS/GCP Provisioner API',
        version: '1.0.0',
        endpoints: [
          '/api/resources',
          '/api/jobs',
          '/health',
          '/documentation'
        ]
      };
    }
  });
}

module.exports = routes;
