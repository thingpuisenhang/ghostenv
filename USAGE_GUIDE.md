# GHOSTENV USAGE GUIDE

Secure local-first environment management for developers and AI agents.

---

## 1. Core Philosophy: The Ghost Workflow
Ghostenv removes secrets from your project directory and centralizes them in an OS-level vault.
- **Isolation**: Only .ghostenvrc remains in your folder.
- **Safety**: Raw secrets are physically separated from your source code.
- **Portability**: Unique IDs allow folder renaming without breaking secret links.

---

## 2. Standard Workflow
To secure a project from scratch:

### Step 1: Initialize
```bash
genv init my-app
```
Generates a unique ID (e.g., my-app-4f2a) and creates .ghostenvrc.

### Step 2: Add Secrets
```bash
genv set API_KEY "sk_12345"
```

### Step 3: Execute
```bash
genv exec -- npm start
```
Injects all project and global secrets directly into the process memory.

---

## 3. Migration
For projects with existing .env files:
```bash
genv vault
```
Ghostenv scans the directory, moves keys to the vault, and replaces the original files with "Ghost" instruction pointers.

---

## 4. AI & Automation Protocol
Ghostenv is designed for seamless integration with AI agents and scripts.

### Non-Interactive Mode
Use `--yes` or `-y` to bypass all confirmation prompts.

### Deterministic Extraction (for scripts)
To get the project ID programmatically:
```bash
genv id
```

### Discovery
Ask the tool for its own capabilities:
```bash
genv schema           # List all supported platforms
genv schema supabase  # List standard keys for a platform
```

### Auditing
Verify which secrets are being injected into a process and check for collisions:
```bash
genv exec -- env
```

---

## 5. Lifecycle Management
Safely manage your vaults over time.

- **Rename**: `genv rename <old-id> <new-id>` (Updates link automatically)
- **Destroy**: `genv destroy <id>` (Permanent deletion)
- **Prune**: `genv prune` (Interactive multi-vault cleanup)

---

## 6. Global Secrets & Collisions
Standardize access and prevent silent overwrites.

- **Global Secrets**: `genv set API_KEY 123 --global`. Shared keys available to all projects.
- **Collision Detection**: If a key (e.g., `PORT`) exists in both Global and Project vaults, `genv exec` will warn you and use the higher-precedence (Project) value.

---

## 7. Security Rules
- **Auto-Guard**: A git pre-commit hook is installed automatically to block .env commits.
- **Strict Isolation**: Sub-folders prioritize their own vault and cannot leak secrets to parents.

---
Minimalist. Secure. Ghostly.
*Version 1.0.2*
