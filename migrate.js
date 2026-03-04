const fs = require('fs');
const path = require('path');
const readline = require('readline');
const pc = require('picocolors');
const Conf = require('conf');
const { identifyKey } = require('./schemas');
const { getLocalProjectId, generateUniqueId } = require('./utils');

/**
 * Robust Vaulting Engine
 */
async function migrate(targetDir, force = false) {
  let rl;
  const ask = (query) => {
    if (force) return Promise.resolve('y');
    if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(query, resolve));
  };

  const rcPath = path.join(targetDir, '.ghostenvrc');
  const allEnvFiles = fs.readdirSync(targetDir).filter(f => f.startsWith('.env'));
  const validEnvFiles = allEnvFiles.filter(f => {
    const content = fs.readFileSync(path.join(targetDir, f), 'utf8');
    return !content.includes('GHOSTED BY GHOSTENV');
  });

  if (validEnvFiles.length === 0) {
    if (!force) console.log(pc.green('✔ All detected .env files are already ghosted. Nothing to do.'));
    if (rl) rl.close();
    return;
  }

  // 1. DISCLAIMER
  if (!force) {
    console.log(`\n${pc.bgYellow(pc.black(' ⚠  GHOSTENV: LOCAL SECRETS DETECTED '))}`);
    console.log(`${pc.yellow('The following files contain unvaulted secrets:')}`);
    validEnvFiles.forEach(f => console.log(pc.dim(` - ${f}`)));
  }
  
  const proceed = await ask(`Proceed with vaulting? (y/n): `);
  if (proceed.toLowerCase() !== 'y') {
    console.log(pc.red('Vaulting cancelled.'));
    if (rl) rl.close();
    return;
  }

  // 2. IDENTITY
  let projectId = getLocalProjectId();
  if (!projectId) {
    projectId = generateUniqueId(path.basename(targetDir));
    const config = {
      projectId,
      note: "Multiple project IDs are not supported. Use 'genv link <id>' to switch projects."
    };
    fs.writeFileSync(rcPath, JSON.stringify(config, null, 2));
    if (!force) console.log(`${pc.dim('🆔 Project ID:')} ${pc.cyan(projectId)}`);
  }

  // 3. SCAN & ROBUST PARSE
  const vault = new Conf({ projectName: 'ghostenv', configName: `projects/${projectId}` });
  const existingPlatforms = vault.get('platforms') || { legacy: {} };
  let newKeysFound = 0;

  validEnvFiles.forEach(file => {
    const content = fs.readFileSync(path.join(targetDir, file), 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^\s*([\w.-]+)\s*[=:]\s*(.*)?$/);
      if (match) {
        const k = match[1].trim();
        let v = (match[2] || '').trim().split('#')[0].trim().replace(/^["']|["']$/g, '');
        const identity = identifyKey(k);
        if (identity) {
          if (!existingPlatforms[identity.platform]) existingPlatforms[identity.platform] = {};
          existingPlatforms[identity.platform][identity.normalized] = v;
        } else {
          existingPlatforms.legacy[k] = v;
        }
        newKeysFound++;
      }
    });
  });

  if (newKeysFound === 0) {
    console.log(pc.red(`\n❌ No valid key-value pairs found in the detected files.`));
    if (rl) rl.close();
    return;
  }

  // 4. SAVE & GHOST
  vault.set('migratedAt', new Date().toISOString());
  vault.set('platforms', existingPlatforms);

  const homedir = process.env.HOME || require('os').homedir();
  const PROJECTS_DIR = path.join(homedir, '.config', 'ghostenv-nodejs', 'projects');
  const tombstone = `
# 👻 GHOSTED BY GHOSTENV
# ---------------------------------------------------------
# Your secrets have been moved to your secure vault:
# ${path.join(PROJECTS_DIR, `${projectId}.json`)}
#
# DO NOT ADD SECRETS HERE. 
# Manage them with: genv manage
# ---------------------------------------------------------
`;

  validEnvFiles.forEach(f => fs.writeFileSync(path.join(targetDir, f), tombstone));

  // 5. GIT HYGIENE
  const gitignorePath = path.join(targetDir, '.gitignore');
  const GHOST_IGNORE_BLOCK = `\n# 👻 ghostenv\n.env\n.env.*\n.npmrc\n`;
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, GHOST_IGNORE_BLOCK);
  } else {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    if (!content.includes('ghostenv')) {
      fs.appendFileSync(gitignorePath, GHOST_IGNORE_BLOCK);
    }
  }

  console.log(`\n${pc.green('✔ Vaulting complete!')} Merged ${newKeysFound} keys into ${pc.bold(projectId)}.`);
  if (rl) rl.close();
}

module.exports = { migrate };
