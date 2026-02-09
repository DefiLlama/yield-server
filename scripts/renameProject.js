#!/usr/bin/env node

/**
 * Renames a project/adaptor:
 * 1. Creates database migration file
 * 2. Renames adaptor folder
 * 3. Updates project references in code files
 *
 * Usage: node scripts/renameProject.js <old-slug> <new-slug>
 * Then commit and push - CI runs the migration automatically.
 */

const fs = require('fs');
const path = require('path');

const ADAPTORS_DIR = path.join(__dirname, '../src/adaptors');
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

const [oldSlug, newSlug] = process.argv.slice(2);

if (!oldSlug || !newSlug) {
  console.log('Usage: node scripts/renameProject.js <old-slug> <new-slug>');
  process.exit(1);
}

const oldPath = path.join(ADAPTORS_DIR, oldSlug);
const newPath = path.join(ADAPTORS_DIR, newSlug);

if (!fs.existsSync(oldPath)) {
  console.error(`Adaptor not found: ${oldSlug}`);
  process.exit(1);
}

if (fs.existsSync(newPath)) {
  console.error(`Adaptor already exists: ${newSlug}`);
  process.exit(1);
}

// Create migration
const migrationName = `${Date.now()}_rename-${oldSlug}-to-${newSlug}.js`;
fs.writeFileSync(
  path.join(MIGRATIONS_DIR, migrationName),
  `exports.up = (pgm) => {
  pgm.sql(\`UPDATE config SET project = '${newSlug}' WHERE project = '${oldSlug}'\`);
};

exports.down = (pgm) => {
  pgm.sql(\`UPDATE config SET project = '${oldSlug}' WHERE project = '${newSlug}'\`);
};
`
);
console.log(`Created: migrations/${migrationName}`);

// Rename folder
fs.renameSync(oldPath, newPath);
console.log(`Renamed: src/adaptors/${oldSlug} → src/adaptors/${newSlug}`);

// Update project references in all code files
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(`(project\\s*:\\s*)['"]${escapeRegex(oldSlug)}['"]`, 'g');

function updateFiles(dir) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      updateFiles(fullPath);
    } else if (/\.(js|ts)$/.test(file)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const updated = content.replace(pattern, `$1'${newSlug}'`);
      if (content !== updated) {
        fs.writeFileSync(fullPath, updated);
        console.log(`Updated: ${path.relative(ADAPTORS_DIR, fullPath)}`);
      }
    }
  }
}

updateFiles(newPath);

console.log('\nDone. Now commit and push to master.');
