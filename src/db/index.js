const { PrismaClient } = require('@prisma/client');

// Create a singleton instance of PrismaClient
const prisma = new PrismaClient();

// Handle connection errors
prisma.$on('error', (e) => {
  console.error('Prisma Client error:', e);
});

// Note: 'beforeExit' event is no longer supported in Prisma 5.0.0+
// Instead, we'll handle shutdown in the process termination handlers

// Export the prisma client
module.exports = prisma;
