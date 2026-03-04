# GHOSTENV

A secure, local-first environment management system. Ghostenv removes raw secrets from your project directories and centralizes them in a secure global vault, making accidental secret leakage physically impossible.

## Philosophy

Ghostenv is built on three core principles:

1. **Isolation (Ghosting)**: Secrets should not live in your source code directory. Ghostenv moves .env data to a secure OS-level config directory and replaces local files with non-sensitive pointers.
2. **Normalization**: Frameworks use different naming conventions (e.g., NEXT_PUBLIC_SUPABASE_URL vs VITE_SUPABASE_URL). Ghostenv normalizes these into a single API: `env.supabase.url`.
3. **AI-Ready Automation**: The CLI provides a 100% programmatic API surface, allowing AI agents to autonomously manage the project security lifecycle.

## Installation

```bash
# Global command line access
npm install -g ghostenv

# Local dependency for your code
npm install ghostenv
```

## Commands (polymorphic)

### Information & Docs
- `genv help`: Show quick command reference.
- `genv docs`: Show the full manual (README).
- `genv info`: Show current project link status.
- `genv where`: Print the package installation path.

### Interactive Mode
- `genv`: Opens the Dashboard for the current project context.
- `genv list`: Opens the Vault Explorer to manage all projects.

### Programmatic Mode (AI-Friendly)
Support for `--json` and `--yes` flags for all automation needs.

#### Project Management
- `genv id`: Show current project unique ID.
- `genv info`: Show current folder link status.
- `genv init [name]`: Initialize a directory with a unique, stable ID.
- `genv link <projectId>`: Link folder to an existing vault.
- `genv unlink`: Remove local link (.ghostenvrc).
- `genv rename <old> <new>`: Rename a vault ID and update local link.
- `genv destroy <id>`: Permanently delete a specific vault.
- `genv prune`: Interactive cleanup of all non-active vaults.

#### Secret Manipulation
- `genv platforms [id]`: List platform instances in a vault.
- `genv keys [--all] [id]`: List keys in a specific or all platform instances.
- `genv set <k> <v> [--platform <p>] [--global]`: Programmatically update a secret.
- `genv get <k> [--platform <p>] [--global]`: Print a secret value to stdout.
- `genv delete <k> [--platform <p>] [--global]`: Remove a specific secret.

#### Automation & Execution
- `genv vault --yes`: Silently migrate local .env files to the global vault.
- `genv exec -- <command>`: Run any command (e.g., `npm test`) with vaulted secrets injected directly into the process environment.
  - **Collision Detection**: `exec` automatically warns if keys clash across global/project/platform scopes.

## AI Integration Protocol

Ghostenv is built for seamless integration with AI agents and automation scripts.

1. **Self-Onboarding**: Run `genv docs` to understand the system architecture and philosophy.
2. **Identity Extraction**: Run `genv id` to retrieve the unique Project ID for the current context.
3. **Capability Discovery**: Run `genv schema` to list supported platforms, or `genv schema <platform>` to see standard key names.
4. **Non-Interactive Execution**: Always use the `--yes` (or `-y`) flag to bypass confirmation prompts.
5. **Programmatic Parsing**: Use the `--json` flag to receive structured output for projects, platforms, and keys.
6. **Global First-Class Support**: Use the `--global` (or `-g`) flag to manage shared secrets from any context.

## Usage in Code

```javascript
const ghostenv = require('ghostenv');
const env = ghostenv(); // Auto-detects project from .ghostenvrc

console.log(env.API_KEY);      // Search across all platforms
console.log(env.supabase.url); // Grouped access
```

---
Minimalist. Secure. Ghostly.
