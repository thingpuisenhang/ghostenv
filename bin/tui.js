#!/usr/bin/env node

const { intro, outro, select, text, note, confirm, isCancel } = require('@clack/prompts');
const pc = require('picocolors');
const Conf = require('conf');
const fs = require('fs');
const path = require('path');
const clipboardy = require('clipboardy');
const { SCHEMAS } = require('../schemas');
const { getLocalProjectId, generateUniqueId, vaultExists } = require('../utils');
const { migrate } = require('../migrate');

const homedir = process.env.HOME || require('os').homedir();
const PROJECTS_DIR = path.join(homedir, '.config', 'ghostenv-nodejs', 'projects');
const norm = (s) => String(s).toLowerCase().replace(/[_-]/g, '');

/**
 * Vault Explorer
 */
async function explorer() {
  intro(`${pc.bgCyan(pc.black(' GHOSTENV VAULT EXPLORER '))}`);
  while (true) {
    if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    if (!fs.existsSync(path.join(PROJECTS_DIR, 'global-secrets.json'))) {
      new Conf({ projectName: 'ghostenv', configName: 'projects/global-secrets' }).set('platforms', { legacy: {} });
    }

    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json') && f !== 'global-secrets.json');
    const options = [
      { value: 'global-secrets', label: pc.cyan('[GLOBAL] Global Secrets') },
      ...files.map(f => ({ value: f.replace('.json', ''), label: `[PROJECT] ${f.replace('.json', '')}` })),
      { value: '_schemas', label: pc.magenta('View Platform Guide') },
      { value: '_help', label: pc.yellow('View Documentation') },
      { value: '_exit', label: pc.dim('Exit Explorer') }
    ];

    const selected = await select({ message: 'Select vault:', options });
    if (isCancel(selected) || selected === '_exit') break;
    
    if (selected === '_help') { showTuiHelp(); continue; }
    if (selected === '_schemas') { await showSchemaGuide(); continue; }

    await manageProject(selected, false);
  }
  outro(pc.cyan('GHOSTENV: Explorer closed.'));
}

async function showSchemaGuide() {
  const platforms = Object.keys(SCHEMAS);
  const choice = await select({
    message: 'Select platform to view standard keys:',
    options: [...platforms.map(p => ({ value: p, label: p.toUpperCase() })), { value: 'back', label: pc.dim('Back') }]
  });
  if (isCancel(choice) || choice === 'back') return;
  
  const keys = Object.keys(SCHEMAS[choice]);
  note(keys.join('\n'), `${choice.toUpperCase()} SCHEMA`);
  return showSchemaGuide();
}

function showTuiHelp() {
  note(`
  CORE COMMANDS
  -----------------------------------------
  genv manage (m)       : Open current project
  genv list   (l)       : Open this explorer
  genv vault  (v)       : Migrate .env files
  genv id               : Show project ID
  
  AUTOMATION
  -----------------------------------------
  genv exec -- <cmd>    : Inject secrets into process
  genv set <k> <v>      : Scriptable update
  genv get <k>          : Programmatic retrieval
  
  PHILOSOPHY
  -----------------------------------------
  1. Ghost secrets off your project disk.
  2. Normalize naming across frameworks.
  3. Absolute prevention of accidental leaks.
  `, 'DOCUMENTATION');
}

/**
 * Onboarding/Recovery
 */
