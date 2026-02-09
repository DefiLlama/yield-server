const sdk = require('@defillama/sdk');
const axios = require('axios');

const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;

const vaults = {
  monad: '0xA3227C5969757783154C60bF0bC1944180ed81B9',
}
const underlyingTokenPriceId = {
  monad: 'coingecko:monad',
};

const chainApy = async (chain) => {
  // Get current timestamp
  const now = Math.floor(Date.now() / 1000);
  const timestamp1DayAgo = now - SECONDS_PER_DAY;

  // Fetch block numbers for current and 1 day ago
  const [blockNow, block1DayAgo] = await Promise.all([
    axios
      .get(`https://coins.llama.fi/block/${chain}/${now}`)
      .then((r) => r.data.height),
    axios
      .get(`https://coins.llama.fi/block/${chain}/${timestamp1DayAgo}`)
      .then((r) => r.data.height),
  ]);

  if (!blockNow || !block1DayAgo) {
    throw new Error('RPC issue: Failed to fetch block numbers');
  }

  // Fetch current totalPooled, totalSupply, and symbol
  const [totalPooledNow, totalSupplyNow, symbol] = await Promise.all([
    sdk.api.abi.call({
      target: vaults[chain],
      abi: 'function totalPooled() view returns (uint96)',
      chain: chain,
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: vaults[chain],
      abi: 'erc20:totalSupply',
      chain: chain,
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: vaults[chain],
      abi: 'erc20:symbol',
      chain: chain,
      block: blockNow,
    }),
  ]);

  // Fetch totalPooled and totalSupply from 1 day ago
  const [totalPooled1DayAgo, totalSupply1DayAgo] = await Promise.all([
    sdk.api.abi.call({
      target: vaults[chain],
      abi: 'function totalPooled() view returns (uint96)',
      chain: chain,
      block: block1DayAgo,
    }),
    sdk.api.abi.call({
      target: vaults[chain],
      abi: 'erc20:totalSupply',
      chain: chain,
      block: block1DayAgo,
    }),
  ]);

  // Calculate share values (multiply by 1e18 to handle decimals)
  const shareValueNow =
    (BigInt(totalPooledNow.output) * BigInt(1e18)) /
    BigInt(totalSupplyNow.output);
  const shareValue1DayAgo =
    (BigInt(totalPooled1DayAgo.output) * BigInt(1e18)) /
    BigInt(totalSupply1DayAgo.output);

  if (shareValue1DayAgo === 0n) {
    throw new Error('RPC issue: Previous share value is zero');
  }

  // Calculate proportion: shareValueNow / shareValue1DayAgo
  // Multiply by 1e18 to maintain precision
  const proportion =
    Number((shareValueNow * BigInt(1e18)) / shareValue1DayAgo) / 1e18;

  if (proportion <= 0) {
    throw new Error('RPC issue: Invalid proportion calculated');
  }

  // Calculate APY using the formula:
  // APY = ((1 + ((proportion - 1) / 365)) ** 365 - 1) * 100
  // This is equivalent to: APY = (proportion ** 365 - 1) * 100
  const apyBase = (Math.pow(proportion, DAYS_PER_YEAR) - 1) * 100;

  // Convert to number (assuming 18 decimals for underlying token)
  const tvlUnderlyingToken = Number(totalPooledNow.output) / 1e18;

  // Get native token price to convert to USD
  const underlyingTokenPriceResponse = await axios.get(
    `https://coins.llama.fi/prices/current/${underlyingTokenPriceId[chain]}`
  );
  const underlyingTokenPrice =
    underlyingTokenPriceResponse.data.coins[underlyingTokenPriceId[chain]].price;
  const tvlUsd = tvlUnderlyingToken * underlyingTokenPrice;

  return [
    {
      pool: vaults[chain].toLowerCase(),
      chain: chain,
      project: 'kintsu',
      symbol: symbol.output,
      tvlUsd: tvlUsd,
      apyBase: apyBase,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    },
  ];
};

const apy = async () => {
  const chains = Object.keys(vaults);
  const apys = await Promise.all(chains.map(async (chain) => await chainApy(chain)));
  return apys.flat();
};

module.exports = {
  apy,
  url: 'https://kintsu.xyz/staking',
};

