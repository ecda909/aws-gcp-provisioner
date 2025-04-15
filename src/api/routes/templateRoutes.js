const templateService = require('../../services/templateService');

/**
 * Template routes
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Route options
 */
async function routes(fastify, options) {
  // Get all templates
  fastify.get('/', {
    schema: {
      description: 'Get all templates',
      tags: ['templates'],
      querystring: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['AWS', 'GCP'] }
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
              version: { type: 'string' },
              provider: { type: 'string', enum: ['AWS', 'GCP'] },
              gitRepo: { type: 'string' },
              gitBranch: { type: 'string' },
              modulePath: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { provider } = request.query;
        
        // Get templates using template service
        const templates = await templateService.getAllTemplates({ provider });
        
        return templates;
      } catch (error) {
        request.log.error(`Error fetching templates: ${error.message}`);
        reply.code(500).send({ error: 'Failed to fetch templates' });
      }
    }
  });
  
  // Get a template by ID
  fastify.get('/:id', {
    schema: {
      description: 'Get a template by ID',
      tags: ['templates'],
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
            version: { type: 'string' },
            provider: { type: 'string', enum: ['AWS', 'GCP'] },
            gitRepo: { type: 'string' },
            gitBranch: { type: 'string' },
            modulePath: { type: 'string' },
            parameters: { type: 'object' },
            resources: { type: 'object' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deployments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  status: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' }
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
          // Get template using template service
          const template = await templateService.getTemplateById(id);
          return template;
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Template not found' });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error fetching template: ${error.message}`);
        reply.code(500).send({ error: 'Failed to fetch template' });
      }
    }
  });
  
  // Create a new template
  fastify.post('/', {
    schema: {
      description: 'Create a new template',
      tags: ['templates'],
      body: {
        type: 'object',
        required: ['name', 'provider', 'parameters', 'resources'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          version: { type: 'string' },
          provider: { type: 'string', enum: ['AWS', 'GCP'] },
          gitRepo: { type: 'string' },
          gitBranch: { type: 'string' },
          modulePath: { type: 'string' },
          parameters: { type: 'object' },
          resources: { type: 'object' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const templateData = request.body;
        
        // Create template using template service
        const template = await templateService.createTemplate(templateData);
        
        request.log.info(`Template ${template.id} created`);
        
        return reply.code(201).send({
          id: template.id,
          name: template.name,
          message: 'Template created successfully'
        });
      } catch (error) {
        request.log.error(`Error creating template: ${error.message}`);
        reply.code(500).send({ error: 'Failed to create template' });
      }
    }
  });
  
  // Update a template
  fastify.put('/:id', {
    schema: {
      description: 'Update a template',
      tags: ['templates'],
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
          version: { type: 'string' },
          provider: { type: 'string', enum: ['AWS', 'GCP'] },
          gitRepo: { type: 'string' },
          gitBranch: { type: 'string' },
          modulePath: { type: 'string' },
          parameters: { type: 'object' },
          resources: { type: 'object' }
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
          // Update template using template service
          const template = await templateService.updateTemplate(id, updates);
          
          request.log.info(`Template ${template.id} updated`);
          
          return {
            id: template.id,
            message: 'Template updated successfully'
          };
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Template not found' });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error updating template: ${error.message}`);
        reply.code(500).send({ error: 'Failed to update template' });
      }
    }
  });
  
  // Delete a template
  fastify.delete('/:id', {
    schema: {
      description: 'Delete a template',
      tags: ['templates'],
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
          // Delete template using template service
          const template = await templateService.deleteTemplate(id);
          
          request.log.info(`Template ${template.id} deleted`);
          
          return {
            id: template.id,
            message: 'Template deleted successfully'
          };
        } catch (error) {
          if (error.message.includes('not found')) {
            return reply.code(404).send({ error: 'Template not found' });
          }
          if (error.message.includes('existing deployments')) {
            return reply.code(400).send({ error: error.message });
          }
          throw error;
        }
      } catch (error) {
        request.log.error(`Error deleting template: ${error.message}`);
        reply.code(500).send({ error: 'Failed to delete template' });
      }
    }
  });
}

module.exports = routes;
