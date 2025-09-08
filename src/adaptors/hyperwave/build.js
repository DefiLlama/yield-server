#!/usr/bin/env node
/**
 * Simple build script to compile TypeScript to JavaScript
 * Usage: node build.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tsFile = 'index.ts';
const jsFile = 'index.js';

if (!fs.existsSync(tsFile)) {
  console.error(`TypeScript file ${tsFile} not found!`);
  process.exit(1);
}

try {
  console.log('Compiling TypeScript to JavaScript...');
  
  // Compile TypeScript file
  execSync(`npx tsc ${tsFile} --target ES2018 --module commonjs --outDir . --esModuleInterop --allowJs --resolveJsonModule`, {
    stdio: 'inherit'
  });
  
  console.log(`✅ Successfully compiled ${tsFile} to ${jsFile}`);
  
  // Check if the compiled file exists
  if (fs.existsSync(jsFile)) {
    const stats = fs.statSync(jsFile);
    console.log(`📁 Output file size: ${(stats.size / 1024).toFixed(2)} KB`);
  }
  
} catch (error) {
  console.error('❌ Compilation failed:', error.message);
  process.exit(1);
}
