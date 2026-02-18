console.log('Testing export controller...');
try {
  const exportController = require('./src/controllers/export.controller');
  console.log('✓ Export controller loaded');
  console.log('  Methods:', Object.keys(exportController));
} catch (e) {
  console.error('✗ Export controller FAILED:', e.message);
  console.error('  Stack:', e.stack);
}
