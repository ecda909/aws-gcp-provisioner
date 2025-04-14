const prisma = require('../db');
const logger = require('../utils/logger');

/**
 * Job Service for managing jobs
 */
const jobService = {
  /**
   * Get all jobs with optional filtering
   * @param {Object} filters - Optional filters
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} - Jobs and count
   */
  async getAllJobs(filters = {}, pagination = { limit: 50, offset: 0 }) {
    try {
      const { resourceId, status, type } = filters;
      const { limit, offset } = pagination;
      
      // Build where clause based on filters
      const where = {};
      if (resourceId) where.resourceId = resourceId;
      if (status) where.status = status;
      if (type) where.type = type;
      
      // Get jobs with pagination
      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          include: {
            resource: {
              select: {
                name: true,
                provider: true,
                type: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: offset,
          take: limit
        }),
        prisma.job.count({ where })
      ]);
      
      return {
        jobs,
        total,
        limit,
        offset
      };
    } catch (error) {
      logger.error(`Error getting jobs: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get a job by ID
   * @param {string} id - Job ID
   * @returns {Promise<Object>} - Job object
   */
  async getJobById(id) {
    try {
      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          resource: {
            select: {
              id: true,
              name: true,
              provider: true,
              type: true,
              status: true
            }
          }
        }
      });
      
      if (!job) {
        throw new Error(`Job with ID ${id} not found`);
      }
      
      return job;
    } catch (error) {
      logger.error(`Error getting job by ID: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get jobs for a specific resource
   * @param {string} resourceId - Resource ID
   * @returns {Promise<Array>} - List of jobs
   */
  async getJobsByResourceId(resourceId) {
    try {
      // Check if resource exists
      const resource = await prisma.resource.findUnique({
        where: { id: resourceId }
      });
      
      if (!resource) {
        throw new Error(`Resource with ID ${resourceId} not found`);
      }
      
      // Get jobs for the resource
      return await prisma.job.findMany({
        where: { resourceId },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      logger.error(`Error getting jobs for resource: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Create a new job
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} - Created job
   */
  async createJob(jobData) {
    try {
      return await prisma.job.create({
        data: jobData
      });
    } catch (error) {
      logger.error(`Error creating job: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Update job status
   * @param {string} jobId - Job ID
   * @param {string} status - New status
   * @param {Object} result - Optional result data
   * @param {string} error - Optional error message
   * @returns {Promise<Object>} - Updated job
   */
  async updateJobStatus(jobId, status, result = null, error = null) {
    try {
      return await prisma.job.update({
        where: { id: jobId },
        data: {
          status,
          result: result ? result : undefined,
          error: error ? error : undefined,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      logger.error(`Error updating job status: ${error.message}`);
      throw error;
    }
  }
};

module.exports = jobService;
