const compute = require('@google-cloud/compute');
const logger = require('../../utils/logger');

// Initialize GCP clients
const instancesClient = new compute.InstancesClient();
const zoneOperationsClient = new compute.ZoneOperationsClient();

/**
 * GCP Compute Engine Service for provisioning Compute Engine instances
 */
const computeEngineService = {
  /**
   * Create a Compute Engine instance
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the creation
   */
  async createResource(resource) {
    logger.info(`Creating Compute Engine instance: ${resource.name}`);
    
    try {
      const { config } = resource;
      
      // Validate required configuration
      if (!config.machineType) {
        throw new Error('Machine type is required');
      }
      
      if (!config.sourceImage) {
        throw new Error('Source image is required');
      }
      
      if (!config.zone) {
        throw new Error('Zone is required');
      }
      
      if (!config.project) {
        throw new Error('Project ID is required');
      }
      
      // Prepare instance creation request
      const [projectId, zone] = [config.project, config.zone];
      
      const instanceResource = {
        name: resource.name,
        machineType: `zones/${zone}/machineTypes/${config.machineType}`,
        disks: [
          {
            boot: true,
            autoDelete: true,
            initializeParams: {
              sourceImage: config.sourceImage,
              diskSizeGb: config.diskSizeGb || '10'
            }
          }
        ],
        networkInterfaces: [
          {
            network: 'global/networks/default',
            accessConfigs: [
              {
                name: 'External NAT',
                type: 'ONE_TO_ONE_NAT'
              }
            ]
          }
        ],
        metadata: {
          items: [
            {
              key: 'managed-by',
              value: 'aws-gcp-provisioner'
            },
            {
              key: 'resource-id',
              value: resource.id
            }
          ]
        },
        tags: {
          items: [
            'http-server',
            'https-server'
          ]
        }
      };
      
      // Add startup script if provided
      if (config.startupScript) {
        instanceResource.metadata.items.push({
          key: 'startup-script',
          value: config.startupScript
        });
      }
      
      // Create the instance
      const [response] = await instancesClient.insert({
        project: projectId,
        zone,
        instanceResource
      });
      
      // Wait for the operation to complete
      const operation = response.latestResponse;
      const operationName = operation.name;
      
      await waitForZoneOperation(projectId, zone, operationName);
      
      // Get the created instance details
      const [instance] = await instancesClient.get({
        project: projectId,
        zone,
        instance: resource.name
      });
      
      // Extract network interfaces
      const networkInterfaces = instance.networkInterfaces || [];
      const networkInterface = networkInterfaces[0] || {};
      const accessConfigs = networkInterface.accessConfigs || [];
      const accessConfig = accessConfigs[0] || {};
      
      return {
        resourceId: instance.id.toString(),
        metadata: {
          instanceId: instance.id.toString(),
          name: instance.name,
          zone: instance.zone.split('/').pop(),
          machineType: instance.machineType.split('/').pop(),
          status: instance.status,
          internalIp: networkInterface.networkIP,
          externalIp: accessConfig.natIP,
          creationTimestamp: instance.creationTimestamp
        }
      };
    } catch (error) {
      logger.error(`Error creating Compute Engine instance: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Update a Compute Engine instance
   * @param {Object} resource - Resource object from database
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Result of the update
   */
  async updateResource(resource, updates) {
    logger.info(`Updating Compute Engine instance: ${resource.name}`);
    
    try {
      const { config } = updates;
      const resourceConfig = resource.config;
      const instanceId = resource.resourceId;
      
      if (!instanceId) {
        throw new Error('Compute Engine instance ID is missing');
      }
      
      if (!resourceConfig.project || !resourceConfig.zone) {
        throw new Error('Project ID and zone are required');
      }
      
      const [projectId, zone, instanceName] = [
        resourceConfig.project, 
        resourceConfig.zone,
        resource.name
      ];
      
      // Get the current instance
      const [instance] = await instancesClient.get({
        project: projectId,
        zone,
        instance: instanceName
      });
      
      if (!instance) {
        throw new Error(`Instance ${instanceName} not found`);
      }
      
      // Check if instance is running
      if (instance.status !== 'RUNNING') {
        throw new Error(`Instance ${instanceName} is not running (current status: ${instance.status})`);
      }
      
      // Update metadata if provided
      if (config.metadata) {
        const currentMetadata = instance.metadata || { items: [] };
        const newItems = [];
        
        // Keep existing metadata items that are not being updated
        for (const item of currentMetadata.items || []) {
          if (!config.metadata[item.key]) {
            newItems.push(item);
          }
        }
        
        // Add new metadata items
        for (const [key, value] of Object.entries(config.metadata)) {
          newItems.push({ key, value });
        }
        
        // Add required metadata
        newItems.push(
          {
            key: 'managed-by',
            value: 'aws-gcp-provisioner'
          },
          {
            key: 'resource-id',
            value: resource.id
          }
        );
        
        // Update the instance metadata
        const [response] = await instancesClient.setMetadata({
          project: projectId,
          zone,
          instance: instanceName,
          metadataResource: {
            items: newItems,
            fingerprint: currentMetadata.fingerprint
          }
        });
        
        // Wait for the operation to complete
        const operation = response.latestResponse;
        await waitForZoneOperation(projectId, zone, operation.name);
      }
      
      // Get the updated instance
      const [updatedInstance] = await instancesClient.get({
        project: projectId,
        zone,
        instance: instanceName
      });
      
      // Extract network interfaces
      const networkInterfaces = updatedInstance.networkInterfaces || [];
      const networkInterface = networkInterfaces[0] || {};
      const accessConfigs = networkInterface.accessConfigs || [];
      const accessConfig = accessConfigs[0] || {};
      
      return {
        resourceId: updatedInstance.id.toString(),
        metadata: {
          instanceId: updatedInstance.id.toString(),
          name: updatedInstance.name,
          zone: updatedInstance.zone.split('/').pop(),
          machineType: updatedInstance.machineType.split('/').pop(),
          status: updatedInstance.status,
          internalIp: networkInterface.networkIP,
          externalIp: accessConfig.natIP,
          updateTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error(`Error updating Compute Engine instance: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Delete a Compute Engine instance
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the deletion
   */
  async deleteResource(resource) {
    logger.info(`Deleting Compute Engine instance: ${resource.name}`);
    
    try {
      const resourceConfig = resource.config;
      const instanceId = resource.resourceId;
      
      if (!instanceId) {
        throw new Error('Compute Engine instance ID is missing');
      }
      
      if (!resourceConfig.project || !resourceConfig.zone) {
        throw new Error('Project ID and zone are required');
      }
      
      const [projectId, zone, instanceName] = [
        resourceConfig.project, 
        resourceConfig.zone,
        resource.name
      ];
      
      // Delete the instance
      const [response] = await instancesClient.delete({
        project: projectId,
        zone,
        instance: instanceName
      });
      
      // Wait for the operation to complete
      const operation = response.latestResponse;
      await waitForZoneOperation(projectId, zone, operation.name);
      
      return {
        resourceId: instanceId,
        metadata: {
          deletionTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error(`Error deleting Compute Engine instance: ${error.message}`);
      throw error;
    }
  }
};

/**
 * Wait for a zone operation to complete
 * @param {string} projectId - GCP project ID
 * @param {string} zone - GCP zone
 * @param {string} operationName - Operation name
 * @returns {Promise<void>}
 */
async function waitForZoneOperation(projectId, zone, operationName) {
  let operation;
  const operationPollInterval = 1000; // 1 second
  const maxWaitTime = 300000; // 5 minutes
  const startTime = Date.now();
  
  do {
    [operation] = await zoneOperationsClient.get({
      project: projectId,
      zone,
      operation: operationName
    });
    
    if (operation.status === 'DONE') {
      if (operation.error) {
        throw new Error(`Operation failed: ${JSON.stringify(operation.error)}`);
      }
      return;
    }
    
    // Check if we've exceeded the maximum wait time
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error(`Operation timed out after ${maxWaitTime / 1000} seconds`);
    }
    
    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, operationPollInterval));
  } while (operation.status !== 'DONE');
}

module.exports = computeEngineService;
