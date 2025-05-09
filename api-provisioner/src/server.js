/**
 * Main server file for the Terraform Provisioner API
 */

'use strict';

require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const { PrismaClient } = require('@prisma/client');

// Initialize Prisma client
let prisma;
try {
  prisma = new PrismaClient();
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  process.exit(1);
}

// Register plugins
fastify.register(require('@fastify/cors'), {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
});

// Register Swagger
fastify.register(require('@fastify/swagger'), {
  routePrefix: '/documentation',
  swagger: {
    info: {
      title: 'Terraform Provisioner API',
      description: 'API for deploying Terraform resources to AWS and GCP',
      version: '1.0.0'
    },
    externalDocs: {
      url: 'https://github.com/Blankcut/aws-gcp-terraform-weather-app',
      description: 'Find more info here'
    },
    host: 'localhost:3000',
    schemes: ['http'],
    consumes: ['application/json'],
    produces: ['application/json']
  },
  exposeRoute: true
});

fastify.register(require('@fastify/swagger-ui'), {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  }
});

// Register routes
fastify.register(require('./routes/deployments'), { prefix: '/api/deployments' });
fastify.register(require('./routes/credentials'), { prefix: '/api/credentials' });

// Health check route
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Graceful shutdown
const closeGracefully = async (signal) => {
  fastify.log.info(`Received signal to terminate: ${signal}`);

  await fastify.close();
  await prisma.$disconnect();

  process.exit(0);
};

process.on('SIGINT', closeGracefully);
process.on('SIGTERM', closeGracefully);
process.on('SIGUSR2', closeGracefully); // For Nodemon restarts

// Export for testing
module.exports = { fastify, prisma };

// Start the server if not imported
if (require.main === module) {
  const start = async () => {
    try {
      const port = process.env.PORT || 3000;
      const host = process.env.HOST || '0.0.0.0';

      await fastify.listen({ port, host });
      fastify.log.info(`Server listening on ${host}:${port}`);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };

  start();
}
