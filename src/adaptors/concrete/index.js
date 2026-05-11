const sdk = require('@defillama/sdk');
const axios = require('axios');

const VAULTS_URL = 'https://apy.api.concrete.xyz/v1/vault:tvl/all';

const CHAINS = {
  1: 'Ethereum',
  42161: 'Arbitrum',
  80094: 'Berachain',
  988: 'Stable',
  747474: 'Katana',
};

const SKIP_NAME_PATTERN = /test|pre-deposit/i;
const DAY = 86_400;
const WEEK = 7 * DAY;
const UNIT = '1000000000000000000';
const CONVERT_ABI = 'function convertToAssets(uint256) view returns (uint256)';

const getBlock = (chain, timestamp) =>
  axios
    .get(`https://coins.llama.fi/block/${chain}/${timestamp}`)
    .then((r) => r.data.height);

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

const annualize = (now, past, periods) => {
  if (!now || !past || now <= 0 || past <= 0) return null;
  const ratio = now / past;
  const apy = (ratio ** periods - 1) * 100;
  return Number.isFinite(apy) && apy > -100 && apy < 1e6 ? apy : null;
};

const buildChainPools = async (displayChain, vaultMap, timestamp) => {
  const chain = displayChain.toLowerCase();
  const vaults = Object.values(vaultMap || {}).filter(
    (v) => v?.address && !SKIP_NAME_PATTERN.test(v.name || '')
  );
  if (!vaults.length) return [];

  const [blockNow, block1d, block7d] = await Promise.all([
    getBlock(chain, timestamp),
    getBlock(chain, timestamp - DAY),
    getBlock(chain, timestamp - WEEK),
  ]);

  const calls = vaults.map((v) => ({ target: v.address }));
  const callsConv = vaults.map((v) => ({
    target: v.address,
    params: [UNIT],
  }));

  const opts = (block) => ({ chain, block, permitFailure: true });

  const safeMulti = (args) =>
    sdk.api.abi.multiCall(args).catch(() => ({ output: [] }));

  const [assets, totals, shareDecimals, pNow, p1d, p7d] = await Promise.all([
    safeMulti({ abi: 'address:asset', calls, ...opts(blockNow) }),
    safeMulti({ abi: 'uint256:totalAssets', calls, ...opts(blockNow) }),
    safeMulti({ abi: 'uint8:decimals', calls, ...opts(blockNow) }),
    safeMulti({ abi: CONVERT_ABI, calls: callsConv, ...opts(blockNow) }),
    safeMulti({ abi: CONVERT_ABI, calls: callsConv, ...opts(block1d) }),
    safeMulti({ abi: CONVERT_ABI, calls: callsConv, ...opts(block7d) }),
  ]);

  const underlyings = [
    ...new Set(
      assets.output
        .map((o) => o.output)
        .filter(Boolean)
        .map((a) => a.toLowerCase())
    ),
  ];

  const priceKey = underlyings.map((u) => `${chain}:${u}`).join(',');
  const prices = priceKey
    ? (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`))
        .data.coins
    : {};

  return vaults
    .map((v, i) => {
      const underlying = assets.output[i]?.output?.toLowerCase();
      if (!underlying) return null;

      const priceInfo = prices[`${chain}:${underlying}`];
      if (!priceInfo) return null;

      const total = num(totals.output[i]?.output);
      const tvlUsd = (total / 10 ** priceInfo.decimals) * priceInfo.price;

      const pn = num(pNow.output[i]?.output);
      const p1 = num(p1d.output[i]?.output);
      const p7 = num(p7d.output[i]?.output);
      const apyBase = annualize(pn, p1, 365) ?? 0;
      const apyBase7d = annualize(pn, p7, 365 / 7);
      const shareDec = Number(shareDecimals.output[i]?.output) || 18;
      const pricePerShare = pn / 10 ** (18 + priceInfo.decimals - shareDec);

      return {
        pool: `${v.address.toLowerCase()}-${chain}`,
        chain: displayChain,
        project: 'concrete',
        symbol: v.symbol || 'UNKNOWN',
        tvlUsd,
        apyBase,
        ...(apyBase7d != null && { apyBase7d }),
        ...(pricePerShare > 0 && { pricePerShare }),
        underlyingTokens: [underlying],
        poolMeta: v.name,
        url: 'https://app.concrete.xyz/',
      };
    })
    .filter(Boolean);
};

const apy = async (timestamp = Math.floor(Date.now() / 1e3)) => {
  const { data } = await axios.get(VAULTS_URL);

  const chainPools = await Promise.all(
    Object.entries(CHAINS).map(([chainId, displayChain]) =>
      buildChainPools(displayChain, data[chainId], timestamp)
    )
  );

  return chainPools.flat().sort((a, b) => b.tvlUsd - a.tvlUsd);
};

module.exports = {
  apy,
};
