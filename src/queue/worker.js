const dotenv = require('dotenv');
const Queue = require('bee-queue');
const prisma = require('../db');
const providerFactory = require('../services/providerFactory');
const jobService = require('../services/jobService');
const deploymentJobService = require('../services/deploymentJobService');
const templateService = require('../services/templateService');
const terraformService = require('../services/terraform/terraformService');
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
  // Check if this is a deployment job
  if (job.data.isDeployment) {
    return await processDeploymentJob(job);
  }

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
  // Check if this is a deployment job
  if (job.data.isDeployment) {
    return await processDeploymentUpdateJob(job);
  }

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
  // Check if this is a deployment job
  if (job.data.isDeployment) {
    return await processDeploymentDeleteJob(job);
  }

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

// Helper function to update deployment status
async function updateDeploymentStatus(deploymentId, status) {
  return prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status,
      updatedAt: new Date()
    }
  });
}

// Process deployment creation job
async function processDeploymentJob(job) {
  logger.info(`Processing deployment job ${job.id} for deployment ${job.data.deploymentId}`);

  try {
    // Update job status to processing
    await deploymentJobService.updateDeploymentJobStatus(job.data.jobId, 'PROCESSING');

    // Update deployment status to creating
    await updateDeploymentStatus(job.data.deploymentId, 'CREATING');

    // Get the deployment from the database
    const deployment = await prisma.deployment.findUnique({
      where: { id: job.data.deploymentId },
      include: {
        template: true
      }
    });

    if (!deployment) {
      throw new Error(`Deployment ${job.data.deploymentId} not found`);
    }

    // Determine the target region
    const targetRegion = job.data.isFailover ? job.data.targetRegion : deployment.primaryRegion;

    // Create Terraform configuration directory
    const configDir = await terraformService.createConfigDir(
      deployment.id,
      deployment.template,
      deployment.parameters,
      targetRegion
    );

    // Initialize Terraform
    await terraformService.init(configDir);

    // Create Terraform plan
    const planFile = 'deployment.tfplan';
    await terraformService.plan(configDir, planFile, deployment.parameters);

    // Apply Terraform plan
    const applyResult = await terraformService.apply(configDir, planFile);

    // Get Terraform outputs
    const outputs = await terraformService.getOutputs(configDir);

    // Create resources in the database based on Terraform outputs
    const resources = [];
    for (const [resourceName, resourceOutput] of Object.entries(outputs.resources.value)) {
      // Create resource in database
      const resource = await prisma.resource.create({
        data: {
          name: `${deployment.name}-${resourceName}`,
          description: `Created by deployment ${deployment.name}`,
          provider: deployment.template.provider,
          type: resourceOutput.type || 'TerraformResource',
          config: resourceOutput.config || {},
          resourceId: resourceOutput.id || null,
          status: 'ACTIVE',
          metadata: resourceOutput,
          deploymentId: deployment.id,
          region: targetRegion
        }
      });

      resources.push(resource);
    }

    // Update deployment status to active
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'ACTIVE',
        metadata: {
          terraformOutputs: outputs,
          resources: resources.map(r => ({ id: r.id, name: r.name, type: r.type }))
        }
      }
    });

    // Update job status to completed
    await deploymentJobService.updateDeploymentJobStatus(job.data.jobId, 'COMPLETED', {
      resources: resources.map(r => ({ id: r.id, name: r.name, type: r.type })),
      outputs
    });

    logger.info(`Successfully created deployment ${deployment.id}`);
    return { deployment, resources };
  } catch (error) {
    logger.error(`Error creating deployment ${job.data.deploymentId}: ${error.message}`);

    // Update deployment status to failed
    await updateDeploymentStatus(job.data.deploymentId, 'FAILED');

    // Update job status to failed
    await deploymentJobService.updateDeploymentJobStatus(job.data.jobId, 'FAILED', null, error.message);

    throw error;
  }
}

