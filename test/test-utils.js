const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const TEST_DIR = path.join(os.tmpdir(), `ghostenv-test-${Math.random().toString(36).substring(7)}`);
const PROJECTS_DIR = path.join(TEST_DIR, '.config', 'ghostenv-nodejs', 'projects');

function setup() {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  return TEST_DIR;
}

function teardown() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function runCli(args, cwd = TEST_DIR) {
  const cliPath = path.join(__dirname, '..', 'bin', 'cli.js');
  return spawnSync('node', [cliPath, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: TEST_DIR, // Redirect config to our temp dir
      USERPROFILE: TEST_DIR // Windows support
    }
  });
}

function createEnvFile(dir, name, content) {
  fs.writeFileSync(path.join(dir, name), content);
}

module.exports = { setup, teardown, runCli, createEnvFile, TEST_DIR, PROJECTS_DIR };
