const compute = require('@google-cloud/compute');
const logger = require('../../utils/logger');

// Initialize GCP clients
const disksClient = new compute.DisksClient();
const zoneOperationsClient = new compute.ZoneOperationsClient();

/**
 * GCP Disk Service for provisioning Disk resources
 */
const diskService = {
  /**
   * Create a Disk
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the creation
   */
  async createResource(resource) {
    logger.info(`Creating GCP Disk: ${resource.name}`);
    
    try {
      const { config } = resource;
      
      // Validate required configuration
      if (!config.sizeGb) {
        throw new Error('Disk size is required');
      }
      
      if (!config.zone) {
        throw new Error('Zone is required');
      }
      
      if (!config.project) {
        throw new Error('Project ID is required');
      }
      
      // Prepare disk creation request
      const [projectId, zone] = [config.project, config.zone];
      
      const diskResource = {
        name: resource.name,
        sizeGb: config.sizeGb,
        type: `zones/${zone}/diskTypes/${config.diskType || 'pd-standard'}`,
        labels: {
          'managed-by': 'aws-gcp-provisioner',
          'resource-id': resource.id.replace(/-/g, '_') // GCP labels can't have dashes
        }
      };
      
      // Add source image if provided
      if (config.sourceImage) {
        diskResource.sourceImage = config.sourceImage;
      }
      
      // Create the disk
      const [response] = await disksClient.insert({
        project: projectId,
        zone,
        diskResource
      });
      
      // Wait for the operation to complete
      const operation = response.latestResponse;
      const operationName = operation.name;
      
      await waitForZoneOperation(projectId, zone, operationName);
      
      // Get the created disk details
      const [disk] = await disksClient.get({
        project: projectId,
        zone,
        disk: resource.name
      });
      
      return {
        resourceId: disk.id.toString(),
        metadata: {
          diskId: disk.id.toString(),
          name: disk.name,
          zone: disk.zone.split('/').pop(),
          sizeGb: disk.sizeGb,
          status: disk.status,
          type: disk.type.split('/').pop(),
          creationTimestamp: disk.creationTimestamp
        }
      };
    } catch (error) {
      logger.error(`Error creating GCP Disk: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Update a Disk
   * @param {Object} resource - Resource object from database
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Result of the update
   */
  async updateResource(resource, updates) {
    logger.info(`Updating GCP Disk: ${resource.name}`);
    
    try {
      const { config } = updates;
      const resourceConfig = resource.config;
      const diskId = resource.resourceId;
      
      if (!diskId) {
        throw new Error('Disk ID is missing');
      }
      
      if (!resourceConfig.project || !resourceConfig.zone) {
        throw new Error('Project ID and zone are required');
      }
      
      const [projectId, zone, diskName] = [
        resourceConfig.project, 
        resourceConfig.zone,
        resource.name
      ];
      
      // Get the current disk
      const [disk] = await disksClient.get({
        project: projectId,
        zone,
        disk: diskName
      });
      
      if (!disk) {
        throw new Error(`Disk ${diskName} not found`);
      }
      
      // Update disk size if provided
      if (config.sizeGb && config.sizeGb > disk.sizeGb) {
        const [response] = await disksClient.resize({
          project: projectId,
          zone,
          disk: diskName,
          disksResizeRequestResource: {
            sizeGb: config.sizeGb
          }
        });
        
        // Wait for the operation to complete
        const operation = response.latestResponse;
        await waitForZoneOperation(projectId, zone, operation.name);
      }
      
      // Update labels if provided
      if (config.labels) {
        const currentLabels = disk.labels || {};
        const newLabels = { ...currentLabels, ...config.labels };
        
        // Add required labels
        newLabels['managed-by'] = 'aws-gcp-provisioner';
        newLabels['resource-id'] = resource.id.replace(/-/g, '_');
        
        // Update the disk labels
        const [response] = await disksClient.setLabels({
          project: projectId,
          zone,
          resource: diskName,
          zoneSetLabelsRequestResource: {
            labels: newLabels,
            labelFingerprint: disk.labelFingerprint
          }
        });
        
        // Wait for the operation to complete
        const operation = response.latestResponse;
        await waitForZoneOperation(projectId, zone, operation.name);
      }
      
      // Get the updated disk
      const [updatedDisk] = await disksClient.get({
        project: projectId,
        zone,
        disk: diskName
      });
      
      return {
        resourceId: updatedDisk.id.toString(),
        metadata: {
          diskId: updatedDisk.id.toString(),
          name: updatedDisk.name,
          zone: updatedDisk.zone.split('/').pop(),
          sizeGb: updatedDisk.sizeGb,
          status: updatedDisk.status,
          type: updatedDisk.type.split('/').pop(),
          updateTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error(`Error updating GCP Disk: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Delete a Disk
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the deletion
   */
  async deleteResource(resource) {
    logger.info(`Deleting GCP Disk: ${resource.name}`);
    
    try {
      const resourceConfig = resource.config;
      const diskId = resource.resourceId;
      
      if (!diskId) {
        throw new Error('Disk ID is missing');
      }
      
      if (!resourceConfig.project || !resourceConfig.zone) {
        throw new Error('Project ID and zone are required');
      }
      
      const [projectId, zone, diskName] = [
        resourceConfig.project, 
        resourceConfig.zone,
        resource.name
      ];
      
      // Delete the disk
      const [response] = await disksClient.delete({
        project: projectId,
        zone,
        disk: diskName
      });
      
      // Wait for the operation to complete
      const operation = response.latestResponse;
      await waitForZoneOperation(projectId, zone, operation.name);
      
      return {
        resourceId: diskId,
        metadata: {
          deletionTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error(`Error deleting GCP Disk: ${error.message}`);
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

module.exports = diskService;
