const { setup, teardown, runCli, createEnvFile, TEST_DIR } = require('./test-utils');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testMigration() {
  console.log('Running testMigration...');
  setup();
  
  // Create a .env file with mix of keys
  const envContent = `
# This is a comment
DB_PASS=hunter2
SUPABASE_URL=https://abc.supabase.co
GITHUB_TOKEN="ghp_123"
CUSTOM_KEY = some_val  # with comment
`;
  createEnvFile(TEST_DIR, '.env', envContent);

  // Run vault
  const res = runCli(['vault', '--yes']);
  assert.strictEqual(res.status, 0, 'Vault should succeed');

  // Verify .env is ghosted
  const ghostedContent = fs.readFileSync(path.join(TEST_DIR, '.env'), 'utf8');
  assert.ok(ghostedContent.includes('GHOSTED BY GHOSTENV'), '.env should be ghosted');

  // Verify .gitignore is updated
  const gitignore = fs.readFileSync(path.join(TEST_DIR, '.gitignore'), 'utf8');
  assert.ok(gitignore.includes('.env'), '.gitignore should include .env');

  // Verify keys are in vault
  const getDb = runCli(['get', 'DB_PASS', '--platform', 'legacy']);
  assert.strictEqual(getDb.stdout.toString().trim(), 'hunter2', 'Legacy key should be migrated');

  const getSupa = runCli(['get', 'url', '--platform', 'supabase']);
  assert.strictEqual(getSupa.stdout.toString().trim(), 'https://abc.supabase.co', 'Platform key should be normalized');

  const getCustom = runCli(['get', 'CUSTOM_KEY']);
  assert.strictEqual(getCustom.stdout.toString().trim(), 'some_val', 'Custom key should be migrated correctly');
  
  teardown();
}

function testEmptyFiles() {
  console.log('Running testEmptyFiles...');
  setup();
  createEnvFile(TEST_DIR, '.env', '# Only comments\n\n');
  const res = runCli(['vault', '--yes']);
  // The current implementation prints error message if no keys found, but exit code might be 0
  assert.ok(res.stdout.toString().includes('No valid key-value pairs'), 'Should report no keys found');
  teardown();
}

try {
  testMigration();
  testEmptyFiles();
  console.log('\n✅ Migration Tests Passed!');
} catch (err) {
  console.error('\n❌ Migration Tests Failed!');
  console.error(err);
  process.exit(1);
}
