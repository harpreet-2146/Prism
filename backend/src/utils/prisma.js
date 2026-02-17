// backend/src/utils/prisma.js

/**
 * Shared Prisma client singleton.
 *
 * CRITICAL: Always import Prisma from THIS file — never call `new PrismaClient()`
 * anywhere else in the codebase. Creating multiple PrismaClient instances
 * exhausts the PostgreSQL connection pool and causes "too many connections" errors.
 *
 * Usage in any service/controller:
 *   const prisma = require('./utils/prisma');       // from same level
 *   const prisma = require('../utils/prisma');      // from one level up
 *   const prisma = require('../../utils/prisma');   // from two levels up
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const config = require('../config');

// Use global to survive hot-reload in development without creating new instances
const globalRef = globalThis;

function createPrismaClient() {
  const logConfig = config.NODE_ENV === 'development'
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ]
    : [
        { emit: 'stdout', level: 'error' },
      ];

  const client = new PrismaClient({ log: logConfig });

  // Log slow queries in development
  if (config.NODE_ENV === 'development') {
    client.$on('query', (event) => {
      if (event.duration > 200) {
        console.warn(`[Prisma SLOW] ${event.duration}ms — ${event.query}`);
      }
    });
  }

  return client;
}

const prisma = globalRef.__prisma ?? createPrismaClient();

if (config.NODE_ENV !== 'production') {
  // Prevent new instances on hot-reload in development
  globalRef.__prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;