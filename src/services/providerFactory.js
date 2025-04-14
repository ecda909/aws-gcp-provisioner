const awsServiceFactory = require('./aws');
const gcpServiceFactory = require('./gcp');
const logger = require('../utils/logger');

/**
 * Provider Factory
 * Returns the appropriate cloud provider service based on provider type
 */
const providerFactory = {
  /**
   * Get the appropriate provider service
   * @param {string} provider - Provider type (AWS, GCP)
   * @returns {Object} - Provider service
   */
  getProviderService(provider) {
    switch (provider) {
      case 'AWS':
        return awsServiceFactory;
      case 'GCP':
        return gcpServiceFactory;
      default:
        logger.error(`Unsupported provider: ${provider}`);
        throw new Error(`Unsupported provider: ${provider}`);
    }
  },
  
  /**
   * Create a resource using the appropriate provider
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the creation
   */
  async createResource(resource) {
    const providerService = this.getProviderService(resource.provider);
    return providerService.createResource(resource);
  },
  
  /**
   * Update a resource using the appropriate provider
   * @param {Object} resource - Resource object from database
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Result of the update
   */
  async updateResource(resource, updates) {
    const providerService = this.getProviderService(resource.provider);
    return providerService.updateResource(resource, updates);
  },
  
  /**
   * Delete a resource using the appropriate provider
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the deletion
   */
  async deleteResource(resource) {
    const providerService = this.getProviderService(resource.provider);
    return providerService.deleteResource(resource);
  }
};

module.exports = providerFactory;
