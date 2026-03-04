const Conf = require('conf');
const fs = require('fs');
const path = require('path');

function getVault(projectId) {
  return new Conf({
    projectName: 'ghostenv',
    configName: `projects/${projectId}`,
    clearInvalidConfig: true
  });
}

function vaultExists(projectId) {
  const homedir = process.env.HOME || require('os').homedir();
  const PROJECTS_DIR = path.join(homedir, '.config', 'ghostenv-nodejs', 'projects');
  return fs.existsSync(path.join(PROJECTS_DIR, `${projectId}.json`));
}

function getLocalProjectId() {
  const rcPath = path.join(process.cwd(), '.ghostenvrc');
  if (fs.existsSync(rcPath)) {
    try {
      const raw = fs.readFileSync(rcPath, 'utf8');
      const matches = [...raw.matchAll(/"projectId"\s*:\s*"([^"]+)"/g)];
      
      if (matches.length > 1) {
        const firstId = matches[0][1];
        process.stderr.write(`\x1b[33m[ghostenv] Warning: Multiple project IDs found in .ghostenvrc. 
Ghostenv only supports one primary project per directory. 
Using the first ID found: "${firstId}"\x1b[0m\n`);
        return firstId;
      }

      return JSON.parse(raw).projectId;
    } catch (e) {
      return null;
    }
  }
  return null;
}

function generateUniqueId(baseName) {
  const slug = baseName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const hash = Math.random().toString(16).substring(2, 6);
  return `${slug || 'project'}-${hash}`;
}

module.exports = { getVault, vaultExists, getLocalProjectId, generateUniqueId };
