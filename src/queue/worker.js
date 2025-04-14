const dotenv = require('dotenv');
const Queue = require('bee-queue');
const prisma = require('../db');
const providerFactory = require('../services/providerFactory');
const jobService = require('../services/jobService');
const logger = require('../utils/logger');

// Load environment variables
dotenv.config();

// Configure queues for worker mode
const queueConfig = {
  redis: {
    host: process.env.QUEUE_HOST || '127.0.0.1',
    port: parseInt(process.env.QUEUE_PORT || '6379', 10),
    prefix: process.env.QUEUE_PREFIX || 'provisioner',
  },
  isWorker: true,
  removeOnSuccess: false,
  removeOnFailure: false,
};

// Create queues for different job types with worker mode enabled
const createResourceQueue = new Queue('create-resource', queueConfig);
const updateResourceQueue = new Queue('update-resource', queueConfig);
const deleteResourceQueue = new Queue('delete-resource', queueConfig);

// Process create resource jobs
createResourceQueue.process(async (job) => {
  logger.info(`Processing create job ${job.id} for resource ${job.data.resourceId}`);

  try {
    // Update job status to processing
    await jobService.updateJobStatus(job.data.jobId, 'PROCESSING');

    // Update resource status to creating
    await updateResourceStatus(job.data.resourceId, 'CREATING');

    // Get the resource from the database
    const resource = await prisma.resource.findUnique({
      where: { id: job.data.resourceId }
    });

    if (!resource) {
      throw new Error(`Resource ${job.data.resourceId} not found`);
    }

    // Provision the resource using the provider factory
    const result = await providerFactory.createResource(resource);

    // Update resource with provider's resource ID and status
    await prisma.resource.update({
      where: { id: resource.id },
      data: {
        resourceId: result.resourceId,
        status: 'ACTIVE',
        metadata: result.metadata || resource.metadata
      }
    });

    // Update job status to completed
    await jobService.updateJobStatus(job.data.jobId, 'COMPLETED', result);

    logger.info(`Successfully created resource ${resource.id}`);
    return result;
  } catch (error) {
    logger.error(`Error creating resource ${job.data.resourceId}: ${error.message}`);

    // Update resource status to failed
    await updateResourceStatus(job.data.resourceId, 'FAILED');

    // Update job status to failed
    await jobService.updateJobStatus(job.data.jobId, 'FAILED', null, error.message);

    throw error;
  }
});

// Process update resource jobs
updateResourceQueue.process(async (job) => {
  logger.info(`Processing update job ${job.id} for resource ${job.data.resourceId}`);

  try {
    // Update job status to processing
    await jobService.updateJobStatus(job.data.jobId, 'PROCESSING');

    // Update resource status to updating
    await updateResourceStatus(job.data.resourceId, 'UPDATING');

    // Get the resource from the database
    const resource = await prisma.resource.findUnique({
      where: { id: job.data.resourceId }
    });

    if (!resource) {
      throw new Error(`Resource ${job.data.resourceId} not found`);
    }

    // Update the resource using the provider factory
    const result = await providerFactory.updateResource(resource, job.data.updates);

    // Update resource with new config and status
    await prisma.resource.update({
      where: { id: resource.id },
      data: {
        config: job.data.updates.config || resource.config,
        status: 'ACTIVE',
        metadata: result.metadata || resource.metadata
      }
    });

    // Update job status to completed
    await jobService.updateJobStatus(job.data.jobId, 'COMPLETED', result);

    logger.info(`Successfully updated resource ${resource.id}`);
    return result;
  } catch (error) {
    logger.error(`Error updating resource ${job.data.resourceId}: ${error.message}`);

    // Update resource status to failed
    await updateResourceStatus(job.data.resourceId, 'FAILED');

    // Update job status to failed
    await jobService.updateJobStatus(job.data.jobId, 'FAILED', null, error.message);

    throw error;
  }
});

// Process delete resource jobs
deleteResourceQueue.process(async (job) => {
  logger.info(`Processing delete job ${job.id} for resource ${job.data.resourceId}`);

  try {
    // Update job status to processing
    await jobService.updateJobStatus(job.data.jobId, 'PROCESSING');

    // Update resource status to deleting
    await updateResourceStatus(job.data.resourceId, 'DELETING');

    // Get the resource from the database
    const resource = await prisma.resource.findUnique({
      where: { id: job.data.resourceId }
    });

    if (!resource) {
      throw new Error(`Resource ${job.data.resourceId} not found`);
    }

    // Delete the resource using the provider factory
    const result = await providerFactory.deleteResource(resource);

    // Update resource status to deleted
    await prisma.resource.update({
      where: { id: resource.id },
      data: {
        status: 'DELETED',
        metadata: result.metadata || resource.metadata
      }
    });

    // Update job status to completed
    await jobService.updateJobStatus(job.data.jobId, 'COMPLETED', result);

    logger.info(`Successfully deleted resource ${resource.id}`);
    return result;
  } catch (error) {
    logger.error(`Error deleting resource ${job.data.resourceId}: ${error.message}`);

    // Update resource status to failed
    await updateResourceStatus(job.data.resourceId, 'FAILED');

    // Update job status to failed
    await jobService.updateJobStatus(job.data.jobId, 'FAILED', null, error.message);

    throw error;
  }
});



// Helper function to update resource status
async function updateResourceStatus(resourceId, status) {
  return prisma.resource.update({
    where: { id: resourceId },
    data: {
      status,
      updatedAt: new Date()
    }
  });
}

// Handle worker events
createResourceQueue.on('ready', () => {
  logger.info('Create resource queue is ready to process jobs');
});

updateResourceQueue.on('ready', () => {
  logger.info('Update resource queue is ready to process jobs');
});

deleteResourceQueue.on('ready', () => {
  logger.info('Delete resource queue is ready to process jobs');
});

// Handle errors
createResourceQueue.on('error', (err) => {
  logger.error(`Create resource queue error: ${err.message}`);
});

updateResourceQueue.on('error', (err) => {
  logger.error(`Update resource queue error: ${err.message}`);
});

deleteResourceQueue.on('error', (err) => {
  logger.error(`Delete resource queue error: ${err.message}`);
});

// Log when the worker starts
logger.info('Worker process started');

// Handle process termination
process.on('SIGTERM', async () => {
  logger.info('Worker shutting down on SIGTERM');
  await createResourceQueue.close();
  await updateResourceQueue.close();
  await deleteResourceQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});

// Also handle SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  logger.info('Worker shutting down on SIGINT');
  await createResourceQueue.close();
  await updateResourceQueue.close();
  await deleteResourceQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});
