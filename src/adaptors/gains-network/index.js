const sdk = require('@defillama/sdk3');

const utils = require('../utils');

const chains = {
  polygon: {
    gns: '0xE5417Af564e4bFDA1c483642db72007871397896',
    staking: '0xFb06a737f549Eb2512Eb6082A808fc7F16C0819D',
    gDAI: '0x91993f2101cc758D0dEB7279d41e880F7dEFe827',
    dai: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
    tradingStorage: '0xaee4d11a16B2bc65EDD6416Fb626EB404a6D65BD',
  },
  arbitrum: {
    gns: '0x18c11FD286C5EC11c3b683Caa813B77f5163A122',
    staking: '0x6B8D3C08072a020aC065c467ce922e3A36D3F9d6',
    gDAI: '0xd85E038593d7A098614721EaE955EC2022B9B91B',
    dai: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
    tradingStorage: '0xcFa6ebD475d89dB04cAd5A756fff1cb2BC5bE33c',
  },
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const y = chains[chain];

      const apr = await utils.getData(
        `https://backend-${chain}.gains.trade/apr`
      );

      const gnsPrice = (await utils.getPrices([y.gns], chain)).pricesByAddress[
        y.gns.toLowerCase()
      ];

      const [balance, traderDeposits] = (
        await Promise.all([
          sdk.api.abi.call({
            target: y.gns,
            abi: 'erc20:balanceOf',
            params: [y.staking],
            chain,
          }),
          sdk.api.abi.call({
            target: y.dai,
            abi: 'erc20:balanceOf',
            params: [y.tradingStorage],
            chain,
          }),
        ])
      ).map((o) => o.output / 1e18);

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
        {
          chain,
          project: 'gains-network',
          pool: y.tradingStorage,
          symbol: 'DAI',
          tvlUsd: traderDeposits,
          apyBase: 0,
          underlyingTokens: [y.dai],
          poolMeta: 'Trader Deposits',
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