async function onboardLocal(currentId) {
  if (!currentId) {
    intro(`${pc.bgYellow(pc.black(' GHOSTENV INITIALIZE '))}`);
    const shouldInit = await confirm({ message: `Initialize project in "${path.basename(process.cwd())}"?` });
    if (shouldInit === true) {
      const newId = generateUniqueId(path.basename(process.cwd()));
      fs.writeFileSync(path.join(process.cwd(), '.ghostenvrc'), JSON.stringify({ projectId: newId }, null, 2));
      new Conf({ projectName: 'ghostenv', configName: `projects/${newId}` }).set('platforms', { legacy: {} });
      return manageProject(newId, true);
    }
    return explorer();
  } else {
    intro(`${pc.bgRed(pc.black(' GHOSTENV RECOVERY '))}`);
    note(`ID "${currentId}" found in config, but vault file is missing.`, 'STATUS');
    const action = await select({
      message: 'Resolution:',
      options: [
        { value: 'link', label: 'Link to an existing vault' },
        { value: 'reinit', label: `Re-create vault for ID: ${currentId}` },
        { value: 'fresh', label: 'Start fresh with a new ID' },
        { value: 'help', label: 'View Documentation' },
        { value: 'exit', label: 'Exit' }
      ]
    });
    if (isCancel(action) || action === 'exit') return;
    if (action === 'help') { showTuiHelp(); return onboardLocal(currentId); }
    if (action === 'link') {
      const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
      const options = [{ value: 'global-secrets', label: 'Global Secrets' }, ...files.map(f => ({ value: f.replace('.json', ''), label: f.replace('.json', '') }))];
      const target = await select({ message: 'Select target vault:', options });
      if (!isCancel(target)) {
        fs.writeFileSync(path.join(process.cwd(), '.ghostenvrc'), JSON.stringify({ projectId: target }, null, 2));
        return manageProject(target, true);
      }
    }
    if (action === 'reinit') {
      new Conf({ projectName: 'ghostenv', configName: `projects/${currentId}` }).set('platforms', { legacy: {} });
      return manageProject(currentId, true);
    }
    if (action === 'fresh') {
      const newId = generateUniqueId(path.basename(process.cwd()));
      fs.writeFileSync(path.join(process.cwd(), '.ghostenvrc'), JSON.stringify({ projectId: newId }, null, 2));
      new Conf({ projectName: 'ghostenv', configName: `projects/${newId}` }).set('platforms', { legacy: {} });
      return manageProject(newId, true);
    }
  }
}

/**
 * Project Management View
 */
async function manageProject(projectId, isDirectEntry = false) {
  if (isDirectEntry) intro(`${pc.bgCyan(pc.black(' GHOSTENV DASHBOARD '))}`);
  const vault = new Conf({ projectName: 'ghostenv', configName: `projects/${projectId}` });
  while (true) {
    const platforms = vault.get('platforms') || { legacy: {} };
    const platformOptions = Object.keys(platforms).map(p => {
      const schemaKey = Object.keys(SCHEMAS).find(s => p === s || p.startsWith(s + '_'));
      let label = p.toUpperCase();
      if (schemaKey && p !== schemaKey) label = `${schemaKey.toUpperCase()} (${p.replace(schemaKey + '_', '').toUpperCase()})`;
      return { value: p, label, hint: `${Object.keys(platforms[p]).length} keys` };
    });
    platformOptions.push({ value: '_add_platform', label: pc.green('+ Add Platform Instance') });
    platformOptions.push({ value: '_project_settings', label: pc.yellow('[SETTINGS] Project Options') });
    platformOptions.push({ value: '_back', label: isDirectEntry ? pc.dim('Exit Dashboard') : pc.dim('<- Back to Explorer') });

    const choice = await select({ message: `Project: ${pc.bold(pc.cyan(projectId))}`, options: platformOptions });
    if (isCancel(choice) || choice === '_back') break;

    if (choice === '_project_settings') {
      const changed = await projectSettings(projectId, vault);
      if (changed) break; 
      continue;
    }

    if (choice === '_add_platform') {
      const knownPlatforms = Object.keys(SCHEMAS);
      const pChoice = await select({
        message: 'Platform Type:',
        options: [...knownPlatforms.map(p => ({ value: p, label: p.toUpperCase() })), { value: '_custom', label: 'Other' }, { value: '_back', label: pc.dim('Cancel') }]
      });
      if (isCancel(pChoice) || pChoice === '_back') continue;
      
      let finalId = '';
      if (pChoice === '_custom') {
        const customName = await text({ message: 'Platform name:' });
        if (isCancel(customName) || !customName) continue;
        finalId = customName.toLowerCase().replace(/\s+/g, '_');
      } else {
        const suffix = await text({ message: `Instance tag for ${pChoice.toUpperCase()} (e.g. Prod, Staging):`, placeholder: 'default' });
        if (isCancel(suffix)) continue;
        const cleanSuffix = suffix.trim().toLowerCase().replace(/\s+/g, '_');
        finalId = cleanSuffix ? `${pChoice}_${cleanSuffix}` : pChoice;
      }
      platforms[finalId] = {};
      vault.set('platforms', platforms);
      continue;
    }
    await managePlatform(projectId, choice, vault);
  }
  if (isDirectEntry) outro(pc.cyan('GHOSTENV: Concluded.'));
}

async function projectSettings(projectId, vault) {
  const localId = getLocalProjectId();
  const isCurrentFolder = localId !== null;
  while (true) {
    const options = [
      { value: 'rename', label: 'Rename Project ID' },
      { value: 'delete', label: pc.red('[DANGER] Delete Entire Vault') }
    ];
    if (isCurrentFolder) {
      options.unshift({ value: 'relink', label: 'Connect folder to another project' });
      options.unshift({ value: 'vault', label: 'Vault .env files now' });
    }
    options.push({ value: 'back', label: pc.dim('<- Back') });
    const action = await select({ message: `Settings: ${projectId}`, options });
    if (isCancel(action) || action === 'back') break;
    if (action === 'vault') { await migrate(process.cwd()); note('Vaulting finished.', 'STATUS'); }
    else if (action === 'relink') {
      const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
      const linkOptions = [{ value: 'global-secrets', label: 'Global Secrets' }, ...files.map(f => ({ value: f.replace('.json', ''), label: f.replace('.json', '') }))].filter(o => o.value !== localId);
      const target = await select({ message: 'Select project to link:', options: linkOptions });
      if (!isCancel(target)) {
        fs.writeFileSync(path.join(process.cwd(), '.ghostenvrc'), JSON.stringify({ projectId: target }, null, 2));
        note(`Folder linked to: ${target}`, 'SUCCESS');
        return true;
      }
    } else if (action === 'rename') {
      const newName = await text({ message: 'New name:', initialValue: projectId });
      if (!isCancel(newName) && newName !== projectId) {
        const newId = generateUniqueId(newName);
        const newVault = new Conf({ projectName: 'ghostenv', configName: `projects/${newId}` });
        newVault.store = vault.store;
        fs.unlinkSync(path.join(PROJECTS_DIR, `${projectId}.json`));
        if (localId === projectId) fs.writeFileSync(path.join(process.cwd(), '.ghostenvrc'), JSON.stringify({ projectId: newId }, null, 2));
        note(`Renamed to ${newId}`, 'SUCCESS');
        return true;
      }
    } else if (action === 'delete') {
      if (projectId === 'global-secrets') { note(pc.red('Cannot delete Global Secrets.'), 'ERROR'); continue; }
      if (await confirm({ message: `Delete "${projectId}" vault?` }) === true) {
        fs.unlinkSync(path.join(PROJECTS_DIR, `${projectId}.json`));
        if (localId === projectId) fs.unlinkSync(path.join(process.cwd(), '.ghostenvrc'));
        return true;
      }
    }
  }
  return false;
}

async function managePlatform(projectId, platformId, vault) {
  while (true) {
    const platforms = vault.get('platforms');
    const keys = platforms[platformId] || {};
    const keyOptions = Object.keys(keys).map(k => ({ value: k, label: k, hint: pc.dim(`val: ${keys[k].length > 10 ? keys[k].substring(0, 6) + '...' : keys[k]}`) }));
    keyOptions.push({ value: '_add', label: pc.green('+ Add New Key') });
    if (platformId !== 'legacy') keyOptions.push({ value: '_delete_platform', label: pc.red('[DELETE] Delete Instance') });
    keyOptions.push({ value: '_back', label: pc.dim('<- Back') });
    const selectedKey = await select({ message: `${pc.cyan(projectId)} / ${pc.magenta(platformId.toUpperCase())}`, options: keyOptions });
    if (isCancel(selectedKey) || selectedKey === '_back') break;
    if (selectedKey === '_delete_platform') {
      if (await confirm({ message: `Delete "${platformId}"?` }) === true) {
        delete platforms[platformId];
        vault.set('platforms', platforms);
        break;
      }
      continue;
    }
    if (selectedKey === '_add') {
      let kName = null;
      const basePlatform = Object.keys(SCHEMAS).find(s => platformId === s || platformId.startsWith(s + '_'));
      if (basePlatform) {
        const kChoice = await select({
          message: `Select ${basePlatform.toUpperCase()} key:`,
          options: [...Object.keys(SCHEMAS[basePlatform]).map(k => ({ value: k, label: k })), { value: '_custom', label: 'Custom' }, { value: '_back', label: pc.dim('Cancel') }]
        });
        if (isCancel(kChoice) || kChoice === '_back') continue;
        kName = kChoice === '_custom' ? await text({ message: 'Key name:' }) : kChoice;
      } else {
        kName = await text({ message: 'Key name:' });
      }
      if (!isCancel(kName) && kName) {
        const existingKey = Object.keys(keys).find(k => norm(k) === norm(kName));
        if (existingKey && !await confirm({ message: `Overwrite "${existingKey}"?` })) continue;
        const kVal = await text({ message: `Value for ${kName}:` });
        if (!isCancel(kVal)) {
          platforms[platformId][existingKey || kName] = kVal;
          vault.set('platforms', platforms);
        }
      }
      continue;
    }
    const action = await select({ message: `Action: ${pc.bold(selectedKey)}`, options: [{ value: 'usage', label: 'Copy Usage Code' }, { value: 'view', label: 'View Value' }, { value: 'edit', label: 'Edit Value' }, { value: 'rename', label: 'Rename Key' }, { value: 'delete', label: pc.red('Delete Key') }, { value: 'cancel', label: pc.dim('Cancel') }] });
    if (isCancel(action) || action === 'cancel') continue;
    if (action === 'usage') {
      const localCode = `const env = require('ghostenv')();\nconst key = env.${selectedKey};`;
      const groupedCode = `const env = require('ghostenv')();\nconst key = env.${platformId}.${selectedKey};`;
      const externalCode = `const key = require('ghostenv')('${projectId}.${selectedKey}');`;
      const copyChoice = await select({ message: 'Copy version:', options: [{ value: 'local', label: 'Internal (Search)', hint: `env.${selectedKey}` }, { value: 'grouped', label: 'Internal (Explicit)', hint: `env.${platformId}.${selectedKey}` }, { value: 'external', label: 'External (Path)', hint: `${projectId}.${selectedKey}` }, { value: 'back', label: 'Back' }] });
      if (!isCancel(copyChoice) && copyChoice !== 'back') {
        clipboardy.writeSync(copyChoice === 'local' ? localCode : copyChoice === 'grouped' ? groupedCode : externalCode);
        note('Snippet copied!', 'SUCCESS');
      }
    } else if (action === 'view') {
      note(`${pc.bold(selectedKey)}: ${pc.yellow(keys[selectedKey])}`, 'VAULT VIEW');
    } else if (action === 'edit') {
      const newVal = await text({ message: `New value:`, initialValue: keys[selectedKey] });
      if (!isCancel(newVal)) { platforms[platformId][selectedKey] = newVal; vault.set('platforms', platforms); }
    } else if (action === 'rename') {
      const newName = await text({ message: `New name:`, initialValue: selectedKey });
      if (!isCancel(newName) && newName !== selectedKey) {
        platforms[platformId][newName] = platforms[platformId][selectedKey];
        delete platforms[platformId][selectedKey];
        vault.set('platforms', platforms);
      }
    } else if (action === 'delete') {
      if (await confirm({ message: `Delete key "${selectedKey}"?` }) === true) {
        delete platforms[platformId][selectedKey];
        vault.set('platforms', platforms);
      }
    }
  }
}

if (require.main === module) explorer().catch(console.error);
module.exports = { 
  explorer, 
  onboardLocal, 
  manageProject, 
  confirm, 
  isCancel, 
  intro, 
  outro, 
  select, 
  text, 
  note,
  PROJECTS_DIR
};
