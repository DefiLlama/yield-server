const sdk = require('@defillama/sdk');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const chain = 'hyperliquid';
const project = 'kinetiq-khype';
const ONE = '1000000000000000000'; // 1e18

// sKNTQ (staked KNTQ governance token)
const skntq = '0x696238e0Ca31c94e24ca4CBe7921754E172E4d0F';
const kntq = '0x000000000000780555bD0BCA3791f89f9542c2d6';

// kHYPE (liquid staked HYPE)
const khype = '0xfD739d4e423301CE9385c1fb8850539D657C296D';
const whype = '0x5555555555555555555555555555555555555555';
const stakingAccountant = '0x9209648Ec9D448EF57116B73A2f081835643dc7A';

const convertToAssetsAbi = {
  inputs: [{ type: 'uint256', name: 'shares' }],
  name: 'convertToAssets',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const kHYPEToHYPEAbi = {
  inputs: [{ type: 'uint256', name: 'amount' }],
  name: 'kHYPEToHYPE',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const getSkntqPool = async (block1dAgo, block7dAgo, kntqPrice) => {
  const [rateNow, rate1d, rate7d, totalAssets] = await Promise.all([
    sdk.api.abi.call({
      target: skntq,
      chain,
      abi: convertToAssetsAbi,
      params: [ONE],
    }),
    sdk.api.abi.call({
      target: skntq,
      chain,
      abi: convertToAssetsAbi,
      params: [ONE],
      block: block1dAgo,
    }),
    sdk.api.abi.call({
      target: skntq,
      chain,
      abi: convertToAssetsAbi,
      params: [ONE],
      block: block7dAgo,
    }),
    sdk.api.abi.call({
      target: skntq,
      chain,
      abi: 'uint256:totalAssets',
    }),
  ]);

  const curr = new BigNumber(rateNow.output);
  const p1d = new BigNumber(rate1d.output);
  const p7d = new BigNumber(rate7d.output);

  const apyBase = p1d.isZero()
    ? 0
    : curr.minus(p1d).div(p1d).times(365).times(100).toNumber();

  const apyBase7d = p7d.isZero()
    ? 0
    : curr.minus(p7d).div(p7d).div(7).times(365).times(100).toNumber();

  const tvlUsd = new BigNumber(totalAssets.output)
    .div(1e18)
    .times(kntqPrice)
    .toNumber();

  return {
    pool: `${skntq}-${chain}`,
    chain,
    project,
    symbol: 'sKNTQ',
    underlyingTokens: [kntq],
    searchTokenOverride: skntq,
    apyBase,
    apyBase7d,
    tvlUsd,
    url: 'https://kinetiq.xyz/kntq',
  };
};

const getKhypePool = async (block1dAgo, block7dAgo, hypePrice) => {
  const [rateNow, rate1d, rate7d, totalSupply] = await Promise.all([
    sdk.api.abi.call({
      target: stakingAccountant,
      chain,
      abi: kHYPEToHYPEAbi,
      params: [ONE],
    }),
    sdk.api.abi.call({
      target: stakingAccountant,
      chain,
      abi: kHYPEToHYPEAbi,
      params: [ONE],
      block: block1dAgo,
    }),
    sdk.api.abi.call({
      target: stakingAccountant,
      chain,
      abi: kHYPEToHYPEAbi,
      params: [ONE],
      block: block7dAgo,
    }),
    sdk.api.abi.call({
      target: khype,
      chain,
      abi: 'erc20:totalSupply',
    }),
  ]);

  const curr = new BigNumber(rateNow.output);
  const p1d = new BigNumber(rate1d.output);
  const p7d = new BigNumber(rate7d.output);

  const apyBase = p1d.isZero()
    ? 0
    : curr.minus(p1d).div(p1d).times(365).times(100).toNumber();

  const apyBase7d = p7d.isZero()
    ? 0
    : curr.minus(p7d).div(p7d).div(7).times(365).times(100).toNumber();

  // TVL = kHYPE supply * exchange rate * HYPE price
  const tvlUsd = new BigNumber(totalSupply.output)
    .div(1e18)
    .times(curr)
    .div(1e18)
    .times(hypePrice)
    .toNumber();

  return {
    pool: `${khype}-${chain}`,
    chain,
    project,
    symbol: 'kHYPE',
    searchTokenOverride: khype,
    underlyingTokens: [whype],
    apyBase,
    apyBase7d,
    tvlUsd,
    url: 'https://kinetiq.xyz/stake-hype',
  };
};

const apy = async () => {
  // Fetch prices and blocks in parallel
  const now = Math.floor(Date.now() / 1000);
  const kntqPriceKey = `${chain}:${kntq}`;
  const hypePriceKey = 'coingecko:hyperliquid';

  const [priceResp, block1dData, block7dData] = await Promise.all([
    axios.get(
      `https://coins.llama.fi/prices/current/${kntqPriceKey},${hypePriceKey}`
    ),
    sdk.api.util.lookupBlock(now - 86400, { chain }),
    sdk.api.util.lookupBlock(now - 86400 * 7, { chain }),
  ]);

  const kntqPrice = priceResp.data?.coins?.[kntqPriceKey]?.price;
  const hypePrice = priceResp.data?.coins?.[hypePriceKey]?.price;

  if (kntqPrice == null || !isFinite(kntqPrice)) {
    throw new Error(`Missing price for ${kntqPriceKey}`);
  }
  if (hypePrice == null || !isFinite(hypePrice)) {
    throw new Error(`Missing price for ${hypePriceKey}`);
  }

  const block1dAgo = block1dData.block;
  const block7dAgo = block7dData.block;

  if (block1dAgo == null || block7dAgo == null) {
    throw new Error(`Missing block height for ${chain}`);
  }

  // Fetch both pools in parallel
  const [skntqPool, khypePool] = await Promise.all([
    getSkntqPool(block1dAgo, block7dAgo, kntqPrice),
    getKhypePool(block1dAgo, block7dAgo, hypePrice),
  ]);

  return [skntqPool, khypePool].filter(
    (p) => p.tvlUsd > 0 && isFinite(p.apyBase) && isFinite(p.tvlUsd)
  );
};

module.exports = { timetravel: false, apy, url: 'https://kinetiq.xyz' };
