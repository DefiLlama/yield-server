const axios = require('axios');

const apy = async () => {
  const [apyData, supplyData] = await Promise.all(
    [
      'https://mainnet-explorer.fuel.network/staking/apy',
      'https://rest-fuel-seq.simplystaking.xyz/cosmos/staking/v1beta1/pool',
    ].map((i) => axios.get(i))
  );

  const id = 'fuel-network';
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/coingecko:${id}`)
  ).data.coins[`coingecko:${id}`].price;

  return [
    {
      pool: '0x675b68aa4d9c2d3bb3f0397048e62e6b7192079c',
      project: 'fuel-staking',
      chain: 'fuel-ignition',
      symbol: 'FUEL',
      apyBase: Number(apyData.data.amount),
      tvlUsd: (supplyData.data.pool.bonded_tokens / 1e9) * price,
      url: 'https://app.fuel.network/staking/on-fuel',
    },
  ];
};

module.exports = {
  apy,
};
