#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pc = require('picocolors');
const { spawn } = require('child_process');
const Conf = require('conf');
const { migrate } = require('../migrate');
const { getLocalProjectId, generateUniqueId, vaultExists } = require('../utils');
const tui = require('./tui');
const ghostenv = require('../index');
const { SCHEMAS } = require('../schemas');
const pkg = require('../package.json');

// 1. SMART FLAG PARSING (Position-agnostic)
const rawArgs = process.argv.slice(2);
const flags = {
  yes: rawArgs.includes('--yes') || rawArgs.includes('-y'),
  json: rawArgs.includes('--json'),
  all: rawArgs.includes('--all'),
  global: rawArgs.includes('--global') || rawArgs.includes('-g'),
  platform: rawArgs.includes('--platform') ? rawArgs[rawArgs.indexOf('--platform') + 1] : 'legacy'
};

// Filter out flags to get pure positional commands
const filteredArgs = rawArgs.filter((arg, i) => {
  if (arg.startsWith('--') || arg.startsWith('-')) {
    if (arg === '--platform') return false; 
    return false;
  }
  if (i > 0 && rawArgs[i-1] === '--platform') return false;
  return true;
});

const rawCommand = filteredArgs[0];

// Metadata & Help checks
if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
  console.log(`ghostenv v${pkg.version}`);
  process.exit(0);
}

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  showHelp();
  process.exit(0);
}

if (rawCommand === 'where') { console.log(path.dirname(__dirname)); process.exit(0); }
if (rawCommand === 'id') { console.log(getLocalProjectId() || ''); process.exit(0); }

const VALID_COMMANDS = [
  'manage', 'list', 'init', 'vault', 'help', 'set', 'get', 'delete', 'exec', 
  'platforms', 'keys', 'info', 'link', 'unlink', 'where', 'rename-key', 'delete-platform', 'docs', 'schema', 'id',
  'destroy', 'prune', 'rename'
];

const ALIASES = {
  'l': 'list', 'ls': 'list', 'v': 'vault', 'i': 'init', 's': 'set', 'g': 'get', 
  'e': 'exec', 'x': 'exec', 'p': 'platforms', 'k': 'keys', 'd': 'docs'
};

let command = ALIASES[rawCommand] || rawCommand;

// 2. ERROR HANDLER: Unknown Command (with fuzzy matching)
if (rawCommand && !VALID_COMMANDS.includes(command)) {
  let closest = null;
  let minDistance = 2;
  VALID_COMMANDS.forEach(vc => {
    const dist = levenshtein(rawCommand, vc);
    if (dist <= minDistance) { minDistance = dist; closest = vc; }
  });

  console.error(pc.red(`Error: Unknown command "${rawCommand}".`));
  if (closest) {
    console.error(pc.yellow(`Did you mean "${closest}"?`));
  }
  console.error(pc.dim('Run "genv help" to see all available commands.'));
  process.exit(1);
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}

