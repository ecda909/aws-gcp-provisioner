const { 
  EC2Client, 
  RunInstancesCommand,
  DescribeInstancesCommand,
  ModifyInstanceAttributeCommand,
  TerminateInstancesCommand
} = require('@aws-sdk/client-ec2');
const logger = require('../../utils/logger');

// Initialize AWS EC2 client
const ec2Client = new EC2Client({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * AWS EC2 Service for provisioning EC2 instances
 */
const ec2Service = {
  /**
   * Create an EC2 instance
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the creation
   */
  async createResource(resource) {
    logger.info(`Creating EC2 instance: ${resource.name}`);
    
    try {
      const { config } = resource;
      
      // Validate required configuration
      if (!config.instanceType) {
        throw new Error('EC2 instance type is required');
      }
      
      if (!config.imageId) {
        throw new Error('EC2 image ID is required');
      }
      
      // Prepare EC2 instance parameters
      const params = {
        ImageId: config.imageId,
        InstanceType: config.instanceType,
        MinCount: 1,
        MaxCount: 1,
        TagSpecifications: [
          {
            ResourceType: 'instance',
            Tags: [
              {
                Key: 'Name',
                Value: resource.name
              },
              {
                Key: 'ManagedBy',
                Value: 'aws-gcp-provisioner'
              },
              {
                Key: 'ResourceId',
                Value: resource.id
              }
            ]
          }
        ]
      };
      
      // Add optional parameters if provided
      if (config.keyName) {
        params.KeyName = config.keyName;
      }
      
      if (config.securityGroupIds && Array.isArray(config.securityGroupIds)) {
        params.SecurityGroupIds = config.securityGroupIds;
      }
      
      if (config.subnetId) {
        params.SubnetId = config.subnetId;
      }
      
      if (config.userData) {
        params.UserData = Buffer.from(config.userData).toString('base64');
      }
      
      // Create the EC2 instance
      const command = new RunInstancesCommand(params);
      const response = await ec2Client.send(command);
      
      // Extract instance information
      const instance = response.Instances[0];
      
      return {
        resourceId: instance.InstanceId,
        metadata: {
          instanceId: instance.InstanceId,
          privateIpAddress: instance.PrivateIpAddress,
          publicIpAddress: instance.PublicIpAddress,
          state: instance.State.Name,
          launchTime: instance.LaunchTime.toISOString()
        }
      };
    } catch (error) {
      logger.error(`Error creating EC2 instance: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Update an EC2 instance
   * @param {Object} resource - Resource object from database
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Result of the update
   */
  async updateResource(resource, updates) {
    logger.info(`Updating EC2 instance: ${resource.name}`);
    
    try {
      const instanceId = resource.resourceId;
      
      if (!instanceId) {
        throw new Error('EC2 instance ID is missing');
      }
      
      // Check instance status
      const describeCommand = new DescribeInstancesCommand({
        InstanceIds: [instanceId]
      });
      
      const describeResponse = await ec2Client.send(describeCommand);
      
      if (!describeResponse.Reservations || 
          !describeResponse.Reservations[0] || 
          !describeResponse.Reservations[0].Instances || 
          !describeResponse.Reservations[0].Instances[0]) {
        throw new Error(`EC2 instance ${instanceId} not found`);
      }
      
      const instance = describeResponse.Reservations[0].Instances[0];
      const state = instance.State.Name;
      
      if (state !== 'running') {
        throw new Error(`EC2 instance ${instanceId} is not in running state (current: ${state})`);
      }
      
      // Apply updates
      const { config } = updates;
      const updatePromises = [];
      
      // Update instance type if provided
      if (config.instanceType && config.instanceType !== resource.config.instanceType) {
        const modifyTypeCommand = new ModifyInstanceAttributeCommand({
          InstanceId: instanceId,
          InstanceType: { Value: config.instanceType }
        });
        
        updatePromises.push(ec2Client.send(modifyTypeCommand));
      }
      
      // Update user data if provided
      if (config.userData && config.userData !== resource.config.userData) {
        const modifyUserDataCommand = new ModifyInstanceAttributeCommand({
          InstanceId: instanceId,
          UserData: { Value: Buffer.from(config.userData).toString('base64') }
        });
        
        updatePromises.push(ec2Client.send(modifyUserDataCommand));
      }
      
      // Wait for all updates to complete
      await Promise.all(updatePromises);
      
      // Get updated instance information
      const updatedDescribeCommand = new DescribeInstancesCommand({
        InstanceIds: [instanceId]
      });
      
      const updatedDescribeResponse = await ec2Client.send(updatedDescribeCommand);
      const updatedInstance = updatedDescribeResponse.Reservations[0].Instances[0];
      
      return {
        resourceId: instanceId,
        metadata: {
          instanceId: updatedInstance.InstanceId,
          privateIpAddress: updatedInstance.PrivateIpAddress,
          publicIpAddress: updatedInstance.PublicIpAddress,
          state: updatedInstance.State.Name,
          instanceType: updatedInstance.InstanceType
        }
      };
    } catch (error) {
      logger.error(`Error updating EC2 instance: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Delete an EC2 instance
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the deletion
   */
  async deleteResource(resource) {
    logger.info(`Deleting EC2 instance: ${resource.name}`);
    
    try {
      const instanceId = resource.resourceId;
      
      if (!instanceId) {
        throw new Error('EC2 instance ID is missing');
      }
      
      // Terminate the instance
      const command = new TerminateInstancesCommand({
        InstanceIds: [instanceId]
      });
      
      const response = await ec2Client.send(command);
      
      // Extract termination information
      const terminatingInstance = response.TerminatingInstances[0];
      
      return {
        resourceId: instanceId,
        metadata: {
          previousState: terminatingInstance.PreviousState.Name,
          currentState: terminatingInstance.CurrentState.Name,
          terminationTime: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error(`Error deleting EC2 instance: ${error.message}`);
      throw error;
    }
  }
};

module.exports = ec2Service;
