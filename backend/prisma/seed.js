const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@prism.com' },
    update: {},
    create: {
      email: 'admin@prism.com',
      password: adminPassword,
      fullName: 'PRISM Administrator',
      role: 'ADMIN',
      isActive: true
    }
  });

  console.log('✅ Created admin user:', admin.email);

  // Create test user
  const testPassword = await bcrypt.hash('Test123!', 12);
  const testUser = await prisma.user.upsert({
    where: { email: 'test@prism.com' },
    update: {},
    create: {
      email: 'test@prism.com',
      password: testPassword,
      fullName: 'Test User',
      role: 'USER',
      isActive: true
    }
  });

  console.log('✅ Created test user:', testUser.email);

  // Create default export templates
  const defaultTemplates = [
    {
      name: 'Professional Report',
      description: 'Clean, professional template for business reports',
      format: 'PDF',
      template: {
        theme: 'professional',
        includeMetadata: true,
        includeImages: true,
        includeSources: true,
        headerFooter: true,
        tableOfContents: true
      },
      isDefault: true,
      isPublic: true
    },
    {
      name: 'Simple Document',
      description: 'Minimal template for basic documents',
      format: 'DOCX',
      template: {
        theme: 'minimal',
        includeMetadata: false,
        includeImages: true,
        includeSources: false,
        headerFooter: false,
        tableOfContents: false
      },
      isDefault: true,
      isPublic: true
    },
    {
      name: 'Technical Documentation',
      description: 'Template optimized for technical documentation',
      format: 'MARKDOWN',
      template: {
        theme: 'technical',
        includeMetadata: true,
        includeImages: true,
        includeSources: true,
        codeHighlighting: true,
        tableOfContents: true
      },
      isDefault: true,
      isPublic: true
    }
  ];

  for (const template of defaultTemplates) {
    await prisma.exportTemplate.upsert({
      where: { 
        name: template.name 
      },
      update: template,
      create: template
    });
    console.log('✅ Created export template:', template.name);
  }

  // Create system configuration
  const systemConfigs = [
    {
      key: 'max_file_size',
      value: { bytes: 52428800, display: '50MB' }
    },
    {
      key: 'allowed_file_types',
      value: {
        types: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp'],
        mimeTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg',
          'image/png',
          'image/webp'
        ]
      }
    },
    {
      key: 'sap_modules',
      value: {
        modules: [
          { code: 'FI', name: 'Financial Accounting', description: 'General ledger, accounts payable/receivable' },
          { code: 'CO', name: 'Controlling', description: 'Cost accounting and management' },
          { code: 'MM', name: 'Materials Management', description: 'Procurement and inventory' },
          { code: 'SD', name: 'Sales and Distribution', description: 'Sales processes and customer management' },
          { code: 'PP', name: 'Production Planning', description: 'Manufacturing and production' },
          { code: 'QM', name: 'Quality Management', description: 'Quality control and assurance' },
          { code: 'PM', name: 'Plant Maintenance', description: 'Equipment and facility maintenance' },
          { code: 'HR', name: 'Human Resources', description: 'Personnel management' },
          { code: 'PS', name: 'Project System', description: 'Project management' },
          { code: 'WM', name: 'Warehouse Management', description: 'Warehouse operations' }
        ]
      }
    },
    {
      key: 'ai_settings',
      value: {
        defaultModel: 'llama-3.1-8b-instant',
        maxTokens: 8192,
        temperature: 0.7,
        systemPrompt: 'You are PRISM, an intelligent SAP assistant. Help users with SAP-related questions, document analysis, and provide step-by-step guidance.'
      }
    },
    {
      key: 'export_settings',
      value: {
        maxExportsPerHour: 20,
        maxFileRetentionDays: 30,
        defaultFormat: 'pdf',
        allowedFormats: ['pdf', 'docx', 'markdown', 'json']
      }
    }
  ];

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config
    });
    console.log('✅ Created system config:', config.key);
  }

  // Create sample conversation for test user
  const sampleConversation = await prisma.conversation.create({
    data: {
      title: 'Getting Started with SAP FI',
      userId: testUser.id,
      summary: 'Introduction to SAP Financial Accounting module',
      messages: {
        create: [
          {
            role: 'USER',
            content: 'Can you help me understand the basics of SAP FI module?',
            userId: testUser.id
          },
          {
            role: 'ASSISTANT',
            content: `# SAP FI (Financial Accounting) Module Overview

SAP FI is one of the core modules in SAP ERP and handles all financial accounting processes. Here are the key components:

## Main Areas:
- **General Ledger (GL)** - Central repository for all financial data
- **Accounts Payable (AP)** - Vendor invoice processing and payments
- **Accounts Receivable (AR)** - Customer billing and collections
- **Asset Accounting (AA)** - Fixed asset management
- **Bank Accounting** - Cash management and bank reconciliation

## Key Transaction Codes:
- **FB01** - Post Document
- **FB50** - General Ledger Posting
- **FB60** - Vendor Invoice Entry
- **FB70** - Customer Invoice Entry
- **FS00** - Master Data Maintenance

## Integration Points:
- CO (Controlling) - Cost allocation
- MM (Materials Management) - Purchase orders
- SD (Sales & Distribution) - Sales invoices

Would you like me to explain any specific area in more detail?`,
            tokenCount: 245
          }
        ]
      }
    }
  });

  console.log('✅ Created sample conversation:', sampleConversation.title);

  console.log('🎉 Database seed completed successfully!');
  console.log('\n📋 Default Accounts Created:');
  console.log(`👤 Admin: admin@prism.com / Admin123!`);
  console.log(`👤 Test User: test@prism.com / Test123!`);
  console.log('\n🌟 PRISM is ready to use!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });