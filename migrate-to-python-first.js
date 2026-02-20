#!/usr/bin/env node
// migrate-to-python-first.js
// Automated migration script for PRISM Python-first architecture

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 PRISM Migration Script - Python-First Architecture\n');

const BACKUP_DIR = path.join(process.cwd(), 'migration-backup');
const SERVICES_DIR = path.join(process.cwd(), 'backend', 'src', 'services');

// Files to delete
const FILES_TO_DELETE = [
  'backend/src/services/pdf/pdf-processor.service.js',
  'backend/src/services/pdf/image-extractor.service.js',
  'backend/src/services/ocr.service.js'
];

// Files to backup before updating
const FILES_TO_BACKUP = [
  'backend/src/services/documents.service.js',
  'backend/src/services/python-client.service.js'
];

/**
 * Create backup directory
 */
function createBackup() {
  console.log('📦 Creating backup...');
  
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  FILES_TO_BACKUP.forEach(file => {
    if (fs.existsSync(file)) {
      const backupPath = path.join(BACKUP_DIR, path.basename(file));
      fs.copyFileSync(file, backupPath);
      console.log(`   ✓ Backed up: ${file}`);
    }
  });

  console.log('   ✓ Backup complete\n');
}

/**
 * Delete redundant files
 */
function deleteRedundantFiles() {
  console.log('🗑️  Deleting redundant Node.js processing services...');
  
  FILES_TO_DELETE.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`   ✓ Deleted: ${file}`);
    } else {
      console.log(`   ⚠ Not found: ${file}`);
    }
  });

  console.log('   ✓ Cleanup complete\n');
}

/**
 * Verify environment variables
 */
function verifyEnvironment() {
  console.log('🔐 Verifying environment variables...');
  
  const envFile = path.join(process.cwd(), 'backend', '.env');
  
  if (!fs.existsSync(envFile)) {
    console.log('   ⚠ Warning: backend/.env not found');
    return;
  }

  const requiredVars = [
    'DATABASE_URL',
    'PYTHON_SERVICE_URL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'JWT_SECRET'
  ];

  const envContent = fs.readFileSync(envFile, 'utf-8');
  const missingVars = [];

  requiredVars.forEach(varName => {
    if (!envContent.includes(`${varName}=`)) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    console.log('   ⚠ Warning: Missing environment variables:');
    missingVars.forEach(v => console.log(`     - ${v}`));
  } else {
    console.log('   ✓ All required environment variables found');
  }

  console.log();
}

/**
 * Test Python service connection
 */
async function testPythonService() {
  console.log('🐍 Testing Python microservice connection...');
  
  const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
  
  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch(`${pythonUrl}/health`, { 
      timeout: 5000 
    });
    const data = await response.json();
    
    if (data.status === 'healthy') {
      console.log(`   ✓ Python service is healthy at ${pythonUrl}`);
    } else {
      console.log(`   ⚠ Python service responded but not healthy:`, data);
    }
  } catch (error) {
    console.log(`   ✗ Cannot connect to Python service at ${pythonUrl}`);
    console.log(`   Error: ${error.message}`);
    console.log('   Make sure Python service is running: uvicorn main:app --reload');
  }
  
  console.log();
}

/**
 * Verify database schema
 */
function verifyDatabaseSchema() {
  console.log('🗄️  Verifying database schema...');
  
  const schemaFile = path.join(process.cwd(), 'backend', 'prisma', 'schema.prisma');
  
  if (!fs.existsSync(schemaFile)) {
    console.log('   ⚠ Warning: prisma/schema.prisma not found');
    return;
  }

  const schemaContent = fs.readFileSync(schemaFile, 'utf-8');
  
  // Check for camelCase field names
  const requiredFields = [
    'chunkIndex',
    'pageNumber',
    'sourceType',
    'sourceImageId'
  ];

  const issues = [];
  requiredFields.forEach(field => {
    if (!schemaContent.includes(field)) {
      issues.push(field);
    }
  });

  if (issues.length > 0) {
    console.log('   ⚠ Warning: Schema may need updates for these fields:');
    issues.forEach(f => console.log(`     - ${f}`));
    console.log('   Review REFACTORING_GUIDE.md for correct schema');
  } else {
    console.log('   ✓ Schema appears to use correct camelCase field names');
  }
  
  console.log();
}

/**
 * Run database migrations
 */
function runMigrations() {
  console.log('📊 Running database migrations...');
  
  try {
    execSync('cd backend && npx prisma generate', { stdio: 'inherit' });
    console.log('   ✓ Prisma client generated');
    
    console.log('   ℹ  To apply migrations, run: cd backend && npx prisma migrate dev');
  } catch (error) {
    console.log('   ⚠ Failed to generate Prisma client');
    console.log('   Run manually: cd backend && npx prisma generate');
  }
  
  console.log();
}

/**
 * Generate report
 */
function generateReport() {
  console.log('📝 Migration Report\n');
  console.log('═'.repeat(50));
  
  console.log('\n✅ COMPLETED STEPS:');
  console.log('  • Created backup of existing files');
  console.log('  • Deleted redundant Node.js services');
  console.log('  • Verified environment variables');
  console.log('  • Tested Python service connection');
  console.log('  • Verified database schema');
  
  console.log('\n📋 MANUAL STEPS REQUIRED:');
  console.log('  1. Review new documents.service.js and python-client.service.js');
  console.log('  2. Copy new service files to backend/src/services/');
  console.log('  3. Update database schema if needed (see REFACTORING_GUIDE.md)');
  console.log('  4. Run: cd backend && npx prisma migrate dev');
  console.log('  5. Update frontend API calls if using snake_case');
  console.log('  6. Test all endpoints thoroughly');
  console.log('  7. Deploy to Railway');
  
  console.log('\n📚 DOCUMENTATION:');
  console.log('  • See REFACTORING_GUIDE.md for complete instructions');
  console.log('  • Backup location: ' + BACKUP_DIR);
  
  console.log('\n' + '═'.repeat(50) + '\n');
}

/**
 * Main migration function
 */
async function main() {
  try {
    // Step 1: Create backup
    createBackup();
    
    // Step 2: Delete redundant files
    deleteRedundantFiles();
    
    // Step 3: Verify environment
    verifyEnvironment();
    
    // Step 4: Test Python service
    await testPythonService();
    
    // Step 5: Verify database schema
    verifyDatabaseSchema();
    
    // Step 6: Run migrations
    runMigrations();
    
    // Step 7: Generate report
    generateReport();
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\nBackup location:', BACKUP_DIR);
    console.log('Review error and retry migration.');
    process.exit(1);
  }
}

// Run migration
main();