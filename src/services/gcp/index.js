const computeEngineService = require('./computeEngineService');
const diskService = require('./diskService');
const logger = require('../../utils/logger');

/**
 * GCP Service Factory
 * Returns the appropriate service based on resource type
 */
const gcpServiceFactory = {
  /**
   * Get the appropriate service for the resource type
   * @param {string} resourceType - Type of resource
   * @returns {Object} - Service for the resource type
   */
  getService(resourceType) {
    switch (resourceType) {
      case 'ComputeEngine':
        return computeEngineService;
      case 'Disk':
        return diskService;
      default:
        logger.error(`Unsupported GCP resource type: ${resourceType}`);
        throw new Error(`Unsupported GCP resource type: ${resourceType}`);
    }
  },
  
  /**
   * Create a resource in GCP
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the creation
   */
  async createResource(resource) {
    const service = this.getService(resource.type);
    return service.createResource(resource);
  },
  
  /**
   * Update a resource in GCP
   * @param {Object} resource - Resource object from database
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Result of the update
   */
  async updateResource(resource, updates) {
    const service = this.getService(resource.type);
    return service.updateResource(resource, updates);
  },
  
  /**
   * Delete a resource in GCP
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the deletion
   */
  async deleteResource(resource) {
    const service = this.getService(resource.type);
    return service.deleteResource(resource);
  }
};

module.exports = gcpServiceFactory;