async function run() {
  const localId = getLocalProjectId();
  const isTTY = process.stdin.isTTY;

  const ensureInteractive = () => {
    if (!isTTY && !flags.yes) {
      console.error(pc.red('Error: This command requires interactivity or the --yes flag.'));
      process.exit(1);
    }
  };

  switch (command) {
    case 'manage':
    case undefined:
      if (!rawCommand && isTTY) {
        // Just "genv" was run
        if (localId && vaultExists(localId)) await tui.manageProject(localId, true);
        else await tui.onboardLocal(localId);
      } else if (command === 'manage') {
        ensureInteractive();
        if (localId && vaultExists(localId)) await tui.manageProject(localId, true);
        else await tui.onboardLocal(localId);
      } else {
        showHelp();
      }
      break;

    case 'list':
      if (flags.json) {
        const dir = path.join(require('os').homedir(), '.config', 'ghostenv-nodejs', 'projects');
        const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
        console.log(JSON.stringify(files.map(f => f.replace('.json', '')), null, 2));
      } else {
        ensureInteractive();
        await tui.explorer();
      }
      break;

    case 'docs':
      console.log(fs.readFileSync(path.join(path.dirname(__dirname), 'README.md'), 'utf8'));
      break;

    case 'id':
      console.log(localId || '');
      break;

    case 'schema':
      const sType = filteredArgs[1];
      if (!sType) {
        const list = Object.keys(SCHEMAS);
        if (flags.json) console.log(JSON.stringify(list));
        else console.log(`${pc.cyan('Supported Platforms:')}\n - ${list.join('\n - ')}`);
      } else {
        const keys = SCHEMAS[sType.toLowerCase()];
        if (!keys) {
          console.error(pc.red(`Error: Unknown platform "${sType}".`));
          console.error(pc.dim('Run "genv schema" to see supported platforms.'));
          process.exit(1);
        }
        if (flags.json) console.log(JSON.stringify(Object.keys(keys)));
        else console.log(`${pc.cyan(`Standard keys for ${sType.toUpperCase()}:`)}\n - ${Object.keys(keys).join('\n - ')}`);
      }
      break;

    case 'info':
      if (flags.json) console.log(JSON.stringify({ projectId: localId }));
      else if (!localId) {
        console.error(pc.red('Error: This directory is not initialized.'));
        console.error(pc.dim('Run "genv init" or "genv vault" to get started.'));
        process.exit(1);
      } else console.log(`${pc.cyan('Linked Project ID:')} ${pc.bold(localId)}`);
      break;

    case 'init':
      if (localId) {
        console.error(pc.yellow(`Error: Folder already linked to project "${localId}".`));
        process.exit(1);
      } else {
        const id = generateUniqueId(filteredArgs[1] || path.basename(process.cwd()));
        const config = {
          projectId: id,
          note: "Multiple project IDs are not supported. Use 'genv link <id>' to switch projects."
        };
        fs.writeFileSync(path.join(process.cwd(), '.ghostenvrc'), JSON.stringify(config, null, 2));
        new Conf({ projectName: 'ghostenv', configName: `projects/${id}` }).set('platforms', { legacy: {} });
        console.log(pc.green(`Success: Project initialized with ID: ${id}`));
      }
      break;

    case 'link':
      const targetId = filteredArgs[1];
      if (!targetId) {
        console.error(pc.red('Error: Missing Project ID.'));
        console.error(pc.dim('Usage: genv link <projectId>'));
        process.exit(1);
      }
      if (!vaultExists(targetId)) {
        console.error(pc.red(`Error: Vault "${targetId}" not found.`));
        console.error(pc.dim('Run "genv list" to see available vaults.'));
        process.exit(1);
      }
      const linkConfig = {
        projectId: targetId,
        note: "Multiple project IDs are not supported. Use 'genv link <id>' to switch projects."
      };
      fs.writeFileSync(path.join(process.cwd(), '.ghostenvrc'), JSON.stringify(linkConfig, null, 2));
      console.log(pc.green(`✔ Folder linked to vault: ${targetId}`));
      break;

    case 'unlink':
      const rc = path.join(process.cwd(), '.ghostenvrc');
      if (fs.existsSync(rc)) {
        fs.unlinkSync(rc);
        console.log(pc.green('✔ Successfully unlinked folder from vault.'));
      } else {
        console.error(pc.red('Error: This folder is not linked to any vault.'));
        process.exit(1);
      }
      break;

    case 'destroy':
      const dId = filteredArgs[1];
      if (!dId) {
        console.error(pc.red('Error: Missing Vault ID to destroy.'));
        process.exit(1);
      }
      if (dId === 'global-secrets') {
        console.error(pc.red('Error: Cannot destroy global-secrets.'));
        process.exit(1);
      }
      if (!vaultExists(dId)) {
        console.error(pc.red(`Error: Vault "${dId}" does not exist.`));
        process.exit(1);
      }
      if (!flags.yes) {
        ensureInteractive();
        const confirm = await tui.confirm({ message: `Are you SURE you want to permanently delete vault "${dId}"?` });
        if (!confirm || tui.isCancel(confirm)) {
          console.log(pc.dim('Operation cancelled.'));
          process.exit(0);
        }
      }
      fs.unlinkSync(path.join(tui.PROJECTS_DIR, `${dId}.json`));
      if (localId === dId) {
        const rcPath = path.join(process.cwd(), '.ghostenvrc');
        if (fs.existsSync(rcPath)) fs.unlinkSync(rcPath);
      }
      console.log(pc.green(`✔ Vault "${dId}" destroyed.`));
      break;

    case 'prune':
      ensureInteractive();
      const allFiles = fs.readdirSync(tui.PROJECTS_DIR).filter(f => f.endsWith('.json') && f !== 'global-secrets.json');
      const vaults = allFiles.map(f => f.replace('.json', ''));
      if (vaults.length === 0) {
        console.log(pc.dim('No project vaults found to prune.'));
        process.exit(0);
      }
      const toPrune = await tui.select({
        message: 'Select vaults to PERMANENTLY delete:',
        options: vaults.map(v => ({ value: v, label: v, hint: v === localId ? pc.yellow('(Current Project)') : '' })),
        multiple: true
      });
      if (tui.isCancel(toPrune) || !toPrune || toPrune.length === 0) {
        console.log(pc.dim('Nothing pruned.'));
        process.exit(0);
      }
      for (const pId of toPrune) {
        fs.unlinkSync(path.join(tui.PROJECTS_DIR, `${pId}.json`));
        if (localId === pId) {
          const rcPath = path.join(process.cwd(), '.ghostenvrc');
          if (fs.existsSync(rcPath)) fs.unlinkSync(rcPath);
        }
      }
      console.log(pc.green(`✔ Pruned ${toPrune.length} vaults.`));
      break;

    case 'rename':
      const oldId = filteredArgs[1];
      const newIdRaw = filteredArgs[2];
      if (!oldId || !newIdRaw) {
        console.error(pc.red('Error: Usage: genv rename <old-id> <new-id>'));
        process.exit(1);
      }
      if (!vaultExists(oldId)) {
        console.error(pc.red(`Error: Vault "${oldId}" not found.`));
        process.exit(1);
      }
      const newId = generateUniqueId(newIdRaw);
      const oldPath = path.join(tui.PROJECTS_DIR, `${oldId}.json`);
      const newPath = path.join(tui.PROJECTS_DIR, `${newId}.json`);
      fs.renameSync(oldPath, newPath);
      if (localId === oldId) {
        fs.writeFileSync(path.join(process.cwd(), '.ghostenvrc'), JSON.stringify({ projectId: newId }, null, 2));
      }
      console.log(pc.green(`✔ Vault renamed from "${oldId}" to "${newId}".`));
      break;

    case 'platforms':
      const pId = filteredArgs[1] || localId;
      if (!pId) {
        console.error(pc.red('Error: No project context found.'));
        console.error(pc.dim('Initialize this folder or provide a Project ID: genv platforms <id>'));
        process.exit(1);
      }
      const plist = Object.keys(new Conf({ projectName: 'ghostenv', configName: `projects/${pId}` }).get('platforms', {}));
      if (flags.json) console.log(JSON.stringify(plist));
      else {
        console.log(pc.cyan(`Platforms in ${pId}:`));
        plist.forEach(p => console.log(` - ${p}`));
      }
      break;

    case 'keys':
      const kId = (filteredArgs[1] && filteredArgs[1] !== '--all') ? filteredArgs[1] : localId;
      if (!kId) {
        console.error(pc.red('Error: No project context found.'));
        console.error(pc.dim('Usage: genv keys [--all] [projectId]'));
        process.exit(1);
      }
      const kPlatforms = new Conf({ projectName: 'ghostenv', configName: `projects/${kId}` }).get('platforms', {});
      if (flags.all) {
        if (flags.json) console.log(JSON.stringify(kPlatforms, null, 2));
        else Object.entries(kPlatforms).forEach(([n, d]) => {
          console.log(pc.cyan(`Platform: ${n}`));
          Object.keys(d).forEach(k => console.log(`  - ${k}`));
        });
      } else {
        const klist = Object.keys(kPlatforms[flags.platform] || {});
        if (klist.length === 0) {
          console.log(pc.dim(`No keys found in platform "${flags.platform}".`));
        } else {
          if (flags.json) console.log(JSON.stringify(klist));
          else klist.forEach(k => console.log(` - ${k}`));
        }
      }
      break;

    case 'set':
      const targetSetId = flags.global ? 'global-secrets' : localId;
      if (!targetSetId) {
        console.error(pc.red('Error: Folder not initialized.'));
        console.error(pc.dim('Initialize with "genv init" or use "--global".'));
        process.exit(1);
      }
      const [sk, sv] = [filteredArgs[1], filteredArgs[2]];
      if (!sk || sv === undefined) {
        console.error(pc.red('Error: Missing arguments.'));
        console.error(pc.dim('Usage: genv set <key> <value> [--platform <name>] [--global]'));
        process.exit(1);
      }
      const sVault = new Conf({ projectName: 'ghostenv', configName: `projects/${targetSetId}` });
      const sPlatforms = sVault.get('platforms') || {};
      if (!sPlatforms[flags.platform]) sPlatforms[flags.platform] = {};
      sPlatforms[flags.platform][sk] = sv;
      sVault.set('platforms', sPlatforms);
      console.log(pc.green(`✔ Updated ${sk} in ${flags.platform} (${flags.global ? 'global' : 'local'})`));
      break;

    case 'get':
      const gKey = filteredArgs[1];
      if (!gKey) {
        console.error(pc.red('Error: Missing key name.'));
        console.error(pc.dim('Usage: genv get <key> [--platform <name>] [--global]'));
        process.exit(1);
      }
      let gVal;
      if (flags.global) {
        const gVault = new Conf({ projectName: 'ghostenv', configName: 'projects/global-secrets' }).get('platforms', {});
        gVal = gVault[flags.platform] ? gVault[flags.platform][gKey] : undefined;
      } else {
        const env = ghostenv();
        gVal = (rawArgs.includes('--platform')) ? (env[flags.platform] ? env[flags.platform][gKey] : undefined) : env[gKey];
      }
      
      if (flags.json) console.log(JSON.stringify({ [gKey]: gVal }));
      else {
        if (gVal === undefined) {
          console.error(pc.red(`Error: Key "${gKey}" not found.`));
          process.exit(1);
        } else {
          console.log(gVal);
        }
      }
      break;

    case 'delete':
      const targetDelId = flags.global ? 'global-secrets' : localId;
      if (!targetDelId) {
        console.error(pc.red('Error: Folder not initialized.'));
        process.exit(1);
      }
      const dKey = filteredArgs[1];
      if (!dKey) {
        console.error(pc.red('Error: Missing key name to delete.'));
        process.exit(1);
      }
      const dVault = new Conf({ projectName: 'ghostenv', configName: `projects/${targetDelId}` });
      const dPlatforms = dVault.get('platforms') || {};
      let targetP = flags.platform;
      if (!rawArgs.includes('--platform')) {
        const found = Object.keys(dPlatforms).filter(p => dPlatforms[p][dKey] !== undefined);
        if (found.length === 0) {
          console.error(pc.red(`Error: Key "${dKey}" not found.`));
          process.exit(1);
        }
        if (found.length > 1) {
          console.error(pc.red(`Error: Ambiguous key. Found in multiple platforms: ${found.join(', ')}.`));
          console.error(pc.dim('Use --platform to specify which one to delete.'));
          process.exit(1);
        }
        targetP = found[0];
      }
      if (dPlatforms[targetP]) {
        delete dPlatforms[targetP][dKey];
        dVault.set('platforms', dPlatforms);
        console.log(pc.green(`✔ Successfully deleted ${dKey} from ${targetP} (${flags.global ? 'global' : 'local'})`));
      }
      break;

    case 'vault':
      await migrate(process.cwd(), flags.yes);
      break;

    case 'exec':
      const cmdStart = rawArgs.indexOf('--');
      if (cmdStart === -1) {
        console.error(pc.red('Error: Missing command to execute.'));
        console.error(pc.dim('Usage: genv exec -- <command>'));
        process.exit(1);
      }
      const fullEnv = { ...process.env };
      Object.assign(fullEnv, extractAllSecrets());
      const child = spawn(rawArgs[cmdStart+1], rawArgs.slice(cmdStart+2), { stdio: 'inherit', env: fullEnv });
      child.on('exit', (code) => process.exit(code));
      break;

    case 'help':
      showHelp();
      break;

    default:
      // Should not be reachable due to fuzzy check above
      showHelp();
      break;
  }
}

