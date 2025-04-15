const prisma = require('../db');
const { getQueueByJobType } = require('../queue');
const templateService = require('./templateService');
const logger = require('../utils/logger');

/**
 * Deployment Service for managing template-based deployments
 */
const deploymentService = {
  /**
   * Get all deployments with optional filtering
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} - List of deployments
   */
  async getAllDeployments(filters = {}) {
    try {
      const where = {};

      if (filters.templateId) {
        where.templateId = filters.templateId;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.isFailover !== undefined) {
        where.isFailover = filters.isFailover;
      }

      return await prisma.deployment.findMany({
        where,
        include: {
          template: {
            select: {
              id: true,
              name: true,
              provider: true
            }
          },
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
      logger.error(`Error getting deployments: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get a deployment by ID
   * @param {string} id - Deployment ID
   * @returns {Promise<Object>} - Deployment object
   */
  async getDeploymentById(id) {
    try {
      const deployment = await prisma.deployment.findUnique({
        where: { id },
        include: {
          template: true,
          resources: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              region: true,
              resourceId: true
            }
          },
          jobs: {
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });

      if (!deployment) {
        throw new Error(`Deployment with ID ${id} not found`);
      }

      return deployment;
    } catch (error) {
      logger.error(`Error getting deployment by ID: ${error.message}`);
      throw error;
    }
  },

  /**
   * Create a new deployment from a template
   * @param {Object} deploymentData - Deployment data
   * @returns {Promise<Object>} - Created deployment and job
   */
  async createDeployment(deploymentData) {
    try {
      // Get the template
      const template = await templateService.getTemplateById(deploymentData.templateId);

      // Validate parameters against template schema
      const validation = templateService.validateParameters(template, deploymentData.parameters);
      if (!validation.valid) {
        throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
      }

      // Create deployment in database
      const deployment = await prisma.deployment.create({
        data: {
          name: deploymentData.name,
          description: deploymentData.description,
          templateId: template.id,
          parameters: deploymentData.parameters,
          status: 'PENDING',
          primaryRegion: deploymentData.primaryRegion,
          failoverRegion: deploymentData.failoverRegion,
          isFailover: false
        }
      });

      // Create a job for the deployment
      const job = await prisma.deploymentJob.create({
        data: {
          deploymentId: deployment.id,
          type: 'CREATE',
          status: 'PENDING'
        }
      });

      // Add job to queue
      const queue = getQueueByJobType('CREATE');
      await queue.createJob({
        deploymentId: deployment.id,
        jobId: job.id,
        isDeployment: true
      }).save();

      logger.info(`Deployment ${deployment.id} created and job ${job.id} queued`);

      return { deployment, job };
    } catch (error) {
      logger.error(`Error creating deployment: ${error.message}`);
      throw error;
    }
  },

  /**
   * Update a deployment
   * @param {string} id - Deployment ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Updated deployment and job (if created)
   */
  async updateDeployment(id, updates) {
    try {
      // Check if deployment exists
      const deployment = await prisma.deployment.findUnique({
        where: { id },
        include: {
          template: true
        }
      });

      if (!deployment) {
        throw new Error(`Deployment with ID ${id} not found`);
      }

      // Check if deployment can be updated
      if (['DELETED', 'DELETING'].includes(deployment.status)) {
        throw new Error(`Deployment cannot be updated in ${deployment.status} state`);
      }

      // Update basic deployment info in database
      const updatedDeployment = await prisma.deployment.update({
        where: { id },
        data: {
          name: updates.name || deployment.name,
          description: updates.description !== undefined ? updates.description : deployment.description,
          failoverRegion: updates.failoverRegion !== undefined ? updates.failoverRegion : deployment.failoverRegion
        }
      });

      // If parameters are being updated, create a job
      if (updates.parameters) {
        // Validate parameters against template schema
        const validation = templateService.validateParameters(deployment.template, updates.parameters);
        if (!validation.valid) {
          throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
        }

        // Update parameters in database
        await prisma.deployment.update({
          where: { id },
          data: {
            parameters: updates.parameters,
            status: 'PENDING'
          }
        });

        // Create a job for the deployment update
        const job = await prisma.deploymentJob.create({
          data: {
            deploymentId: deployment.id,
            type: 'UPDATE',
            status: 'PENDING'
          }
        });

        // Add job to queue
        const queue = getQueueByJobType('UPDATE');
        await queue.createJob({
          deploymentId: deployment.id,
          jobId: job.id,
          isDeployment: true,
          updates: {
            parameters: updates.parameters
          }
        }).save();

        logger.info(`Deployment ${deployment.id} update job ${job.id} queued`);

        return { deployment: updatedDeployment, job };
      }

      return { deployment: updatedDeployment };
    } catch (error) {
      logger.error(`Error updating deployment: ${error.message}`);
      throw error;
    }
  },

  /**
   * Delete a deployment
   * @param {string} id - Deployment ID
   * @returns {Promise<Object>} - Deleted deployment and job
   */
  async deleteDeployment(id) {
    try {
      // Check if deployment exists
      const deployment = await prisma.deployment.findUnique({
        where: { id }
      });

      if (!deployment) {
        throw new Error(`Deployment with ID ${id} not found`);
      }

      // Check if deployment can be deleted
      if (['DELETED', 'DELETING'].includes(deployment.status)) {
        throw new Error(`Deployment is already in ${deployment.status} state`);
      }

      // Update deployment status
      await prisma.deployment.update({
        where: { id },
        data: {
          status: 'DELETING'
        }
      });

      // Create a job for the deployment deletion
      const job = await prisma.deploymentJob.create({
        data: {
          deploymentId: deployment.id,
          type: 'DELETE',
          status: 'PENDING'
        }
      });

      // Add job to queue
      const queue = getQueueByJobType('DELETE');
      await queue.createJob({
        deploymentId: deployment.id,
        jobId: job.id,
        isDeployment: true
      }).save();

      logger.info(`Deployment ${deployment.id} deletion job ${job.id} queued`);

      return { deployment, job };
    } catch (error) {
      logger.error(`Error deleting deployment: ${error.message}`);
      throw error;
    }
  },

  /**
   * Initiate failover for a deployment
   * @param {string} id - Deployment ID
   * @returns {Promise<Object>} - Deployment and job
   */
  async initiateFailover(id) {
    try {
      // Check if deployment exists
      const deployment = await prisma.deployment.findUnique({
        where: { id },
        include: {
          resources: true
        }
      });

      if (!deployment) {
        throw new Error(`Deployment with ID ${id} not found`);
      }

      // Check if deployment has a failover region
      if (!deployment.failoverRegion) {
        throw new Error(`Deployment does not have a failover region configured`);
      }

      // Check if deployment is active
      if (deployment.status !== 'ACTIVE') {
        throw new Error(`Deployment must be in ACTIVE state to initiate failover`);
      }

      // Create a job for the deployment failover
      const job = await prisma.deploymentJob.create({
        data: {
          deploymentId: deployment.id,
          type: 'FAILOVER',
          status: 'PENDING'
        }
      });

      // Add job to queue
      const queue = getQueueByJobType('CREATE'); // Reuse the CREATE queue for failover
      await queue.createJob({
        deploymentId: deployment.id,
        jobId: job.id,
        isDeployment: true,
        isFailover: true,
        targetRegion: deployment.failoverRegion
      }).save();

      logger.info(`Deployment ${deployment.id} failover job ${job.id} queued`);

      return { deployment, job };
    } catch (error) {
      logger.error(`Error initiating failover: ${error.message}`);
      throw error;
    }
  }
};

module.exports = deploymentService;
