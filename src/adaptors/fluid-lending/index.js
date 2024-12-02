const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');

const CHAIN_ID_MAPPING = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
};

const abiLendingResolver = require('./abiLendingResolver');
const lendingResolver = {
  ethereum: '0xC215485C572365AE87f908ad35233EC2572A3BEC',
  arbitrum: '0xdF4d3272FfAE8036d9a2E1626Df2Db5863b4b302',
  base: '0x3aF6FBEc4a2FE517F56E402C65e3f4c3e18C1D86',
};

const getApy = async (chain) => {
  const fTokensEntireData = (
    await sdk.api.abi.call({
      target: lendingResolver[chain],
      abi: abiLendingResolver.find((m) => m.name === 'getFTokensEntireData'),
      chain,
    })
  ).output;

  const underlying = fTokensEntireData.map((d) => d.asset);

  const symbol = (
    await sdk.api.abi.multiCall({
      calls: underlying.map((t) => ({ target: t })),
      abi: 'erc20:symbol',
      chain,
    })
  ).output.map((o) => o.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      calls: underlying.map((t) => ({ target: t })),
      abi: 'erc20:decimals',
      chain,
    })
  ).output.map((o) => o.output);

  const priceKeys = underlying.map((i) => `${chain}:${i}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const pools = fTokensEntireData.map((token, i) => {
    const tokenAddress = token.tokenAddress;
    const underlyingToken = token.asset;
    const underlyingSymbol = symbol[i];
    const decimals = token.decimals;
    const tokenPrice = prices[`${chain}:${underlying[i]}`].price;

    const totalSupplyUsd = (token.totalAssets * tokenPrice) / 10 ** decimals;

    const apyBase = Number((token.supplyRate / 1e2).toFixed(2));
    const apyReward = Number((token.rewardsRate / 1e12).toFixed(2));

    return {
      project: 'fluid-lending',
      pool: tokenAddress,
      tvlUsd: totalSupplyUsd,
      symbol: underlyingSymbol,
      underlyingTokens: [underlyingToken],
      rewardTokens: [underlyingToken], // rewards are always in underlying
      chain,
      apyBase,
      apyReward,
    };
  });

  return pools.filter((i) => utils.keepFinite(i));
};

const apy = async () => {
  const chains = Object.keys(CHAIN_ID_MAPPING);
  const apy = await Promise.all(chains.map((chain) => getApy(chain)));
  return apy.flat();
};

module.exports = {
  apy,
  url: `https://fluid.instadapp.io/lending/`,
};
