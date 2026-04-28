const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'steakhouse-financial';
const CHAIN = 'ethereum';

// Steakhouse Box protocol vaults — ERC-4626 vaults NOT in the Morpho API.
// MetaMorpho vaults curated by Steakhouse (steakUSDC, bbqUSDC, etc.) are
// handled by the morpho-v1 adapter.
const VAULTS = [
  '0xBEEFF0DeaC1aBa71EF0D88C4291354eb92ef4589', // AUSD High Yield Term
  '0xBEEFFF7e4EedD83A4a4aB53A68D03eC77C9a57a8', // AUSD Turbo
  '0xBEEFFF506B52B3323c48aFE0Cb405A284F0f9cF2', // cbBTC Turbo
];

const apy = async () => {
  const [names, symbols, assets, totalAssets] = await Promise.all([
    sdk.api.abi.multiCall({ calls: VAULTS.map((v) => ({ target: v })), chain: CHAIN, abi: 'string:name', permitFailure: true }),
    sdk.api.abi.multiCall({ calls: VAULTS.map((v) => ({ target: v })), chain: CHAIN, abi: 'string:symbol', permitFailure: true }),
    sdk.api.abi.multiCall({ calls: VAULTS.map((v) => ({ target: v })), chain: CHAIN, abi: 'address:asset', permitFailure: true }),
    sdk.api.abi.multiCall({ calls: VAULTS.map((v) => ({ target: v })), chain: CHAIN, abi: 'uint256:totalAssets', permitFailure: true }),
  ]);

  // Filter to active vaults with valid data
  const active = [];
  for (let i = 0; i < VAULTS.length; i++) {
    const total = Number(totalAssets.output[i]?.output || 0);
    const asset = assets.output[i]?.output;
    const name = names.output[i]?.output;
    if (total > 0 && asset && name) {
      active.push({ address: VAULTS[i], name, asset, totalRaw: total });
    }
  }
  if (!active.length) return [];

  // Asset decimals and prices
  const uniqueAssets = [...new Set(active.map((v) => v.asset))];
  const decResults = await sdk.api.abi.multiCall({
    calls: uniqueAssets.map((a) => ({ target: a })),
    chain: CHAIN,
    abi: 'erc20:decimals',
    permitFailure: true,
  });
  const decMap = {};
  uniqueAssets.forEach((a, i) => {
    decMap[a.toLowerCase()] = Number(decResults.output[i]?.output || 18);
  });

  const coins = uniqueAssets.map((a) => `${CHAIN}:${a}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  // 7d APY via share price growth
  const ts7dAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const { data: blockData } = await axios.get(
    `https://coins.llama.fi/block/${CHAIN}/${ts7dAgo}`
  );
  const oneShare = (10n ** 18n).toString();

  const [currentRates, pastRates] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: active.map((v) => ({ target: v.address, params: [oneShare] })),
      chain: CHAIN,
      abi: 'function convertToAssets(uint256) view returns (uint256)',
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: active.map((v) => ({ target: v.address, params: [oneShare] })),
      chain: CHAIN,
      abi: 'function convertToAssets(uint256) view returns (uint256)',
      block: blockData.height,
      permitFailure: true,
    }),
  ]);

  const pools = [];
  for (let i = 0; i < active.length; i++) {
    const v = active[i];
    const price = prices[v.asset.toLowerCase()];
    if (!price) continue;

    const tvlUsd = (v.totalRaw / 10 ** decMap[v.asset.toLowerCase()]) * price;
    if (tvlUsd < 1000) continue;

    const current = Number(currentRates.output[i]?.output || 0);
    const past = Number(pastRates.output[i]?.output || 0);
    const apyBase =
      past > 0 ? ((current / past) ** (365 / 7) - 1) * 100 : null;

    // Use vault name for display: "Steakhouse High Yield Term AUSD" -> "AUSD High Yield Term"
    const slug = v.name
      .replace(/^Steakhouse\s+/i, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    pools.push({
      pool: `${v.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: v.name.replace(/^Steakhouse\s+/i, ''),
      tvlUsd,
      apyBase,
      underlyingTokens: [v.asset],
      url: `https://app.steakhouse.financial/earn/1/${v.address}/${slug}`,
    });
  }

  return addMerklRewardApy(
    pools.filter((p) => utils.keepFinite(p)),
    'steakhouse',
    (p) => p.pool.split('-')[0]
  );
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.steakhouse.financial/earn',
};