function extractAllSecrets() {
  const res = {};
  const collisions = [];
  const gVault = new Conf({ projectName: 'ghostenv', configName: 'projects/global-secrets' }).get('platforms', {});
  const localId = getLocalProjectId();
  const lVault = localId ? new Conf({ projectName: 'ghostenv', configName: `projects/${localId}` }).get('platforms', {}) : {};

  // 1. Global (Lowest)
  Object.values(gVault).forEach(d => {
    Object.keys(d).forEach(k => {
      res[k] = d[k];
    });
  });

  // 2. Project Legacy
  if (lVault.legacy) {
    Object.keys(lVault.legacy).forEach(k => {
      if (res[k] !== undefined && res[k] !== lVault.legacy[k]) collisions.push(k);
      res[k] = lVault.legacy[k];
    });
  }

  // 3. Project Platforms (Highest)
  Object.keys(lVault).sort().forEach(p => {
    if (p !== 'legacy') {
      Object.keys(lVault[p]).forEach(k => {
        if (res[k] !== undefined && res[k] !== lVault[p][k]) collisions.push(k);
        res[k] = lVault[p][k];
      });
    }
  });
  
  if (collisions.length > 0) {
    process.stderr.write(pc.yellow(`[ghostenv] Warning: Collision detected for keys: ${[...new Set(collisions)].join(', ')}\n`));
    process.stderr.write(pc.dim('Higher precedence values will be used.\n'));
  }

  return res;
}

