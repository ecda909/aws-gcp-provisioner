# AWS/GCP Provisioner Microservice

A microservice that provides an API to create, update, and destroy AWS and GCP resources.

## Features

- RESTful API for resource provisioning
- Asynchronous job processing
- Database-driven state tracking
- Support for AWS resources (EC2, S3)
- Support for GCP resources (Compute Engine, Disk)

## Architecture

```
+------------------+       +--------------------+
|  User / Client   | --->  | Fastify HTTP Server| ---> Creates new job in Bee-Queue
+------------------+       +--------------------+
                               |  (returns job/resource ID to client)
                               v
                         +-----------+
                         | Bee-Queue |
                         +-----------+
                               |
                               v
                   +--------------------+
                   | Worker Processes  |
                   |    (AWS/GCP SDK)  |
                   +--------------------+
                             |
                             v
                   +--------------------+
                   |  PostgreSQL DB    |
                   |  (Prisma ORM)     |
                   +--------------------+
```

## Prerequisites

- Node.js (v14+ recommended)
- PostgreSQL database
- Redis (for Bee-Queue)
- AWS credentials (for AWS resources)
- GCP credentials (for GCP resources)

## Installation

1. Clone the repository

```bash
git clone https://github.com/yourusername/aws-gcp-provisioner.git
cd aws-gcp-provisioner
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables

Copy the `.env.example` file to `.env` and update the values:

```bash
cp .env.example .env
```

4. Set up the database

```bash
npm run prisma:migrate
npm run prisma:generate
```

## Running the Service

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Worker Process

```bash
npm run worker
```

## API Documentation

Once the service is running, you can access the Swagger documentation at:

```
http://localhost:3000/documentation
```

## Example Usage

### Create an EC2 Instance

```bash
curl -X POST http://localhost:3000/api/resources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-ec2-instance",
    "description": "My EC2 instance",
    "provider": "AWS",
    "type": "EC2",
    "config": {
      "instanceType": "t2.micro",
      "imageId": "ami-0c55b159cbfafe1f0",
      "keyName": "my-key-pair"
    }
  }'
```

### Create a GCP Compute Engine Instance

```bash
curl -X POST http://localhost:3000/api/resources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-compute-instance",
    "description": "My Compute Engine instance",
    "provider": "GCP",
    "type": "ComputeEngine",
    "config": {
      "project": "my-gcp-project",
      "zone": "us-central1-a",
      "machineType": "e2-medium",
      "sourceImage": "projects/debian-cloud/global/images/family/debian-10"
    }
  }'
```

## License

ISC