module.exports = function () {
  console.log(`\nNb of pools: ${global.apy.length}\n `);
  if (process.env.CI !== undefined) {
    console.log('\nSample pools:');
    console.table(global.apy.slice(0, 10));
  } else {
    console.log('\nSample pools:', global.apy.slice(0, 10));
  }
  process.exit(0);
};