function showHelp() {
  console.log(`
${pc.bgCyan(pc.black(' GHOSTENV CLI ')) } v${pkg.version}
${pc.dim('Secure, local-first environment management system.')}

${pc.bold('CORE COMMANDS')}
  ${pc.bold('manage')} (m)     - Project Dashboard (Interactive)
  ${pc.bold('list')}   (l)     - Vault Explorer (All projects)
  ${pc.bold('vault')}  (v)     - Scan and migrate local .env files
  ${pc.bold('exec')} -- <cmd>  - Run command with ALL secrets injected

${pc.bold('SECRET MANIPULATION')}
  ${pc.bold('set')} <k> <v>     - Set secret (Use --platform or --global)
  ${pc.bold('get')} <k>         - Print secret value
  ${pc.bold('keys')} [--all]    - List keys in project vault

${pc.bold('VAULT LIFECYCLE')}
  ${pc.bold('rename')} <o> <n>  - Rename a vault ID
  ${pc.bold('destroy')} <id>    - Permanently delete a vault
  ${pc.bold('prune')}          - Interactive cleanup of old vaults

${pc.bold('GLOBAL SECRETS')}
  ${pc.cyan('genv set API_KEY 123 --global')}
  ${pc.cyan('genv get API_KEY --global')}

${pc.bold('AUTOMATION PROTOCOL')}
  Use ${pc.bold('--yes')} for CI/AI and ${pc.bold('--json')} for machine output.

${pc.bold('EXAMPLES')}
  $ genv exec -- npm start
  $ genv set DB_PASS hunter2 --platform supabase_prod
`);
}

run().catch(console.error);
