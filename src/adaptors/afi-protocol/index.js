const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const project = 'afi-protocol';
const DAY = 86400;

// afi-rwaUSDi pools are intentionally omitted: they are 1:1 wrappers with no distributed yield.
const POOL = {
  symbol: 'afiUSD',
  chain: 'ethereum',
  address: '0x0B4C655bC989baaFe728f8270ff988A7C2B40Fd1',
  underlying: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
};

const getBlock = async (chain, timestamp) => {
  const res = await axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp}`
  );
  return res.data.height;
};

const getExchangeRate = async (block) => {
  const [assets, supply] = await Promise.all([
    sdk.api.abi.call({
      target: POOL.address,
      chain: POOL.chain,
      abi: 'uint256:totalAssets',
      block,
    }),
    sdk.api.abi.call({
      target: POOL.address,
      chain: POOL.chain,
      abi: 'uint256:totalSupply',
      block,
    }),
  ]);
  if (supply.output === '0') return null;
  return Number(assets.output) / Number(supply.output);
};

const annualizedApy = (rateNow, rateAgo, days) =>
  rateNow && rateAgo ? ((rateNow - rateAgo) / rateAgo) * (365 / days) * 100 : 0;

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const [block1d, block7d] = await Promise.all([
    getBlock(POOL.chain, now - DAY),
    getBlock(POOL.chain, now - 7 * DAY),
  ]);

  const [{ pricesByAddress }, supplyRes, rateNow, rate1d, rate7d] =
    await Promise.all([
      utils.getPrices([`${POOL.chain}:${POOL.address}`]),
      sdk.api.abi.call({
        target: POOL.address,
        chain: POOL.chain,
        abi: 'erc20:totalSupply',
      }),
      getExchangeRate(),
      getExchangeRate(block1d),
      getExchangeRate(block7d),
    ]);

  const price = pricesByAddress[POOL.address.toLowerCase()];
  const supply = Number(supplyRes.output) / 1e18;

  return [
    {
      pool: `${POOL.address.toLowerCase()}-${POOL.chain}`,
      chain: utils.formatChain(POOL.chain),
      project,
      symbol: POOL.symbol,
      tvlUsd: supply * price,
      apyBase: annualizedApy(rateNow, rate1d, 1),
      apyBase7d: annualizedApy(rateNow, rate7d, 7),
      underlyingTokens: [POOL.underlying],
      url: `https://yield.afiprotocol.xyz/invest/${POOL.symbol}`,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://afiprotocol.xyz/',
};
