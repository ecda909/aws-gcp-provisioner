/**
 * Terraform service for managing deployments
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
let prisma;
try {
  prisma = new PrismaClient();
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  process.exit(1);
}
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const git = require('simple-git');
const AWS = require('aws-sdk');
const { Compute } = require('@google-cloud/compute');
const { Storage } = require('@google-cloud/storage');

// Base directory for Terraform operations
const TERRAFORM_DIR = path.join(process.cwd(), 'terraform-workspaces');

/**
 * Initialize the workspace directory
 */
async function initWorkspace() {
  try {
    await fs.mkdir(TERRAFORM_DIR, { recursive: true });
  } catch (error) {
    console.error('Error initializing workspace:', error);
    throw error;
  }
}

/**
 * Clone the Terraform repository
 * @param {string} repoUrl - Git repository URL
 * @param {string} branch - Git branch
 * @param {string} workspacePath - Path to clone the repository to
 */
async function cloneRepository(repoUrl, branch, workspacePath) {
  try {
    // Get Git credentials from environment variables
    const gitUsername = process.env.GIT_USERNAME || 'ecda909';
    const gitPat = process.env.GIT_PAT || 'youtoken';

    // Add credentials to the URL if available
    let repoUrlWithAuth = repoUrl;
    if (gitUsername && gitPat && repoUrl.startsWith('https://')) {
      const urlParts = repoUrl.split('//');
      repoUrlWithAuth = `https://${gitUsername}:${gitPat}@${urlParts[1]}`;
    }

    await git().clone(repoUrlWithAuth, workspacePath, ['--branch', branch, '--single-branch']);
    console.log(`Repository cloned to ${workspacePath}`);
  } catch (error) {
    console.error('Error cloning repository:', error);
    throw error;
  }
}

/**
 * Create Terraform variables file
 * @param {object} parameters - Terraform variables
 * @param {string} workspacePath - Path to the workspace
 */
async function createTerraformVars(parameters, workspacePath) {
  try {
    let varsContent = '';

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        varsContent += `${key} = "${value}"\n`;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        varsContent += `${key} = ${value}\n`;
      } else if (Array.isArray(value)) {
        varsContent += `${key} = [${value.map(v => typeof v === 'string' ? `"${v}"` : v).join(', ')}]\n`;
      } else if (typeof value === 'object' && value !== null) {
        varsContent += `${key} = ${JSON.stringify(value)}\n`;
      }
    }

    await fs.writeFile(path.join(workspacePath, 'terraform.tfvars'), varsContent);
    console.log('Terraform variables file created');
  } catch (error) {
    console.error('Error creating Terraform variables file:', error);
    throw error;
  }
}

/**
 * Set up cloud provider credentials
 * @param {object} credentials - Cloud provider credentials
 * @param {string} provider - Cloud provider (AWS or GCP)
 */
async function setupCredentials(credentials, provider) {
  try {
    if (provider === 'AWS') {
      AWS.config.update({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        region: credentials.region || 'us-east-1'
      });

      // Set environment variables for Terraform AWS provider
      process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;

      console.log('AWS credentials configured');
    } else if (provider === 'GCP') {
      // Create a temporary service account key file
      const keyFilePath = path.join(TERRAFORM_DIR, 'gcp-key.json');
      await fs.writeFile(keyFilePath, JSON.stringify(credentials));

      // Set environment variable for Terraform GCP provider
      process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilePath;

      console.log('GCP credentials configured');
    }
  } catch (error) {
    console.error('Error setting up credentials:', error);
    throw error;
  }
}

/**
 * Run Terraform commands
 * @param {string} command - Terraform command to run
 * @param {string} workspacePath - Path to the workspace
 */
async function runTerraformCommand(command, workspacePath) {
  try {
    console.log(`Running Terraform command: ${command}`);
    const { stdout, stderr } = await execPromise(`cd ${workspacePath} && terraform ${command}`);
    console.log('Terraform command output:', stdout);
    if (stderr) console.error('Terraform command error:', stderr);
    return stdout;
  } catch (error) {
    console.error(`Error running Terraform command ${command}:`, error);
    throw error;
  }
}

