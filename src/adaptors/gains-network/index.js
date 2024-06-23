const ADDRESSES = require('../assets.json')
const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');

const chains = {
  polygon: {
    gns: '0xE5417Af564e4bFDA1c483642db72007871397896',
    staking: '0x8C74B2256fFb6705F14aDA8E86FBd654e0e2BECa',
    vaults: [
      {
        symbol: 'DAI',
        pool: '0x91993f2101cc758D0dEB7279d41e880F7dEFe827',
        underlying: ADDRESSES.polygon.DAI,
      },
      {
        symbol: 'WETH',
        pool: '0x1544E1fF1a6f6Bdbfb901622C12bb352a43464Fb',
        underlying: ADDRESSES.polygon.WETH_1,
      },
      {
        symbol: 'USDC',
        pool: '0x29019Fe2e72E8d4D2118E8D0318BeF389ffe2C81',
        underlying: ADDRESSES.polygon.USDC_CIRCLE,
      },
    ],
  },
  arbitrum: {
    gns: '0x18c11FD286C5EC11c3b683Caa813B77f5163A122',
    staking: '0x7edDE7e5900633F698EaB0Dbc97DE640fC5dC015',
    vaults: [
      {
        symbol: 'DAI',
        pool: '0xd85E038593d7A098614721EaE955EC2022B9B91B',
        underlying: ADDRESSES.optimism.DAI,
      },
      {
        symbol: 'WETH',
        pool: '0x5977A9682D7AF81D347CFc338c61692163a2784C',
        underlying: ADDRESSES.arbitrum.WETH,
      },
      {
        symbol: 'USDC',
        pool: '0xd3443ee1e91aF28e5FB858Fbd0D72A63bA8046E0',
        underlying: ADDRESSES.arbitrum.USDC_CIRCLE,
      },
    ],
  },
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const y = chains[chain];

      const data = (await axios.get(`https://backend-${chain}.gains.trade/apr`))
        .data;

      const priceKeys = [y.gns, ...y.vaults.map((i) => i.underlying)].map(
        (i) => `${chain}:${i}`
      );

      const prices = (
        await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
      ).data.coins;

      // gns staking pool
      const balance =
        (
          await sdk.api.abi.call({
            target: y.gns,
            abi: 'erc20:balanceOf',
            params: [y.staking],
            chain,
          })
        ).output / 1e18;

      const gnsStaking = {
        chain,
        project: 'gains-network',
        pool: y.staking,
        symbol: 'GNS',
        tvlUsd: balance * prices[`${chain}:${y.gns}`].price,
        apyBase: utils.aprToApy(data.sssApr),
        underlyingTokens: [y.gns],
      };

      // vaults
      const vaults = data.collateralRewards.map((i) => {
        const addresses = y.vaults.find((v) => v.symbol === i.symbol);
        const priceData = prices[`${chain}:${addresses.underlying}`];
        const tvlUsd =
          Number(i.vaultTvl / 10 ** priceData.decimals) * priceData.price;

        return {
          chain,
          project: 'gains-network',
          pool: addresses.pool,
          symbol: i.symbol,
          tvlUsd,
          apyBase: utils.aprToApy(i.vaultApr),
          underlyingTokens: [addresses.underlying],
        };
      });

      return [gnsStaking, ...vaults];
    })
  );

  return pools.flat();
};

module.exports = {
  apy: getApy,
  url: 'https://gainsnetwork.io/pools/',
};
