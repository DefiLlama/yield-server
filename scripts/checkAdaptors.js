const fs = require('fs');
const path = require('path');

const ADAPTORS_DIR = path.join(__dirname, '../src/adaptors');

const forbidden = [
  { pattern: /require\s*\(\s*['"]pg['"]\)/g, reason: 'direct pg import' },
  {
    pattern: /require\s*\(\s*['"]pg-promise['"]\)/g,
    reason: 'pg-promise import',
  },
  {
    pattern: /require\s*\(\s*['"]child_process['"]\)/g,
    reason: 'child_process import',
  },
  { pattern: /process\.env\.DATABASE_URL/g, reason: 'DATABASE_URL access' },
  {
    pattern: /require\s*\(\s*['"]\.\.\/utils\/dbConnection['"]\)/g,
    reason: 'dbConnection import',
  },
  {
    pattern: /require\s*\(\s*['"]\.\.\/queries\//g,
    reason: 'direct query import',
  },
  { pattern: /\beval\s*\(/g, reason: 'eval usage' },
  { pattern: /\bFunction\s*\(/g, reason: 'Function constructor' },
];

const skip = new Set([
  'test.js',
  'beforeTests.js',
  'afterTests.js',
  'utils.js',
]);

let violations = 0;

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      scan(full);
    } else if (/\.(js|ts)$/.test(entry.name) && !skip.has(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      for (const { pattern, reason } of forbidden) {
        pattern.lastIndex = 0;
        if (pattern.test(content)) {
          const rel = path.relative(ADAPTORS_DIR, full);
          console.error(`BLOCKED: ${rel} — ${reason}`);
          violations++;
        }
      }
    }
  }
}

scan(ADAPTORS_DIR);

if (violations) {
  console.error(
    `\n${violations} violation(s) found. Adaptor files must not access the database or shell directly.`
  );
  process.exit(1);
}

console.log('Adaptor check passed.');
