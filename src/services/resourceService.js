const prisma = require('../db');
const { getQueueByJobType } = require('../queue');
const providerFactory = require('./providerFactory');
const logger = require('../utils/logger');

/**
 * Resource Service for managing resources
 */
const resourceService = {
  /**
   * Get all resources
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} - List of resources
   */
  async getAllResources(filters = {}) {
    try {
      const where = {};

      if (filters.provider) {
        where.provider = filters.provider;
      }

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      return await prisma.resource.findMany({
        where,
        include: {
          jobs: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      logger.error(`Error getting resources: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get a resource by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} - Resource object
   */
  async getResourceById(id) {
    try {
      const resource = await prisma.resource.findUnique({
        where: { id },
        include: {
          jobs: {
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });

      if (!resource) {
        throw new Error(`Resource with ID ${id} not found`);
      }

      return resource;
    } catch (error) {
      logger.error(`Error getting resource by ID: ${error.message}`);
      throw error;
    }
  },

  /**
   * Create a new resource
   * @param {Object} resourceData - Resource data
   * @returns {Promise<Object>} - Created resource and job
   */
  async createResource(resourceData) {
    try {
      // Create resource in database
      const resource = await prisma.resource.create({
        data: {
          name: resourceData.name,
          description: resourceData.description,
          provider: resourceData.provider,
          type: resourceData.type,
          config: resourceData.config,
          status: 'PENDING'
        }
      });

      // Create a job for the resource
      const job = await prisma.job.create({
        data: {
          resourceId: resource.id,
          type: 'CREATE',
          status: 'PENDING'
        }
      });

      // Add job to queue
      const queue = getQueueByJobType('CREATE');
      await queue.createJob({
        resourceId: resource.id,
        jobId: job.id
      }).save();

      logger.info(`Resource ${resource.id} created and job ${job.id} queued`);

      return { resource, job };
    } catch (error) {
      logger.error(`Error creating resource: ${error.message}`);
      throw error;
    }
  },

  /**
   * Update a resource
   * @param {string} id - Resource ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Updated resource and job (if created)
   */
  async updateResource(id, updates) {
    try {
      // Check if resource exists
      const resource = await prisma.resource.findUnique({
        where: { id }
      });

      if (!resource) {
        throw new Error(`Resource with ID ${id} not found`);
      }

      // Check if resource can be updated
      if (['DELETED', 'DELETING'].includes(resource.status)) {
        throw new Error(`Resource cannot be updated in ${resource.status} state`);
      }

      // Update basic resource info in database
      const updatedResource = await prisma.resource.update({
        where: { id },
        data: {
          name: updates.name || resource.name,
          description: updates.description !== undefined ? updates.description : resource.description
        }
      });

      // If config is being updated, create a job
      if (updates.config) {
        // Create a job for the resource update
        const job = await prisma.job.create({
          data: {
            resourceId: resource.id,
            type: 'UPDATE',
            status: 'PENDING'
          }
        });

        // Add job to queue
        const queue = getQueueByJobType('UPDATE');
        await queue.createJob({
          resourceId: resource.id,
          jobId: job.id,
          updates: {
            config: updates.config
          }
        }).save();

        logger.info(`Resource ${resource.id} update job ${job.id} queued`);

        return { resource: updatedResource, job };
      }

      return { resource: updatedResource };
    } catch (error) {
      logger.error(`Error updating resource: ${error.message}`);
      throw error;
    }
  },

  /**
   * Delete a resource
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} - Deleted resource and job
   */
  async deleteResource(id) {
    try {
      // Check if resource exists
      const resource = await prisma.resource.findUnique({
        where: { id }
      });

      if (!resource) {
        throw new Error(`Resource with ID ${id} not found`);
      }

      // Check if resource can be deleted
      if (['DELETED', 'DELETING'].includes(resource.status)) {
        throw new Error(`Resource is already in ${resource.status} state`);
      }

      // Create a job for the resource deletion
      const job = await prisma.job.create({
        data: {
          resourceId: resource.id,
          type: 'DELETE',
          status: 'PENDING'
        }
      });

      // Add job to queue
      const queue = getQueueByJobType('DELETE');
      await queue.createJob({
        resourceId: resource.id,
        jobId: job.id
      }).save();

      logger.info(`Resource ${resource.id} deletion job ${job.id} queued`);

      return { resource, job };
    } catch (error) {
      logger.error(`Error deleting resource: ${error.message}`);
      throw error;
    }
  }
};

module.exports = resourceService;