// Process deployment update job
async function processDeploymentUpdateJob(job) {
  logger.info(`Processing deployment update job ${job.id} for deployment ${job.data.deploymentId}`);

  try {
    // Update job status to processing
    await deploymentJobService.updateDeploymentJobStatus(job.data.jobId, 'PROCESSING');

    // Update deployment status to updating
    await updateDeploymentStatus(job.data.deploymentId, 'UPDATING');

    // Get the deployment from the database
    const deployment = await prisma.deployment.findUnique({
      where: { id: job.data.deploymentId },
      include: {
        template: true,
        resources: true
      }
    });

    if (!deployment) {
      throw new Error(`Deployment ${job.data.deploymentId} not found`);
    }

    // Update deployment parameters
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        parameters: job.data.updates.parameters || deployment.parameters
      }
    });

    // Create Terraform configuration directory with updated parameters
    const configDir = await terraformService.createConfigDir(
      deployment.id,
      deployment.template,
      job.data.updates.parameters || deployment.parameters,
      deployment.primaryRegion
    );

    // Initialize Terraform
    await terraformService.init(configDir);

    // Create Terraform plan
    const planFile = 'deployment.tfplan';
    await terraformService.plan(configDir, planFile, job.data.updates.parameters || deployment.parameters);

    // Apply Terraform plan
    const applyResult = await terraformService.apply(configDir, planFile);

    // Get Terraform outputs
    const outputs = await terraformService.getOutputs(configDir);

    // Update resources in the database based on Terraform outputs
    const updatedResources = [];
    for (const [resourceName, resourceOutput] of Object.entries(outputs.resources.value)) {
      // Find existing resource or create new one
      const existingResource = deployment.resources.find(r => r.name === `${deployment.name}-${resourceName}`);

      if (existingResource) {
        // Update existing resource
        const resource = await prisma.resource.update({
          where: { id: existingResource.id },
          data: {
            config: resourceOutput.config || existingResource.config,
            resourceId: resourceOutput.id || existingResource.resourceId,
            status: 'ACTIVE',
            metadata: resourceOutput
          }
        });

        updatedResources.push(resource);
      } else {
        // Create new resource
        const resource = await prisma.resource.create({
          data: {
            name: `${deployment.name}-${resourceName}`,
            description: `Created by deployment ${deployment.name}`,
            provider: deployment.template.provider,
            type: resourceOutput.type || 'TerraformResource',
            config: resourceOutput.config || {},
            resourceId: resourceOutput.id || null,
            status: 'ACTIVE',
            metadata: resourceOutput,
            deploymentId: deployment.id,
            region: deployment.primaryRegion
          }
        });

        updatedResources.push(resource);
      }
    }

    // Update deployment status to active
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'ACTIVE',
        metadata: {
          terraformOutputs: outputs,
          resources: updatedResources.map(r => ({ id: r.id, name: r.name, type: r.type }))
        }
      }
    });

    // Update job status to completed
    await deploymentJobService.updateDeploymentJobStatus(job.data.jobId, 'COMPLETED', {
      resources: updatedResources.map(r => ({ id: r.id, name: r.name, type: r.type })),
      outputs
    });

    logger.info(`Successfully updated deployment ${deployment.id}`);
    return { deployment, resources: updatedResources };
  } catch (error) {
    logger.error(`Error updating deployment ${job.data.deploymentId}: ${error.message}`);

    // Update deployment status to failed
    await updateDeploymentStatus(job.data.deploymentId, 'FAILED');

    // Update job status to failed
    await deploymentJobService.updateDeploymentJobStatus(job.data.jobId, 'FAILED', null, error.message);

    throw error;
  }
}

// Process deployment delete job
async function processDeploymentDeleteJob(job) {
  logger.info(`Processing deployment delete job ${job.id} for deployment ${job.data.deploymentId}`);

  try {
    // Update job status to processing
    await deploymentJobService.updateDeploymentJobStatus(job.data.jobId, 'PROCESSING');

    // Update deployment status to deleting
    await updateDeploymentStatus(job.data.deploymentId, 'DELETING');

    // Get the deployment from the database
    const deployment = await prisma.deployment.findUnique({
      where: { id: job.data.deploymentId },
      include: {
        template: true,
        resources: true
      }
    });

    if (!deployment) {
      throw new Error(`Deployment ${job.data.deploymentId} not found`);
    }

    // Create Terraform configuration directory
    const configDir = await terraformService.createConfigDir(
      deployment.id,
      deployment.template,
      deployment.parameters,
      deployment.primaryRegion
    );

    // Initialize Terraform
    await terraformService.init(configDir);

    // Destroy Terraform-managed infrastructure
    const destroyResult = await terraformService.destroy(configDir, deployment.parameters);

    // Update resources to deleted status
    for (const resource of deployment.resources) {
      await prisma.resource.update({
        where: { id: resource.id },
        data: {
          status: 'DELETED'
        }
      });
    }

    // Update deployment status to deleted
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'DELETED'
      }
    });

    // Update job status to completed
    await deploymentJobService.updateDeploymentJobStatus(job.data.jobId, 'COMPLETED', {
      message: 'Deployment and all resources successfully deleted'
    });

    logger.info(`Successfully deleted deployment ${deployment.id}`);
    return { message: 'Deployment and all resources successfully deleted' };
  } catch (error) {
    logger.error(`Error deleting deployment ${job.data.deploymentId}: ${error.message}`);

    // Update deployment status to failed
    await updateDeploymentStatus(job.data.deploymentId, 'FAILED');

    // Update job status to failed
    await deploymentJobService.updateDeploymentJobStatus(job.data.jobId, 'FAILED', null, error.message);

    throw error;
  }
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
