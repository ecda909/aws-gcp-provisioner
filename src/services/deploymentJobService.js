const prisma = require('../db');
const logger = require('../utils/logger');

/**
 * Deployment Job Service for managing deployment jobs
 */
const deploymentJobService = {
  /**
   * Get all deployment jobs with optional filtering
   * @param {Object} filters - Optional filters
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} - Jobs and count
   */
  async getAllDeploymentJobs(filters = {}, pagination = { limit: 50, offset: 0 }) {
    try {
      const { deploymentId, status, type } = filters;
      const { limit, offset } = pagination;
      
      // Build where clause based on filters
      const where = {};
      if (deploymentId) where.deploymentId = deploymentId;
      if (status) where.status = status;
      if (type) where.type = type;
      
      // Get jobs with pagination
      const [jobs, total] = await Promise.all([
        prisma.deploymentJob.findMany({
          where,
          include: {
            deployment: {
              select: {
                name: true,
                templateId: true,
                template: {
                  select: {
                    name: true,
                    provider: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: offset,
          take: limit
        }),
        prisma.deploymentJob.count({ where })
      ]);
      
      return {
        jobs,
        total,
        limit,
        offset
      };
    } catch (error) {
      logger.error(`Error getting deployment jobs: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get a deployment job by ID
   * @param {string} id - Job ID
   * @returns {Promise<Object>} - Job object
   */
  async getDeploymentJobById(id) {
    try {
      const job = await prisma.deploymentJob.findUnique({
        where: { id },
        include: {
          deployment: {
            select: {
              id: true,
              name: true,
              templateId: true,
              status: true,
              template: {
                select: {
                  name: true,
                  provider: true
                }
              }
            }
          }
        }
      });
      
      if (!job) {
        throw new Error(`Deployment job with ID ${id} not found`);
      }
      
      return job;
    } catch (error) {
      logger.error(`Error getting deployment job by ID: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get jobs for a specific deployment
   * @param {string} deploymentId - Deployment ID
   * @returns {Promise<Array>} - List of jobs
   */
  async getJobsByDeploymentId(deploymentId) {
    try {
      // Check if deployment exists
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId }
      });
      
      if (!deployment) {
        throw new Error(`Deployment with ID ${deploymentId} not found`);
      }
      
      // Get jobs for the deployment
      return await prisma.deploymentJob.findMany({
        where: { deploymentId },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      logger.error(`Error getting jobs for deployment: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Create a new deployment job
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} - Created job
   */
  async createDeploymentJob(jobData) {
    try {
      return await prisma.deploymentJob.create({
        data: jobData
      });
    } catch (error) {
      logger.error(`Error creating deployment job: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Update deployment job status
   * @param {string} jobId - Job ID
   * @param {string} status - New status
   * @param {Object} result - Optional result data
   * @param {string} error - Optional error message
   * @returns {Promise<Object>} - Updated job
   */
  async updateDeploymentJobStatus(jobId, status, result = null, error = null) {
    try {
      return await prisma.deploymentJob.update({
        where: { id: jobId },
        data: {
          status,
          result: result ? result : undefined,
          error: error ? error : undefined,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      logger.error(`Error updating deployment job status: ${error.message}`);
      throw error;
    }
  }
};

module.exports = deploymentJobService;
