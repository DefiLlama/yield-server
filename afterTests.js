module.exports = function () {
  console.log(`\nNb of pools: ${global.apy.length}\n `);
  if (process.env.CI !== undefined) {
    console.log('\nSample pools:');
    console.table(global.apy.slice(0, 10));
  } else {
    console.log('\nSample pools:', global.apy.slice(0, 10));
  }
  if(global.apy.some(p=>p.tvlUsd<10e3)){
    console.log("This adapters contains some pools with <10k TVL, these pools won't be shown in DefiLlama")
  }
  process.exit(0);
};
