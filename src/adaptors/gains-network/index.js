const axios = require('axios');
const sdk = require('@defillama/sdk3');

const utils = require('../utils');

const chains = {
  polygon: {
    gns: '0xE5417Af564e4bFDA1c483642db72007871397896',
    staking: '0xFb06a737f549Eb2512Eb6082A808fc7F16C0819D',
  },
  arbitrum: {
    gns: '0x18c11FD286C5EC11c3b683Caa813B77f5163A122',
    staking: '0x6B8D3C08072a020aC065c467ce922e3A36D3F9d6',
  },
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const y = chains[chain];

      const apr = (await axios.get(`https://backend-${chain}.gains.trade/apr`))
        .data;

      const priceKey = `${chain}:${y.gns}`;
      const gnsPrice = (
        await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
      ).data.coins[priceKey]?.price;

      const balance =
        (
          await sdk.api.abi.call({
            target: y.gns,
            abi: 'erc20:balanceOf',
            params: [y.staking],
            chain,
          })
        ).output / 1e18;

      return [
        {
          chain,
          project: 'gains-network',
          pool: y.staking,
          symbol: 'GNS',
          tvlUsd: balance * gnsPrice,
          apyBase: utils.aprToApy(apr.sssBaseApr),
          underlyingTokens: [y.gns],
        },
      ];
    })
  );

  return pools.flat();
};

module.exports = {
  apy: getApy,
  url: 'https://gainsnetwork.io/pools/',
};