/**
 * Parse Terraform outputs
 * @param {string} outputString - Terraform output string
 * @returns {object} Parsed outputs
 */
function parseTerraformOutput(outputString) {
  try {
    return JSON.parse(outputString);
  } catch (error) {
    console.error('Error parsing Terraform output:', error);
    return {};
  }
}

/**
 * Deploy Terraform resources
 * @param {string} deploymentId - Deployment ID
 */
async function deploy(deploymentId) {
  console.log(`Starting deployment for ${deploymentId}`);

  try {
    // Update deployment status
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'RUNNING' }
    });

    // Update operation log
    await prisma.operationLog.updateMany({
      where: {
        deploymentId,
        operation: 'DEPLOY',
        status: 'PENDING'
      },
      data: { status: 'RUNNING' }
    });

    // Get deployment details
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { credential: true }
    });

    if (!deployment) {
      throw new Error('Deployment not found');
    }

    // Initialize workspace
    await initWorkspace();

    // Create workspace directory for this deployment
    const workspacePath = path.join(TERRAFORM_DIR, deploymentId);
    await fs.mkdir(workspacePath, { recursive: true });

    // Clone repository
    await cloneRepository(deployment.gitRepo, deployment.gitBranch, workspacePath);

    // Set up credentials
    await setupCredentials(deployment.credential.credentials, deployment.provider);

    // Map region names if needed
    let mappedRegion = deployment.region;
    if (deployment.provider === 'AWS' && !deployment.region.startsWith('us-east-') && !deployment.region.startsWith('us-west-')) {
      // Map GCP regions to AWS regions
      const regionMap = {
        'us-central1': 'us-east-1',
        'us-east4': 'us-east-1',
        'us-west1': 'us-west-1',
        'us-west2': 'us-west-2',
        'us-west3': 'us-west-2',
        'us-west4': 'us-west-2',
        'europe-west1': 'eu-west-1',
        'europe-west2': 'eu-west-2',
        'europe-west3': 'eu-central-1',
        'asia-east1': 'ap-northeast-1',
        'asia-northeast1': 'ap-northeast-1',
        'asia-southeast1': 'ap-southeast-1'
      };
      mappedRegion = regionMap[deployment.region] || 'us-east-1';
    } else if (deployment.provider === 'GCP' && !deployment.region.includes('central') && !deployment.region.includes('east4')) {
      // Map AWS regions to GCP regions
      const regionMap = {
        'us-east-1': 'us-east4',
        'us-east-2': 'us-east4',
        'us-west-1': 'us-west1',
        'us-west-2': 'us-west2',
        'eu-west-1': 'europe-west1',
        'eu-west-2': 'europe-west2',
        'eu-central-1': 'europe-west3',
        'ap-northeast-1': 'asia-northeast1',
        'ap-southeast-1': 'asia-southeast1'
      };
      mappedRegion = regionMap[deployment.region] || 'us-east4';
    }

    // Create Terraform variables file
    const parameters = {
      ...deployment.parameters,
      region: mappedRegion
    };

    // Add project_id for GCP if not present
    if (deployment.provider === 'GCP' && !parameters.project_id) {
      parameters.project_id = deployment.credential.credentials.projectId || 'blankcut';
    }

    // Navigate to the Terraform module directory
    const terraformModulePath = path.join(workspacePath, deployment.terraformPath);

    // Create Terraform variables file
    await createTerraformVars(parameters, terraformModulePath);

    // Initialize Terraform
    await runTerraformCommand('init', terraformModulePath);

    // Apply Terraform configuration
    await runTerraformCommand('apply -auto-approve', terraformModulePath);

    // Get Terraform outputs
    const outputString = await runTerraformCommand('output -json', terraformModulePath);
    const outputs = parseTerraformOutput(outputString);

    // Update deployment with outputs
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'COMPLETED',
        outputs
      }
    });

    // Update operation log
    await prisma.operationLog.updateMany({
      where: {
        deploymentId,
        operation: 'DEPLOY',
        status: 'RUNNING'
      },
      data: {
        status: 'COMPLETED',
        details: { outputs }
      }
    });

    console.log(`Deployment ${deploymentId} completed successfully`);
  } catch (error) {
    console.error(`Deployment ${deploymentId} failed:`, error);

    // Update deployment status
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'FAILED' }
    });

    // Update operation log
    await prisma.operationLog.updateMany({
      where: {
        deploymentId,
        operation: 'DEPLOY',
        status: 'RUNNING'
      },
      data: {
        status: 'FAILED',
        details: { error: error.message }
      }
    });
  }
}

