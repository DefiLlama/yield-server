# Hyperwave Finance Adapter

This adapter calculates TVL and APR metrics for Hyperwave Finance vaults across Ethereum and Hyperliquid chains.

## Development Workflow

This adapter is written in TypeScript for better development experience but compiles to JavaScript for testing compatibility.

### Files Structure

- `index.ts` - Main TypeScript source file (edit this)
- `index.js` - Compiled JavaScript file (auto-generated, needed for tests)
- `build.js` - Build script to compile TypeScript to JavaScript
- `package.json` - Local package configuration with build scripts

### Development Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Build and run tests
npm run test

# Build and run adapter locally
npm run dev
```

### Manual Commands

```bash
# Compile TypeScript manually
npx tsc index.ts --target ES2018 --module commonjs --outDir . --esModuleInterop --allowJs --resolveJsonModule

# Run tests from parent directory
cd .. && npm run test --adapter=hyperwave
```

### Workflow

1. Edit `index.ts` for your changes
2. Run `npm run build` to compile to `index.js`
3. Run `npm run test` to test the adapter
4. Commit both `index.ts` and `index.js` files

### Notes

- The `index.js` file is required for the test runner and should be committed
- Always run `npm run build` after making changes to `index.ts`
- The build script ensures TypeScript syntax is properly compiled to JavaScript
