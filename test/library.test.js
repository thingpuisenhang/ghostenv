const { setup, teardown, runCli, TEST_DIR } = require('./test-utils');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

// We need to require ghostenv in a way that respects the fake HOME
const ghostenvPath = path.join(__dirname, '..', 'index.js');

function testLibrary() {
  console.log('Running testLibrary...');
  setup();
  
  // 1. Setup global secret
  runCli(['set', 'GLOBAL_SECRET', 'gval', '--global']);
  
  // 2. Setup project secret
  runCli(['init', 'lib-proj']);
  runCli(['set', 'PROJECT_SECRET', 'pval']);
  runCli(['set', 'KEY', 'local', '--platform', 'supabase']);
  
  // Now run a script that uses the library
  const scriptContent = `
    const ghostenv = require('${ghostenvPath.replace(/\\/g, '/')}');
    const env = ghostenv();
    console.log(JSON.stringify({
      global: env.GLOBAL_SECRET,
      project: env.PROJECT_SECRET,
      platform: env.supabase.KEY,
      search: env.KEY
    }));
  `;
  
  fs.writeFileSync(path.join(TEST_DIR, 'test-lib.js'), scriptContent);
  
  const res = runCli(['exec', '--', 'node', 'test-lib.js']);
  assert.strictEqual(res.status, 0, 'Script execution should succeed');
  
  const data = JSON.parse(res.stdout.toString());
  assert.strictEqual(data.global, 'gval');
  assert.strictEqual(data.project, 'pval');
  assert.strictEqual(data.platform, 'local');
  assert.strictEqual(data.search, 'local');
  
  teardown();
}

function testProcessEnvFallback() {
  console.log('Running testProcessEnvFallback...');
  setup();
  
  const scriptContent = `
    const ghostenv = require('${ghostenvPath.replace(/\\/g, '/')}');
    const env = ghostenv();
    process.env.MY_SYSTEM_KEY = 'sys_val';
    console.log(env.MY_SYSTEM_KEY);
  `;
  
  fs.writeFileSync(path.join(TEST_DIR, 'test-env.js'), scriptContent);
  const res = runCli(['exec', '--', 'node', 'test-env.js']);
  assert.strictEqual(res.stdout.toString().trim(), 'sys_val', 'Should fallback to process.env');
  
  teardown();
}

try {
  testLibrary();
  testProcessEnvFallback();
  console.log('\n✅ Library Tests Passed!');
} catch (err) {
  console.error('\n❌ Library Tests Failed!');
  console.error(err);
  process.exit(1);
}
