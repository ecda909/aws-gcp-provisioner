const {
  S3Client,
  CreateBucketCommand,
  PutBucketTaggingCommand,
  DeleteBucketCommand
} = require('@aws-sdk/client-s3');
const logger = require('../../utils/logger');

// Initialize AWS S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * AWS S3 Service for provisioning S3 buckets
 */
const s3Service = {
  /**
   * Create an S3 bucket
   * @param {Object} resource - Resource object from database
   * @param {Object} resource.config - Configuration for the S3 bucket
   * @param {string} [resource.config.bucketName] - Name of the bucket (defaults to resource.name if not provided)
   * @param {string} [resource.config.region] - AWS region for the bucket
   * @param {string} [resource.config.acl] - ACL for the bucket (defaults to 'private')
   * @returns {Promise<Object>} - Result of the creation
   */
  async createResource(resource) {
    logger.info(`Creating S3 bucket: ${resource.name}`);

    try {
      const { config } = resource;

      // Use bucketName from config or fallback to resource name
      const bucketName = config.bucketName || resource.name;

      // Prepare S3 bucket parameters
      const params = {
        Bucket: bucketName,
        ACL: config.acl || 'private'
      };

      // Add location constraint if provided
      if (config.region && config.region !== 'us-east-1') {
        params.CreateBucketConfiguration = {
          LocationConstraint: config.region
        };
      }

      // Create the S3 bucket
      const command = new CreateBucketCommand(params);
      await s3Client.send(command);

      // Add tags to the bucket
      const taggingCommand = new PutBucketTaggingCommand({
        Bucket: bucketName,
        Tagging: {
          TagSet: [
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
      });

      await s3Client.send(taggingCommand);

      return {
        resourceId: bucketName,
        metadata: {
          bucketName: bucketName,
          region: config.region || 'us-east-1',
          acl: config.acl || 'private',
          creationTime: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error(`Error creating S3 bucket: ${error.message}`);
      throw error;
    }
  },

  /**
   * Update an S3 bucket
   * @param {Object} resource - Resource object from database
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Result of the update
   */
  async updateResource(resource, updates) {
    logger.info(`Updating S3 bucket: ${resource.name}`);

    try {
      // Use resourceId if available, otherwise fall back to the original config or resource name
      const bucketName = resource.resourceId || resource.config.bucketName || resource.name;

      if (!bucketName) {
        throw new Error('S3 bucket name is missing');
      }

      // S3 buckets have limited update capabilities
      // For this example, we'll just update the tags

      const { config } = updates;

      // Update tags if provided
      if (config.tags) {
        const tagSet = Object.entries(config.tags).map(([key, value]) => ({
          Key: key,
          Value: value
        }));

        // Add default tags
        tagSet.push(
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
        );

        const taggingCommand = new PutBucketTaggingCommand({
          Bucket: bucketName,
          Tagging: {
            TagSet: tagSet
          }
        });

        await s3Client.send(taggingCommand);
      }

      return {
        resourceId: bucketName,
        metadata: {
          bucketName,
          region: resource.config.region || 'us-east-1',
          acl: resource.config.acl || 'private',
          updatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error(`Error updating S3 bucket: ${error.message}`);
      throw error;
    }
  },

  /**
   * Delete an S3 bucket
   * @param {Object} resource - Resource object from database
   * @returns {Promise<Object>} - Result of the deletion
   */
  async deleteResource(resource) {
    logger.info(`Deleting S3 bucket: ${resource.name}`);

    try {
      // Use resourceId if available, otherwise fall back to the original config or resource name
      const bucketName = resource.resourceId || resource.config.bucketName || resource.name;

      if (!bucketName) {
        throw new Error('S3 bucket name is missing');
      }

      // Delete the bucket
      const command = new DeleteBucketCommand({
        Bucket: bucketName
      });

      await s3Client.send(command);

      return {
        resourceId: bucketName,
        metadata: {
          deletionTime: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error(`Error deleting S3 bucket: ${error.message}`);
      throw error;
    }
  }
};

module.exports = s3Service;
