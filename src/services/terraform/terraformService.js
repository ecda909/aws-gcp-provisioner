const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../../utils/logger');

// Base directory for Terraform operations
const TERRAFORM_DIR = process.env.TERRAFORM_DIR || path.join(process.cwd(), 'terraform');

/**
 * Terraform Service for managing Terraform operations
 */
const terraformService = {
  /**
   * Initialize a Terraform working directory
   * @param {string} workingDir - Working directory path
   * @returns {Promise<Object>} - Result of the initialization
   */
  async init(workingDir) {
    try {
      logger.info(`Initializing Terraform in ${workingDir}`);
      const { stdout, stderr } = await execPromise('terraform init', { cwd: workingDir });
      
      if (stderr && !stderr.includes('Terraform has been successfully initialized')) {
        throw new Error(`Terraform init error: ${stderr}`);
      }
      
      return { success: true, output: stdout };
    } catch (error) {
      logger.error(`Terraform init error: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Create a Terraform plan
   * @param {string} workingDir - Working directory path
   * @param {string} planFile - Path to save the plan file
   * @param {Object} variables - Variables to pass to Terraform
   * @returns {Promise<Object>} - Result of the plan
   */
  async plan(workingDir, planFile, variables = {}) {
    try {
      logger.info(`Creating Terraform plan in ${workingDir}`);
      
      // Create var arguments
      const varArgs = Object.entries(variables)
        .map(([key, value]) => `-var='${key}=${JSON.stringify(value)}'`)
        .join(' ');
      
      const command = `terraform plan -out=${planFile} ${varArgs}`;
      const { stdout, stderr } = await execPromise(command, { cwd: workingDir });
      
      return { success: true, output: stdout, error: stderr };
    } catch (error) {
      logger.error(`Terraform plan error: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Apply a Terraform plan
   * @param {string} workingDir - Working directory path
   * @param {string} planFile - Path to the plan file
   * @returns {Promise<Object>} - Result of the apply
   */
  async apply(workingDir, planFile) {
    try {
      logger.info(`Applying Terraform plan in ${workingDir}`);
      const { stdout, stderr } = await execPromise(`terraform apply -auto-approve ${planFile}`, { cwd: workingDir });
      
      return { success: true, output: stdout, error: stderr };
    } catch (error) {
      logger.error(`Terraform apply error: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Destroy Terraform-managed infrastructure
   * @param {string} workingDir - Working directory path
   * @param {Object} variables - Variables to pass to Terraform
   * @returns {Promise<Object>} - Result of the destroy
   */
  async destroy(workingDir, variables = {}) {
    try {
      logger.info(`Destroying Terraform infrastructure in ${workingDir}`);
      
      // Create var arguments
      const varArgs = Object.entries(variables)
        .map(([key, value]) => `-var='${key}=${JSON.stringify(value)}'`)
        .join(' ');
      
      const command = `terraform destroy -auto-approve ${varArgs}`;
      const { stdout, stderr } = await execPromise(command, { cwd: workingDir });
      
      return { success: true, output: stdout, error: stderr };
    } catch (error) {
      logger.error(`Terraform destroy error: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get Terraform outputs
   * @param {string} workingDir - Working directory path
   * @returns {Promise<Object>} - Terraform outputs
   */
  async getOutputs(workingDir) {
    try {
      logger.info(`Getting Terraform outputs in ${workingDir}`);
      const { stdout } = await execPromise('terraform output -json', { cwd: workingDir });
      
      return JSON.parse(stdout);
    } catch (error) {
      logger.error(`Terraform output error: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Create a Terraform configuration directory for a deployment
   * @param {string} deploymentId - Deployment ID
   * @param {Object} template - Template object
   * @param {Object} parameters - Deployment parameters
   * @param {string} region - Target region
   * @returns {Promise<string>} - Path to the created directory
   */
  async createConfigDir(deploymentId, template, parameters, region) {
    try {
      // Create base directory if it doesn't exist
      if (!fs.existsSync(TERRAFORM_DIR)) {
        fs.mkdirSync(TERRAFORM_DIR, { recursive: true });
      }
      
      // Create deployment directory
      const deploymentDir = path.join(TERRAFORM_DIR, deploymentId);
      if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
      }
      
      // Create region-specific directory
      const regionDir = path.join(deploymentDir, region);
      if (!fs.existsSync(regionDir)) {
        fs.mkdirSync(regionDir, { recursive: true });
      }
      
      // Create main.tf file
      const mainTfContent = this.generateMainTf(template, parameters, region);
      fs.writeFileSync(path.join(regionDir, 'main.tf'), mainTfContent);
      
      // Create variables.tf file
      const variablesTfContent = this.generateVariablesTf(template);
      fs.writeFileSync(path.join(regionDir, 'variables.tf'), variablesTfContent);
      
      // Create terraform.tfvars file
      const tfvarsContent = this.generateTfvars(parameters);
      fs.writeFileSync(path.join(regionDir, 'terraform.tfvars'), tfvarsContent);
      
      // Create outputs.tf file
      const outputsTfContent = this.generateOutputsTf(template);
      fs.writeFileSync(path.join(regionDir, 'outputs.tf'), outputsTfContent);
      
      logger.info(`Created Terraform configuration in ${regionDir}`);
      
      return regionDir;
    } catch (error) {
      logger.error(`Error creating Terraform config: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Generate main.tf content
   * @param {Object} template - Template object
   * @param {Object} parameters - Deployment parameters
   * @param {string} region - Target region
   * @returns {string} - main.tf content
   */
  generateMainTf(template, parameters, region) {
    // Start with provider configuration
    let content = '';
    
    // Add provider configuration based on template provider
    if (template.provider === 'AWS') {
      content += `
provider "aws" {
  region = "${region}"
}
`;
    } else if (template.provider === 'GCP') {
      content += `
provider "google" {
  region = "${region}"
}
`;
    }
    
    // Add module reference if gitRepo is provided
    if (template.gitRepo) {
      content += `
module "deployment" {
  source = "${template.gitRepo}${template.modulePath ? '//' + template.modulePath : ''}"
  ${template.gitBranch ? `ref = "${template.gitBranch}"` : ''}
  
  # Pass all variables to the module
`;
      
      // Add variable references
      for (const [key, value] of Object.entries(template.parameters.properties || {})) {
        content += `  ${key} = var.${key}\n`;
      }
      
      content += '}\n';
    } else {
      // If no git repo, add direct resource definitions
      content += `
# Direct resource definitions
${JSON.stringify(template.resources, null, 2)}
`;
    }
    
    return content;
  },
  
  /**
   * Generate variables.tf content
   * @param {Object} template - Template object
   * @returns {string} - variables.tf content
   */
  generateVariablesTf(template) {
    let content = '';
    
    // Add variable definitions based on template parameters
    for (const [key, value] of Object.entries(template.parameters.properties || {})) {
      content += `
variable "${key}" {
  description = "${value.description || key}"
  type = ${this.getTerraformType(value.type)}
  ${value.default !== undefined ? `default = ${JSON.stringify(value.default)}` : ''}
}
`;
    }
    
    return content;
  },
  
  /**
   * Generate terraform.tfvars content
   * @param {Object} parameters - Deployment parameters
   * @returns {string} - terraform.tfvars content
   */
  generateTfvars(parameters) {
    let content = '';
    
    // Add variable values
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        content += `${key} = "${value}"\n`;
      } else {
        content += `${key} = ${JSON.stringify(value)}\n`;
      }
    }
    
    return content;
  },
  
  /**
   * Generate outputs.tf content
   * @param {Object} template - Template object
   * @returns {string} - outputs.tf content
   */
  generateOutputsTf(template) {
    // Basic outputs for resource tracking
    return `
output "resources" {
  description = "Resources created by this deployment"
  value = module.deployment
}
`;
  },
  
  /**
   * Convert JSON Schema type to Terraform type
   * @param {string} jsonType - JSON Schema type
   * @returns {string} - Terraform type
   */
  getTerraformType(jsonType) {
    switch (jsonType) {
      case 'string':
        return 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'bool';
      case 'array':
        return 'list(any)';
      case 'object':
        return 'map(any)';
      default:
        return 'any';
    }
  },
  
  /**
   * Clone a Git repository
   * @param {string} repoUrl - Repository URL
   * @param {string} targetDir - Target directory
   * @param {string} branch - Branch to clone
   * @returns {Promise<Object>} - Result of the clone
   */
  async cloneRepository(repoUrl, targetDir, branch = 'main') {
    try {
      logger.info(`Cloning repository ${repoUrl} to ${targetDir}`);
      
      // Create target directory if it doesn't exist
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // Clone the repository
      const command = `git clone --branch ${branch} ${repoUrl} ${targetDir}`;
      const { stdout, stderr } = await execPromise(command);
      
      return { success: true, output: stdout, error: stderr };
    } catch (error) {
      logger.error(`Git clone error: ${error.message}`);
      throw error;
    }
  }
};

module.exports = terraformService;