/**
 * Switch region for a deployment
 * @param {string} deploymentId - Deployment ID
 * @param {string} newRegion - New region
 */
async function switchRegion(deploymentId, newRegion) {
  console.log(`Starting region switch for ${deploymentId} to ${newRegion}`);

  try {
    // Update deployment status
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'RUNNING' }
    });

    // Update operation log
    await prisma.operationLog.updateMany({
      where: {
        deploymentId,
        operation: 'SWITCH_REGION',
        status: 'PENDING'
      },
      data: { status: 'RUNNING' }
    });

    // Get deployment details
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { credential: true }
    });

    if (!deployment) {
      throw new Error('Deployment not found');
    }

    // Initialize workspace
    await initWorkspace();

    // Create workspace directory for this deployment
    const workspacePath = path.join(TERRAFORM_DIR, deploymentId);

    // Check if workspace exists, if not clone repository
    try {
      await fs.access(workspacePath);
    } catch (error) {
      await fs.mkdir(workspacePath, { recursive: true });
      await cloneRepository(deployment.gitRepo, deployment.gitBranch, workspacePath);
    }

    // Set up credentials
    await setupCredentials(deployment.credential.credentials, deployment.provider);

    // Map region names if needed
    let mappedRegion = newRegion;
    if (deployment.provider === 'AWS' && !newRegion.startsWith('us-east-') && !newRegion.startsWith('us-west-')) {
      // Map GCP regions to AWS regions
      const regionMap = {
        'us-central1': 'us-east-1',
        'us-east4': 'us-east-1',
        'us-west1': 'us-west-1',
        'us-west2': 'us-west-2',
        'us-west3': 'us-west-2',
        'us-west4': 'us-west-2',
        'europe-west1': 'eu-west-1',
        'europe-west2': 'eu-west-2',
        'europe-west3': 'eu-central-1',
        'asia-east1': 'ap-northeast-1',
        'asia-northeast1': 'ap-northeast-1',
        'asia-southeast1': 'ap-southeast-1'
      };
      mappedRegion = regionMap[newRegion] || 'us-east-1';
    } else if (deployment.provider === 'GCP' && !newRegion.includes('central') && !newRegion.includes('east4')) {
      // Map AWS regions to GCP regions
      const regionMap = {
        'us-east-1': 'us-east4',
        'us-east-2': 'us-east4',
        'us-west-1': 'us-west1',
        'us-west-2': 'us-west2',
        'eu-west-1': 'europe-west1',
        'eu-west-2': 'europe-west2',
        'eu-central-1': 'europe-west3',
        'ap-northeast-1': 'asia-northeast1',
        'ap-southeast-1': 'asia-southeast1'
      };
      mappedRegion = regionMap[newRegion] || 'us-east4';
    }

    // Create Terraform variables file with mapped region
    const parameters = {
      ...deployment.parameters,
      region: mappedRegion
    };

    // Navigate to the Terraform module directory
    const terraformModulePath = path.join(workspacePath, deployment.terraformPath);

    // Create Terraform variables file
    await createTerraformVars(parameters, terraformModulePath);

    // Initialize Terraform
    await runTerraformCommand('init', terraformModulePath);

    // Destroy existing resources
    await runTerraformCommand('destroy -auto-approve', terraformModulePath);

    // Apply Terraform configuration with new region
    await runTerraformCommand('apply -auto-approve', terraformModulePath);

    // Get Terraform outputs
    const outputString = await runTerraformCommand('output -json', terraformModulePath);
    const outputs = parseTerraformOutput(outputString);

    // Update deployment with new region and outputs
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'COMPLETED',
        region: newRegion,
        outputs
      }
    });

    // Update operation log
    await prisma.operationLog.updateMany({
      where: {
        deploymentId,
        operation: 'SWITCH_REGION',
        status: 'RUNNING'
      },
      data: {
        status: 'COMPLETED',
        details: {
          oldRegion: deployment.region,
          newRegion,
          outputs
        }
      }
    });

    console.log(`Region switch for ${deploymentId} to ${newRegion} completed successfully`);
  } catch (error) {
    console.error(`Region switch for ${deploymentId} failed:`, error);

    // Update deployment status
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'FAILED' }
    });

    // Update operation log
    await prisma.operationLog.updateMany({
      where: {
        deploymentId,
        operation: 'SWITCH_REGION',
        status: 'RUNNING'
      },
      data: {
        status: 'FAILED',
        details: { error: error.message }
      }
    });
  }
}

