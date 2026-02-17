// backend/prisma/seed.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create a demo user for development/testing
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const user = await prisma.user.upsert({
    where: { email: 'demo@prism.app' },
    update: {},
    create: {
      email: 'demo@prism.app',
      passwordHash,
      fullName: 'Demo User'
    }
  });

  console.log('Demo user created:', user.email);
  console.log('Password: Password123!');
  console.log('\nSeeding complete!');
}

main()
  .catch(error => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });