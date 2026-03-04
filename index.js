const fs = require('fs');
const path = require('path');
const Conf = require('conf');
const { SCHEMAS } = require('./schemas');

/**
 * Master Project Proxy
 * Refined to be enumerable for better debugging.
 */
function createMultiProjectProxy(vaults) {
  // Extract all keys for enumerability
  const getAllKeys = () => {
    const keys = new Set();
    vaults.forEach(v => {
      if (!v.platforms) return;
      Object.keys(v.platforms).forEach(p => keys.add(p)); // Platform names
      if (v.platforms.legacy) Object.keys(v.platforms.legacy).forEach(k => keys.add(k)); // Legacy keys
      Object.values(v.platforms).forEach(pData => {
        if (typeof pData === 'object') Object.keys(pData).forEach(k => keys.add(k)); // Platform keys
      });
    });
    // Add process.env keys
    Object.keys(process.env).forEach(k => keys.add(k));
    return Array.from(keys);
  };

  return new Proxy({}, {
    get(_, prop) {
      if (typeof prop === 'symbol') return undefined;
      const normalize = (s) => String(s).toLowerCase().replace(/[_-]/g, '');
      const normalizedProp = normalize(prop);

      for (const vault of vaults) {
        if (!vault.platforms) continue;
        
        // 1. Platform Names
        const pName = Object.keys(vault.platforms).find(p => normalize(p) === normalizedProp);
        if (pName) return createPlatformProxy(vault.platforms[pName]);

        // 2. Direct Keys (Legacy)
        if (vault.platforms.legacy) {
          const found = Object.keys(vault.platforms.legacy).find(k => normalize(k) === normalizedProp);
          if (found) return vault.platforms.legacy[found];
        }

        // 3. Direct Keys (Platform Sub-keys)
        for (const [pName, pData] of Object.entries(vault.platforms)) {
          if (pName === 'legacy') continue;
          const found = Object.keys(pData).find(k => normalize(k) === normalizedProp);
          if (found) return pData[found];
        }
      }

      // 4. Production/Process.env Fallbacks
      if (process.env[prop]) return process.env[prop];
      const envKey = Object.keys(process.env).find(k => normalize(k) === normalizedProp);
      if (envKey) return process.env[envKey];

      // 5. Schema-based process.env
      for (const [pName, pFields] of Object.entries(SCHEMAS)) {
        const schemaField = Object.keys(pFields).find(f => normalize(f) === normalizedProp);
        if (schemaField) {
          for (const alias of pFields[schemaField]) {
            if (process.env[alias]) return process.env[alias];
          }
        }
      }
      return undefined;
    },
    // Make Object.keys(env) work
    ownKeys() {
      return getAllKeys();
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    }
  });
}

function createPlatformProxy(data) {
  return new Proxy(data, {
    get(target, prop) {
      const normalize = (s) => String(s).toLowerCase().replace(/[_-]/g, '');
      const foundKey = Object.keys(target).find(key => normalize(key) === normalize(prop));
      return foundKey ? target[foundKey] : undefined;
    },
    ownKeys(target) {
      return Object.keys(target);
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    }
  });
}

function getVaultStore(projectId) {
  try {
    const homedir = process.env.HOME || require('os').homedir();
    const PROJECTS_DIR = path.join(homedir, '.config', 'ghostenv-nodejs', 'projects');
    const vaultPath = path.join(PROJECTS_DIR, `${projectId}.json`);
    if (!fs.existsSync(vaultPath)) return null;
    return new Conf({ projectName: 'ghostenv', configName: `projects/${projectId}` }).store;
  } catch (err) { return null; }
}

function ghostenv(input) {
  if (typeof input === 'string' && input.includes('.')) {
    const parts = input.split('.');
    const projectId = parts[0];
    const keyName = parts.slice(1).join('.');
    const vault = getVaultStore(projectId);
    return vault ? createMultiProjectProxy([vault])[keyName] : undefined;
  }

  if (typeof input === 'string') {
    const vault = getVaultStore(input);
    return createMultiProjectProxy(vault ? [vault] : []);
  }

  const vaults = [];
  const globalVault = getVaultStore('global-secrets');
  if (globalVault) vaults.push(globalVault);

  const rcPath = path.join(process.cwd(), '.ghostenvrc');
  if (fs.existsSync(rcPath)) {
    try {
      const raw = fs.readFileSync(rcPath, 'utf8');
      const matches = [...raw.matchAll(/"projectId"\s*:\s*"([^"]+)"/g)];
      
      let pId;
      if (matches.length > 1) {
        pId = matches[0][1];
        process.stderr.write(`[ghostenv] Warning: Multiple project IDs found in .ghostenvrc. Using first: "${pId}"\n`);
      } else {
        pId = JSON.parse(raw).projectId;
      }

      const primary = getVaultStore(pId);
      if (primary) {
        vaults.unshift(primary);
      } else {
        process.stderr.write(`[ghostenv] Warning: Project vault "${pId}" not found.\n`);
      }
      
      const rc = JSON.parse(raw);
      if (Array.isArray(rc.include)) {
        rc.include.forEach(id => {
          const v = getVaultStore(id);
          if (v) vaults.push(v);
        });
      }
    } catch (err) {}
  }

  return createMultiProjectProxy(vaults);
}

module.exports = ghostenv;
