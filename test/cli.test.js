const { setup, teardown, runCli, TEST_DIR } = require('./test-utils');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testInit() {
  console.log('Running testInit...');
  setup();
  const res = runCli(['init', 'my-proj']);
  assert.strictEqual(res.status, 0, 'Init should succeed');
  assert.ok(fs.existsSync(path.join(TEST_DIR, '.ghostenvrc')), '.ghostenvrc should exist');
  const rc = JSON.parse(fs.readFileSync(path.join(TEST_DIR, '.ghostenvrc'), 'utf8'));
  assert.ok(rc.projectId.startsWith('my-proj'), 'Project ID should start with name');
  teardown();
}

function testGlobalSetGet() {
  console.log('Running testGlobalSetGet...');
  setup();
  // Set global key
  const setRes = runCli(['set', 'GLOBAL_KEY', 'global_val', '--global']);
  assert.strictEqual(setRes.status, 0, 'Global set should succeed');
  
  // Get global key
  const getRes = runCli(['get', 'GLOBAL_KEY', '--global']);
  assert.strictEqual(getRes.stdout.toString().trim(), 'global_val', 'Global get should return correct value');
  teardown();
}

function testPrecedenceAndCollision() {
  console.log('Running testPrecedenceAndCollision...');
  setup();
  runCli(['init', 'collision-proj']);
  
  // 1. Set Global (lowest)
  runCli(['set', 'CONFLICT_KEY', 'global_val', '--global']);
  
  // 2. Set Local Legacy (middle)
  runCli(['set', 'CONFLICT_KEY', 'local_val']);
  
  // 3. Set Platform (highest)
  runCli(['set', 'CONFLICT_KEY', 'platform_val', '--platform', 'supabase']);

  // Exec should show collision warning and use platform value
  const execRes = runCli(['exec', '--', 'node', '-e', 'console.log(process.env.CONFLICT_KEY)']);
  const output = execRes.stdout.toString().trim();
  const error = execRes.stderr.toString();
  
  assert.strictEqual(output, 'platform_val', 'Platform should have highest precedence');
  assert.ok(error.includes('Collision detected'), 'Should warn about collision');
  teardown();
}

function testLifecycle() {
  console.log('Running testLifecycle...');
  setup();
  runCli(['init', 'lifecycle-proj']);
  const rc = JSON.parse(fs.readFileSync(path.join(TEST_DIR, '.ghostenvrc'), 'utf8'));
  const originalId = rc.projectId;

  // Rename
  const renameRes = runCli(['rename', originalId, 'new-name']);
  assert.strictEqual(renameRes.status, 0, 'Rename should succeed');
  const newRc = JSON.parse(fs.readFileSync(path.join(TEST_DIR, '.ghostenvrc'), 'utf8'));
  assert.ok(newRc.projectId.startsWith('new-name'), 'RC should update with new ID');

  // Destroy
  const destroyRes = runCli(['destroy', newRc.projectId, '--yes']);
  assert.strictEqual(destroyRes.status, 0, 'Destroy should succeed');
  assert.ok(!fs.existsSync(path.join(TEST_DIR, '.ghostenvrc')), '.ghostenvrc should be removed after destroying active vault');
  teardown();
}

function testEdgeCases() {
  console.log('Running testEdgeCases...');
  setup();
  
  // Set without init should fail unless global
  const setFail = runCli(['set', 'KEY', 'VAL']);
  assert.notStrictEqual(setFail.status, 0, 'Set without init/global should fail');

  // Destroy global-secrets should fail
  const destroyGlobal = runCli(['destroy', 'global-secrets', '--yes']);
  assert.notStrictEqual(destroyGlobal.status, 0, 'Should not allow destroying global-secrets');

  // Get non-existent key
  runCli(['init', 'empty-proj']);
  const getFail = runCli(['get', 'NON_EXISTENT']);
  assert.notStrictEqual(getFail.status, 0, 'Getting non-existent key should fail');
  
  teardown();
}

try {
  testInit();
  testGlobalSetGet();
  testPrecedenceAndCollision();
  testLifecycle();
  testEdgeCases();
  console.log('\n✅ CLI Tests Passed!');
} catch (err) {
  console.error('\n❌ CLI Tests Failed!');
  console.error(err);
  process.exit(1);
}