/**
 * Failover to another provider
 * @param {string} deploymentId - Deployment ID
 * @param {string} newProvider - New provider (AWS or GCP)
 * @param {string} newRegion - New region
 * @param {object} request - Request object containing credentialId
 */
async function failover(deploymentId, newProvider, newRegion, request = {}) {
  console.log(`Starting failover for ${deploymentId} to ${newProvider}/${newRegion}`);

  try {
    // Update deployment status
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'RUNNING' }
    });

    // Update operation log
    await prisma.operationLog.updateMany({
      where: {
        deploymentId,
        operation: 'FAILOVER',
        status: 'PENDING'
      },
      data: { status: 'RUNNING' }
    });

    // Get deployment details
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { credential: true }
    });

    if (!deployment) {
      throw new Error('Deployment not found');
    }

    // Initialize workspace
    await initWorkspace();

    // Create workspace directory for this deployment
    const workspacePath = path.join(TERRAFORM_DIR, deploymentId);

    // Check if workspace exists, if not clone repository
    try {
      await fs.access(workspacePath);
    } catch (error) {
      await fs.mkdir(workspacePath, { recursive: true });
      await cloneRepository(deployment.gitRepo, deployment.gitBranch, workspacePath);
    }

    // Set up credentials for current provider
    await setupCredentials(deployment.credential.credentials, deployment.provider);

    // Navigate to the current Terraform module directory
    const currentTerraformPath = path.join(workspacePath, deployment.terraformPath);

    // Destroy existing resources
    await runTerraformCommand('init', currentTerraformPath);
    await runTerraformCommand('destroy -auto-approve', currentTerraformPath);

    // Determine new Terraform module path based on new provider
    let newTerraformPath;
    if (newProvider === 'AWS') {
      newTerraformPath = deployment.terraformPath.replace(/\/gcp\//i, '/aws/');
    } else {
      newTerraformPath = deployment.terraformPath.replace(/\/aws\//i, '/gcp/');
    }

    // Get the appropriate credential for the new provider
    let credential;
    if (request.body && request.body.credentialId) {
      credential = await prisma.credential.findUnique({
        where: { id: request.body.credentialId }
      });
    } else {
      credential = deployment.credential;
    }

    // Set up credentials for new provider
    await setupCredentials(credential.credentials, newProvider);

    // Map region names between providers if needed
    let mappedRegion = newRegion;
    if (newProvider === 'AWS' && !newRegion.startsWith('us-east-') && !newRegion.startsWith('us-west-')) {
      // Map GCP regions to AWS regions
      const regionMap = {
        'us-central1': 'us-east-1',
        'us-east4': 'us-east-1',
        'us-west1': 'us-west-1',
        'us-west2': 'us-west-2',
        'us-west3': 'us-west-2',
        'us-west4': 'us-west-2',
        'europe-west1': 'eu-west-1',
        'europe-west2': 'eu-west-2',
        'europe-west3': 'eu-central-1',
        'asia-east1': 'ap-northeast-1',
        'asia-northeast1': 'ap-northeast-1',
        'asia-southeast1': 'ap-southeast-1'
      };
      mappedRegion = regionMap[newRegion] || 'us-east-1';
    } else if (newProvider === 'GCP' && !newRegion.includes('central') && !newRegion.includes('east4')) {
      // Map AWS regions to GCP regions
      const regionMap = {
        'us-east-1': 'us-east4',
        'us-east-2': 'us-east4',
        'us-west-1': 'us-west1',
        'us-west-2': 'us-west2',
        'eu-west-1': 'europe-west1',
        'eu-west-2': 'europe-west2',
        'eu-central-1': 'europe-west3',
        'ap-northeast-1': 'asia-northeast1',
        'ap-southeast-1': 'asia-southeast1'
      };
      mappedRegion = regionMap[newRegion] || 'us-east4';
    }

    // Create Terraform variables file with mapped region
    const parameters = {
      ...deployment.parameters,
      region: mappedRegion
    };

    // Add project_id for GCP if not present
    if (newProvider === 'GCP' && !parameters.project_id) {
      parameters.project_id = credential.credentials.projectId || 'blankcut';
    }

    // Navigate to the new Terraform module directory
    let newTerraformModulePath = path.join(workspacePath, newTerraformPath);

    // Check if the directory exists
    try {
      await fs.access(newTerraformModulePath);
    } catch (error) {
      // If the directory doesn't exist, it might be because we need to use a different path
      // For example, if we're trying to failover to GCP but the /terraform/gcp directory doesn't exist
      if (newProvider === 'GCP') {
        newTerraformPath = '/terraform/gcp';
      } else {
        newTerraformPath = '/terraform/aws';
      }
      console.log(`Terraform module path not found, trying ${newTerraformPath} instead`);
      newTerraformModulePath = path.join(workspacePath, newTerraformPath);

      try {
        await fs.access(newTerraformModulePath);
      } catch (innerError) {
        throw new Error(`Could not find Terraform module path: ${newTerraformPath}`);
      }
    }

    // Create Terraform variables file
    await createTerraformVars(parameters, newTerraformModulePath);

    // Initialize Terraform
    await runTerraformCommand('init', newTerraformModulePath);

    // Apply Terraform configuration with new provider and region
    await runTerraformCommand('apply -auto-approve', newTerraformModulePath);

    // Get Terraform outputs
    const outputString = await runTerraformCommand('output -json', newTerraformModulePath);
    const outputs = parseTerraformOutput(outputString);

    // Update deployment with new provider, region, and outputs
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'COMPLETED',
        provider: newProvider,
        region: newRegion,
        terraformPath: newTerraformPath,
        outputs
      }
    });

    // Update operation log
    await prisma.operationLog.updateMany({
      where: {
        deploymentId,
        operation: 'FAILOVER',
        status: 'RUNNING'
      },
      data: {
        status: 'COMPLETED',
        details: {
          oldProvider: deployment.provider,
          oldRegion: deployment.region,
          newProvider,
          newRegion,
          outputs
        }
      }
    });

    console.log(`Failover for ${deploymentId} to ${newProvider}/${newRegion} completed successfully`);
  } catch (error) {
    console.error(`Failover for ${deploymentId} failed:`, error);

    // Update deployment status
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'FAILED' }
    });

    // Update operation log
    await prisma.operationLog.updateMany({
      where: {
        deploymentId,
        operation: 'FAILOVER',
        status: 'RUNNING'
      },
      data: {
        status: 'FAILED',
        details: { error: error.message }
      }
    });
  }
}

module.exports = {
  deploy,
  switchRegion,
  failover
};
