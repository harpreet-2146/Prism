console.log('Testing export controller imports...\n');

try {
  console.log('1. Testing pdf-export.service...');
  const pdfExport = require('./src/services/export/pdf-export.service');
  console.log('   ✓ pdf-export loaded\n');
} catch (e) {
  console.error('   ✗ pdf-export FAILED:', e.message);
  console.error('   Stack:', e.stack);
}

try {
  console.log('2. Testing docx-export.service...');
  const docxExport = require('./src/services/export/docx-export.service');
  console.log('   ✓ docx-export loaded\n');
} catch (e) {
  console.error('   ✗ docx-export FAILED:', e.message);
  console.error('   Stack:', e.stack);
}

try {
  console.log('3. Testing chat.service...');
  const chatService = require('./src/services/chat.service');
  console.log('   ✓ chat.service loaded\n');
} catch (e) {
  console.error('   ✗ chat.service FAILED:', e.message);
  console.error('   Stack:', e.stack);
}

console.log('Done!');
