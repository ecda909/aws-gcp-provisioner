# AWS/GCP Terraform Provisioner API

A Fastify API for deploying Terraform resources to AWS and GCP with region switching and cross-cloud failover capabilities.

## Features

- Deploy Terraform resources to AWS or GCP
- Switch resources between regions
- Failover from AWS to GCP or vice versa
- Manage cloud provider credentials
- Track deployment operations

## Architecture

The application consists of the following components:

- **API**: Fastify-based REST API for managing deployments and credentials
- **Database**: PostgreSQL database for storing deployment and credential information
- **Terraform Service**: Service for executing Terraform commands

## Prerequisites

- Docker and Docker Compose
- AWS account with appropriate permissions
- GCP account with appropriate permissions
- Git repository with Terraform configurations

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/yourusername/aws-gcp-provisioner.git
cd aws-gcp-provisioner
```

2. Start the application using Docker Compose:

```bash
docker-compose up -d
```

3. Initialize the database:

```bash
docker-compose exec api npm run prisma:migrate
```

4. Access the API at http://localhost:3000

## API Endpoints

### Deployments

- `POST /api/deployments`: Create a new deployment
- `GET /api/deployments`: List all deployments
- `GET /api/deployments/:id`: Get deployment details
- `POST /api/deployments/:id/switch-region`: Switch deployment to another region
- `POST /api/deployments/:id/failover`: Failover deployment to another cloud provider

### Credentials

- `POST /api/credentials`: Create new cloud provider credentials
- `GET /api/credentials`: List all credentials
- `GET /api/credentials/:id`: Get credential details
- `PUT /api/credentials/:id`: Update credential
- `DELETE /api/credentials/:id`: Delete credential

## Example Usage

### Creating AWS Credentials

```bash
curl -X POST http://localhost:3000/api/credentials \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-aws-credentials",
    "provider": "AWS",
    "credentials": {
      "accessKeyId": "YOUR_AWS_ACCESS_KEY",
      "secretAccessKey": "YOUR_AWS_SECRET_KEY"
    }
  }'
```

### Creating a Deployment

```bash
curl -X POST http://localhost:3000/api/deployments \
  -H "Content-Type: application/json" \
  -d '{
    "name": "weather-app-deployment",
    "provider": "AWS",
    "region": "us-east-1",
    "parameters": {
      "project_name": "weather-analysis",
      "environment": "dev",
      "instance_type": "t2.micro"
    },
    "credentialId": "YOUR_CREDENTIAL_ID",
    "failoverRegion": "us-west-1",
    "failoverProvider": "GCP",
    "terraformPath": "/terraform/aws",
    "gitRepo": "https://github.com/Blankcut/aws-gcp-terraform-weather-app.git",
    "gitBranch": "main"
  }'
```

### Switching Region

```bash
curl -X POST http://localhost:3000/api/deployments/YOUR_DEPLOYMENT_ID/switch-region \
  -H "Content-Type: application/json" \
  -d '{
    "region": "us-west-1"
  }'
```

### Failing Over to Another Cloud Provider

```bash
curl -X POST http://localhost:3000/api/deployments/YOUR_DEPLOYMENT_ID/failover \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GCP",
    "region": "us-east4"
  }'
```

## License

ISC
