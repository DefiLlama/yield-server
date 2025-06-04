const adapter = require('./src/adaptors/trenergy');

adapter.apy()
  .then(data => {
    console.log('TR.ENERGY APY output:\n', data);
  })
  .catch(err => {
    console.error('Error running TR.ENERGY adapter:\n', err);
  });
