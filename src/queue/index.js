const Queue = require('bee-queue');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Queue configuration
const queueConfig = {
  redis: {
    host: process.env.QUEUE_HOST || '127.0.0.1',
    port: parseInt(process.env.QUEUE_PORT || '6379', 10),
    prefix: process.env.QUEUE_PREFIX || 'provisioner',
  },
  isWorker: false, // Set to true for worker processes
  removeOnSuccess: false, // Keep completed jobs for auditing
  removeOnFailure: false, // Keep failed jobs for debugging
};

// Create queues for different job types
const createResourceQueue = new Queue('create-resource', queueConfig);
const updateResourceQueue = new Queue('update-resource', queueConfig);
const deleteResourceQueue = new Queue('delete-resource', queueConfig);

// Export the queues
module.exports = {
  createResourceQueue,
  updateResourceQueue,
  deleteResourceQueue,
  
  // Helper function to get the appropriate queue based on job type
  getQueueByJobType: (jobType) => {
    switch (jobType) {
      case 'CREATE':
        return createResourceQueue;
      case 'UPDATE':
        return updateResourceQueue;
      case 'DELETE':
        return deleteResourceQueue;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
  }
};
