const { setup, teardown, runCli, createEnvFile, TEST_DIR } = require('./test-utils');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testMultipleProjectIds() {
  console.log('Running testMultipleProjectIds...');
  setup();
  
  // Manually create a malformed/multi-key .ghostenvrc
  const malformedRc = `
  {
    "projectId": "first-id",
    "note": "some note",
    "projectId": "second-id"
  }
  `;
  fs.writeFileSync(path.join(TEST_DIR, '.ghostenvrc'), malformedRc);
  
  // Create the vaults so they exist
  const projectsDir = path.join(TEST_DIR, '.config', 'ghostenv-nodejs', 'projects');
  fs.writeFileSync(path.join(projectsDir, 'first-id.json'), JSON.stringify({ platforms: { legacy: { KEY: 'val1' } } }));
  fs.writeFileSync(path.join(projectsDir, 'second-id.json'), JSON.stringify({ platforms: { legacy: { KEY: 'val2' } } }));

  const res = runCli(['get', 'KEY']);
  const output = res.stdout.toString().trim();
  const stderr = res.stderr.toString();

  // Should pick the FIRST one based on our regex logic, even though JSON.parse would pick the last
  assert.ok(output.includes('val1'), 'Should prioritize the first projectId found in the file');
  assert.ok(stderr.includes('Warning: Multiple project IDs found'), 'Should show warning');
  
  teardown();
}

function testSpacingAndFormatting() {
  console.log('Running testSpacingAndFormatting...');
  setup();
  
  const weirdSpacing = `{
    "projectId"  : 
       "spaced-id"
  }`;
  fs.writeFileSync(path.join(TEST_DIR, '.ghostenvrc'), weirdSpacing);
  const projectsDir = path.join(TEST_DIR, '.config', 'ghostenv-nodejs', 'projects');
  fs.writeFileSync(path.join(projectsDir, 'spaced-id.json'), JSON.stringify({ platforms: { legacy: { KEY: 'ok' } } }));

  const res = runCli(['get', 'KEY']);
  assert.strictEqual(res.stdout.toString().trim(), 'ok', 'Should handle weird spacing in .ghostenvrc');
  
  teardown();
}

function testProjectIdAsValue() {
  console.log('Running testProjectIdAsValue...');
  setup();
  
  // "projectId" appears as a value, but only one actual key
  const trickyRc = `{
    "projectId": "real-id",
    "other": "this is not a projectId: 'fake-id'"
  }`;
  fs.writeFileSync(path.join(TEST_DIR, '.ghostenvrc'), trickyRc);
  const projectsDir = path.join(TEST_DIR, '.config', 'ghostenv-nodejs', 'projects');
  fs.writeFileSync(path.join(projectsDir, 'real-id.json'), JSON.stringify({ platforms: { legacy: { KEY: 'real' } } }));

  const res = runCli(['get', 'KEY']);
  const stderr = res.stderr.toString();
  
  assert.strictEqual(res.stdout.toString().trim(), 'real', 'Should correctly identify the real projectId key');
  assert.ok(!stderr.includes('Warning: Multiple project IDs'), 'Should not trigger warning if projectId only appears as a key once');
  
  teardown();
}

function testRenameToExisting() {
  console.log('Running testRenameToExisting...');
  setup();
  
  runCli(['init', 'proj1']);
  runCli(['init', 'proj2']);
  
  const rc1 = JSON.parse(fs.readFileSync(path.join(TEST_DIR, '.ghostenvrc'), 'utf8'));
  const id1 = rc1.projectId;
  
  // Try to rename proj1 to proj2 (or something that slugs to it)
  // Our generateUniqueId adds a hash, so it's hard to collide exactly, 
  // but let's see if it handles the request gracefully.
  const res = runCli(['rename', id1, 'proj2']);
  assert.strictEqual(res.status, 0, 'Rename should succeed (it generates a new unique ID with a hash)');
  
  teardown();
}

try {
  testMultipleProjectIds();
  testSpacingAndFormatting();
  testProjectIdAsValue();
  testRenameToExisting();
  console.log('\n✅ Edge Case Tests Passed!');
} catch (err) {
  console.error('\n❌ Edge Case Tests Failed!');
  console.error(err);
  process.exit(1);
}
