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
        underlying: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
      },
      {
        symbol: 'WETH',
        pool: '0x1544E1fF1a6f6Bdbfb901622C12bb352a43464Fb',
        underlying: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      },
      {
        symbol: 'USDC',
        pool: '0x29019Fe2e72E8d4D2118E8D0318BeF389ffe2C81',
        underlying: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
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
        underlying: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
      },
      {
        symbol: 'WETH',
        pool: '0x5977A9682D7AF81D347CFc338c61692163a2784C',
        underlying: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      },
      {
        symbol: 'USDC',
        pool: '0xd3443ee1e91aF28e5FB858Fbd0D72A63bA8046E0',
        underlying: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
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
