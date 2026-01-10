// Simple script to run the HarborFi adapter
const adapter = require('./harborfi/index.js');

async function run() {
  try {
    console.log('Running HarborFi adapter...\n');
    const data = await adapter.apy();
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ Pools returned: ${data.length}\n`);
    
    if (data.length > 0) {
      console.log('📊 Pool Data:\n');
      data.forEach((p, i) => {
        console.log(`Pool ${i + 1}:`);
        console.log(`  Symbol: ${p.symbol}`);
        console.log(`  APY Base: ${p.apyBase !== undefined ? p.apyBase.toFixed(2) + '%' : 'N/A'}`);
        console.log(`  TVL: $${p.tvlUsd?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}`);
        console.log(`  Chain: ${p.chain}`);
        console.log(`  Pool ID: ${p.pool}`);
        if (p.poolMeta) console.log(`  Meta: ${p.poolMeta}`);
        console.log('');
      });
    } else {
      console.log('No pools returned');
    }
    
    // Also save to JSON file
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(__dirname, 'harborfi-output.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`\n✅ Output saved to: ${outputPath}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

run();
