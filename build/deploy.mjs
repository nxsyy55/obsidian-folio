/**
 * deploy.mjs — copy built artifacts to an Obsidian vault plugin folder.
 *
 * Vault path resolution order:
 *   1. vault.config.json  { "vaultPath": "..." }  (gitignored, machine-local)
 *   2. ../ relative to this repo (legacy fallback for the original dev machine)
 *
 * First-time setup on a new machine:
 *   cp vault.config.json.example vault.config.json
 *   # then edit vault.config.json with your vault path
 */

import { existsSync, copyFileSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

// ── Resolve vault path ─────────────────────────────────────────────────────
let vaultPath = resolve(root, '..');   // legacy default: parent folder

const configFile = join(root, 'vault.config.json');
if (existsSync(configFile)) {
    try {
        const raw = readFileSync(configFile, 'utf8').replace(/^\uFEFF/, '');  // strip BOM
        const cfg = JSON.parse(raw);
        if (typeof cfg.vaultPath === 'string' && cfg.vaultPath.trim()) {
            vaultPath = cfg.vaultPath.trim();
        }
    } catch (e) {
        console.error(`  WARN: Could not parse vault.config.json — ${e.message}`);
    }
}

// ── Validate vault exists ──────────────────────────────────────────────────
if (!existsSync(vaultPath)) {
    console.error(`
  ERROR: Vault path not found: ${vaultPath}

  Fix: create vault.config.json in the repo root:
    { "vaultPath": "C:/path/to/your/obsidian/vault" }

  (See vault.config.json.example for a template.)
`);
    process.exit(1);
}

// ── Copy artifacts ─────────────────────────────────────────────────────────
const dest = join(vaultPath, '.obsidian', 'plugins', 'folio');
mkdirSync(dest, { recursive: true });

const artifacts = ['main.js', 'manifest.json', 'styles.css'];
for (const file of artifacts) {
    const src = join(root, file);
    if (existsSync(src)) {
        copyFileSync(src, join(dest, file));
        console.log(`  ✓ ${file}`);
    } else {
        console.warn(`  – ${file} (not found, skipped)`);
    }
}

console.log(`\n  Deployed to: ${dest}`);
console.log('  Reload the plugin in Obsidian: Settings → Community plugins → disable → enable\n');
