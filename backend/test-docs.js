console.log('Testing documents route dependencies...\n');

try {
  console.log('1. Testing image-extractor...');
  const imageExtractor = require('./src/services/pdf/image-extractor.service');
  console.log('   ✓ image-extractor loaded\n');
} catch (e) {
  console.error('   ✗ image-extractor FAILED:', e.message);
  console.error('   Stack:', e.stack);
  process.exit(1);
}

try {
  console.log('2. Testing pdf-processor...');
  const pdfProcessor = require('./src/services/pdf/pdf-processor.service');
  console.log('   ✓ pdf-processor loaded\n');
} catch (e) {
  console.error('   ✗ pdf-processor FAILED:', e.message);
  console.error('   Stack:', e.stack);
  process.exit(1);
}

try {
  console.log('3. Testing ocr service...');
  const ocrService = require('./src/services/ocr.service');
  console.log('   ✓ ocr service loaded\n');
} catch (e) {
  console.error('   ✗ ocr service FAILED:', e.message);
  console.error('   Stack:', e.stack);
  process.exit(1);
}

try {
  console.log('4. Testing embedding search...');
  const embeddingSearch = require('./src/services/vector/embedding-search.service');
  console.log('   ✓ embedding search loaded\n');
} catch (e) {
  console.error('   ✗ embedding search FAILED:', e.message);
  console.error('   Stack:', e.stack);
  process.exit(1);
}

try {
  console.log('5. Testing documents service...');
  const documentsService = require('./src/services/documents.service');
  console.log('   ✓ documents service loaded\n');
} catch (e) {
  console.error('   ✗ documents service FAILED:', e.message);
  console.error('   Stack:', e.stack);
  process.exit(1);
}

try {
  console.log('6. Testing documents controller...');
  const documentsController = require('./src/controllers/documents.controller');
  console.log('   ✓ documents controller loaded\n');
} catch (e) {
  console.error('   ✗ documents controller FAILED:', e.message);
  console.error('   Stack:', e.stack);
  process.exit(1);
}

try {
  console.log('7. Testing documents routes...');
  const documentsRoutes = require('./src/routes/documents.routes');
  console.log('   ✓ documents routes loaded\n');
} catch (e) {
  console.error('   ✗ documents routes FAILED:', e.message);
  console.error('   Stack:', e.stack);
  process.exit(1);
}

console.log('✅ ALL DOCUMENTS DEPENDENCIES LOADED SUCCESSFULLY!');
