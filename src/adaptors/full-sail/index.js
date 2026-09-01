const axios = require('axios');

const main = async () => {
  let pools = await axios.get(
    'https://app.fullsail.finance/api/defi_llama/pools'
  );

  return pools.data.map((i) => ({ ...i, project: 'full-sail' }));
};

module.exports = {
  protocolId: '6413',
  apy: main,
};
