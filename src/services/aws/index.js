const ec2Service = require('./ec2Service');
const s3Service = require('./s3Service');
const logger = require('../../utils/logger');

/**
 * AWS Service Factory
 * Returns the appropriate service based on resource type
 */
const awsServiceFactory = {
  /**
   * Get the appropriate service for the resource type
   * @param {string} resourceType - Type of resource
   * @returns {Object} - Service for the resource type
   */
  getService(resourceType) {
    switch (resourceType) {
      case 'EC2':
        return ec2Service;
      case 'S3':
        return s3Service;
      default:
        logger.error(`Unsupported AWS resource type: ${resourceType}`);
        throw new Error(`Unsupported AWS resource type: ${resourceType}`);
    }
  },
  
  /**
   * Create a resource in AWS
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the creation
   */
  async createResource(resource) {
    const service = this.getService(resource.type);
    return service.createResource(resource);
  },
  
  /**
   * Update a resource in AWS
   * @param {Object} resource - Resource object from database
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Result of the update
   */
  async updateResource(resource, updates) {
    const service = this.getService(resource.type);
    return service.updateResource(resource, updates);
  },
  
  /**
   * Delete a resource in AWS
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the deletion
   */
  async deleteResource(resource) {
    const service = this.getService(resource.type);
    return service.deleteResource(resource);
  }
};

module.exports = awsServiceFactory;
