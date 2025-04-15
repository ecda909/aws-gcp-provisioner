const prisma = require('../db');
const logger = require('../utils/logger');

/**
 * Template Service for managing deployment templates
 */
const templateService = {
  /**
   * Get all templates with optional filtering
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} - List of templates
   */
  async getAllTemplates(filters = {}) {
    try {
      const where = {};

      if (filters.provider) {
        where.provider = filters.provider;
      }

      return await prisma.template.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      logger.error(`Error getting templates: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get a template by ID
   * @param {string} id - Template ID
   * @returns {Promise<Object>} - Template object
   */
  async getTemplateById(id) {
    try {
      const template = await prisma.template.findUnique({
        where: { id },
        include: {
          deployments: {
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 5
          }
        }
      });

      if (!template) {
        throw new Error(`Template with ID ${id} not found`);
      }

      return template;
    } catch (error) {
      logger.error(`Error getting template by ID: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get a template by name
   * @param {string} name - Template name
   * @returns {Promise<Object>} - Template object
   */
  async getTemplateByName(name) {
    try {
      const template = await prisma.template.findUnique({
        where: { name },
        include: {
          deployments: {
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 5
          }
        }
      });

      if (!template) {
        throw new Error(`Template with name ${name} not found`);
      }

      return template;
    } catch (error) {
      logger.error(`Error getting template by name: ${error.message}`);
      throw error;
    }
  },

  /**
   * Create a new template
   * @param {Object} templateData - Template data
   * @returns {Promise<Object>} - Created template
   */
  async createTemplate(templateData) {
    try {
      // Validate template data
      if (!templateData.name) {
        throw new Error('Template name is required');
      }

      if (!templateData.provider) {
        throw new Error('Template provider is required');
      }

      if (!templateData.parameters || typeof templateData.parameters !== 'object') {
        throw new Error('Template parameters schema is required');
      }

      if (!templateData.resources || typeof templateData.resources !== 'object') {
        throw new Error('Template resources definition is required');
      }

      // Create template in database
      const template = await prisma.template.create({
        data: {
          name: templateData.name,
          description: templateData.description,
          version: templateData.version || '1.0.0',
          provider: templateData.provider,
          gitRepo: templateData.gitRepo,
          gitBranch: templateData.gitBranch,
          modulePath: templateData.modulePath,
          parameters: templateData.parameters,
          resources: templateData.resources
        }
      });

      logger.info(`Template ${template.id} created`);

      return template;
    } catch (error) {
      logger.error(`Error creating template: ${error.message}`);
      throw error;
    }
  },

  /**
   * Update a template
   * @param {string} id - Template ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Updated template
   */
  async updateTemplate(id, updates) {
    try {
      // Check if template exists
      const template = await prisma.template.findUnique({
        where: { id },
        include: {
          deployments: {
            select: { id: true }
          }
        }
      });

      if (!template) {
        throw new Error(`Template with ID ${id} not found`);
      }

      // If template has deployments, only allow certain updates
      if (template.deployments.length > 0) {
        const safeUpdates = {
          description: updates.description,
          version: updates.version
        };

        // Filter out undefined values
        Object.keys(safeUpdates).forEach(key => {
          if (safeUpdates[key] === undefined) {
            delete safeUpdates[key];
          }
        });

        const updatedTemplate = await prisma.template.update({
          where: { id },
          data: safeUpdates
        });

        logger.info(`Template ${updatedTemplate.id} safely updated`);
        return updatedTemplate;
      }

      // If no deployments, allow all updates
      const updatedTemplate = await prisma.template.update({
        where: { id },
        data: {
          name: updates.name,
          description: updates.description,
          version: updates.version,
          provider: updates.provider,
          gitRepo: updates.gitRepo,
          gitBranch: updates.gitBranch,
          modulePath: updates.modulePath,
          parameters: updates.parameters !== undefined ? updates.parameters : undefined,
          resources: updates.resources !== undefined ? updates.resources : undefined
        }
      });

      logger.info(`Template ${updatedTemplate.id} updated`);
      return updatedTemplate;
    } catch (error) {
      logger.error(`Error updating template: ${error.message}`);
      throw error;
    }
  },

  /**
   * Delete a template
   * @param {string} id - Template ID
   * @returns {Promise<Object>} - Deleted template
   */
  async deleteTemplate(id) {
    try {
      // Check if template exists
      const template = await prisma.template.findUnique({
        where: { id },
        include: {
          deployments: {
            select: { id: true }
          }
        }
      });

      if (!template) {
        throw new Error(`Template with ID ${id} not found`);
      }

      // Check if template has deployments
      if (template.deployments.length > 0) {
        throw new Error(`Cannot delete template with existing deployments`);
      }

      // Delete template
      const deletedTemplate = await prisma.template.delete({
        where: { id }
      });

      logger.info(`Template ${deletedTemplate.id} deleted`);
      return deletedTemplate;
    } catch (error) {
      logger.error(`Error deleting template: ${error.message}`);
      throw error;
    }
  },

  /**
   * Validate parameters against template schema
   * @param {Object} template - Template object
   * @param {Object} parameters - Parameters to validate
   * @returns {Object} - Validation result with errors if any
   */
  validateParameters(template, parameters) {
    const result = {
      valid: true,
      errors: []
    };

    // Get parameter schema from template
    const schema = template.parameters;

    // Check for required parameters
    if (schema.required && Array.isArray(schema.required)) {
      for (const requiredParam of schema.required) {
        if (parameters[requiredParam] === undefined) {
          result.valid = false;
          result.errors.push(`Missing required parameter: ${requiredParam}`);
        }
      }
    }

    // Check parameter types and constraints
    if (schema.properties) {
      for (const [paramName, paramSchema] of Object.entries(schema.properties)) {
        const paramValue = parameters[paramName];

        // Skip if parameter is not provided and not required
        if (paramValue === undefined) {
          continue;
        }

        // Check type
        if (paramSchema.type) {
          const typeValid = this.validateType(paramValue, paramSchema.type);
          if (!typeValid) {
            result.valid = false;
            result.errors.push(`Parameter ${paramName} should be of type ${paramSchema.type}`);
          }
        }

        // Check enum values
        if (paramSchema.enum && Array.isArray(paramSchema.enum)) {
          if (!paramSchema.enum.includes(paramValue)) {
            result.valid = false;
            result.errors.push(`Parameter ${paramName} should be one of: ${paramSchema.enum.join(', ')}`);
          }
        }

        // Check min/max for numbers
        if (paramSchema.type === 'number' || paramSchema.type === 'integer') {
          if (paramSchema.minimum !== undefined && paramValue < paramSchema.minimum) {
            result.valid = false;
            result.errors.push(`Parameter ${paramName} should be >= ${paramSchema.minimum}`);
          }
          if (paramSchema.maximum !== undefined && paramValue > paramSchema.maximum) {
            result.valid = false;
            result.errors.push(`Parameter ${paramName} should be <= ${paramSchema.maximum}`);
          }
        }

        // Check minLength/maxLength for strings
        if (paramSchema.type === 'string') {
          if (paramSchema.minLength !== undefined && paramValue.length < paramSchema.minLength) {
            result.valid = false;
            result.errors.push(`Parameter ${paramName} should have length >= ${paramSchema.minLength}`);
          }
          if (paramSchema.maxLength !== undefined && paramValue.length > paramSchema.maxLength) {
            result.valid = false;
            result.errors.push(`Parameter ${paramName} should have length <= ${paramSchema.maxLength}`);
          }
        }
      }
    }

    return result;
  },

  /**
   * Validate a value against a type
   * @param {any} value - Value to validate
   * @param {string} type - Type to validate against
   * @returns {boolean} - Whether the value matches the type
   */
  validateType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }
};

module.exports = templateService;
