console.log('1. Starting...');

try {
  console.log('2. Loading dotenv...');
  require('dotenv').config();
  console.log('   ✓ dotenv loaded');
} catch (e) {
  console.error('   ✗ dotenv failed:', e.message);
}

try {
  console.log('3. Loading config...');
  const config = require('./src/config');
  console.log('   ✓ config loaded');
} catch (e) {
  console.error('   ✗ config failed:', e.message);
  console.error('   Stack:', e.stack);
}

try {
  console.log('4. Loading logger...');
  const { logger } = require('./src/utils/logger');
  console.log('   ✓ logger loaded');
} catch (e) {
  console.error('   ✗ logger failed:', e.message);
  console.error('   Stack:', e.stack);
}

try {
  console.log('5. Loading auth routes...');
  const authRoutes = require('./src/routes/auth.routes');
  console.log('   ✓ auth routes loaded');
} catch (e) {
  console.error('   ✗ auth routes failed:', e.message);
  console.error('   Stack:', e.stack);
}

console.log('Done!');
