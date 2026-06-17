const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiUrl } = require('../utils');

const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;
const SCALE = BigInt(1e18);
const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';

const chains = {
  monad: {
    vault: '0xA3227C5969757783154C60bF0bC1944180ed81B9',
    priceId: 'coingecko:monad',
    inception: { block: 36068335, timestamp: 1763335037 },
  },
};

const call = (chain, target, abi, block) =>
  sdk.api.abi.call({ target, abi, chain, block }).then((r) => r.output);

const getBlock = (chain, timestamp) =>
  axios
    .get(getPriceApiUrl(`/block/${chain}/${timestamp}`))
    .then((r) => r.data.height);

const getUsdPrice = (priceId) =>
  axios
    .get(getPriceApiUrl(`/prices/current/${priceId}`))
    .then((r) => r.data.coins[priceId].price);

const getShareValue = async (chain, vault, block) => {
  const [totalPooled, totalSupply] = await Promise.all([
    call(chain, vault, 'function totalPooled() view returns (uint96)', block),
    call(chain, vault, 'erc20:totalSupply', block),
  ]);
  if (BigInt(totalSupply) === 0n) {
    throw new Error(`RPC issue: zero totalSupply at block ${block}`);
  }
  return (BigInt(totalPooled) * SCALE) / BigInt(totalSupply);
};

const annualize = (svNow, svThen, periodDays) => {
  if (svThen === 0n) throw new Error('RPC issue: previous share value is zero');
  const ratio = Number((svNow * SCALE) / svThen) / 1e18;
  if (ratio <= 0) throw new Error('RPC issue: invalid ratio');
  return (Math.pow(ratio, DAYS_PER_YEAR / periodDays) - 1) * 100;
};

const chainApy = async (chain) => {
  const { vault, priceId, inception } = chains[chain];
  const now = Math.floor(Date.now() / 1000);
  const inceptionDays = (now - inception.timestamp) / SECONDS_PER_DAY;

  const [blockNow, block7dAgo] = await Promise.all([
    getBlock(chain, now),
    getBlock(chain, now - SECONDS_PER_DAY * 7),
  ]);
  if (!blockNow || !block7dAgo) {
    throw new Error('RPC issue: Failed to fetch block numbers');
  }

  const [totalPooledNow, symbol, svNow, sv7d, svInception, underlyingPrice] =
    await Promise.all([
      call(chain, vault, 'function totalPooled() view returns (uint96)', blockNow),
      call(chain, vault, 'erc20:symbol', blockNow),
      getShareValue(chain, vault, blockNow),
      getShareValue(chain, vault, block7dAgo),
      getShareValue(chain, vault, inception.block),
      getUsdPrice(priceId),
    ]);

  const apyBase = annualize(svNow, sv7d, 7);
  const apyBaseInception = annualize(svNow, svInception, inceptionDays);
  const pricePerShare = Number(svNow) / 1e18;
  const tvlUsd = (Number(totalPooledNow) / 1e18) * underlyingPrice;

  return {
    pool: vault.toLowerCase(),
    chain,
    project: 'kintsu',
    symbol,
    tvlUsd,
    apyBase,
    apyBase7d: apyBase,
    apyBaseInception,
    ...(pricePerShare > 0 && { pricePerShare }),
    underlyingTokens: [WMON],
    searchTokenOverride: vault,
    isIntrinsicSource: true,
  };
};

const apy = async () => Promise.all(Object.keys(chains).map(chainApy));

module.exports = {
  protocolId: '7042',
  apy,
  url: 'https://kintsu.xyz/staking',
};
