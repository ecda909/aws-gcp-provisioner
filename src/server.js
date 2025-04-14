const fastify = require('fastify');
const cors = require('@fastify/cors');
const swagger = require('@fastify/swagger');
const dotenv = require('dotenv');
const prisma = require('./db');
const apiRoutes = require('./api');
const logger = require('./utils/logger');

// Load environment variables
dotenv.config();

// Create Fastify instance
const server = fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

// Register plugins
server.register(cors, {
  origin: true // Allow all origins in development
});

// Register Swagger
server.register(swagger, {
  routePrefix: '/documentation',
  swagger: {
    info: {
      title: 'AWS/GCP Provisioner API',
      description: 'API for provisioning AWS and GCP resources',
      version: '1.0.0'
    },
    externalDocs: {
      url: 'https://swagger.io',
      description: 'Find more info here'
    },
    host: `${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`,
    schemes: ['http'],
    consumes: ['application/json'],
    produces: ['application/json']
  },
  exposeRoute: true
});

// Register API routes
server.register(apiRoutes, { prefix: '/api' });

// Health check route
server.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date() };
});

// Start the server
const start = async () => {
  try {
    await server.listen({
      port: process.env.PORT || 3000,
      host: process.env.HOST || '0.0.0.0'
    });

    server.log.info(`Server listening on ${server.server.address().port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  server.log.info('Server shutting down');
  await server.close();
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
start();
