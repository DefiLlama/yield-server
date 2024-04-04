const axios = require('axios');
const sdk = require('@defillama/sdk5');

const utils = require('../utils');

const chains = {
  polygon: {
    gns: '0xE5417Af564e4bFDA1c483642db72007871397896',
    staking: '0xFb06a737f549Eb2512Eb6082A808fc7F16C0819D',
    gDAI: '0x91993f2101cc758D0dEB7279d41e880F7dEFe827',
    dai: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
  },
  arbitrum: {
    gns: '0x18c11FD286C5EC11c3b683Caa813B77f5163A122',
    staking: '0x6B8D3C08072a020aC065c467ce922e3A36D3F9d6',
    gDAI: '0xd85E038593d7A098614721EaE955EC2022B9B91B',
    dai: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
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
        {
          chain,
          project: 'gains-network',
          pool: y.gDAI,
          symbol: 'DAI',
          tvlUsd: Number(apr.vaultTvl) / 1e18,
          apyBase: utils.aprToApy(apr.vaultApr),
          underlyingTokens: [y.dai],
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
