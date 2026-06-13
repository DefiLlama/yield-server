const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const CHAIN = 'base';
const PROJECT = 'levva';

// Levva Smart Vault addresses on Base
// Factory: 0x391685807Cf005848A0711Deb9Db74209E59662f (fromBlock: 35095203)
const VAULT_ADDRESSES = [
  '0xCF9bdc835104FFc0ec838b454862aA615BCc31ac', // LWETHcB
  '0xbC246dC3b5E27e9561eBB8179805CA92580B8655', // LUSDCusB
];

const apy = async () => {
  // Fetch vault metadata on-chain
  const [symbols, assets, decimals, totalAssets] = await Promise.all([
    sdk.api.abi.multiCall({ calls: VAULT_ADDRESSES.map((a) => ({ target: a })), chain: CHAIN, abi: 'erc20:symbol', permitFailure: true }),
    sdk.api.abi.multiCall({ calls: VAULT_ADDRESSES.map((a) => ({ target: a })), chain: CHAIN, abi: 'address:asset', permitFailure: true }),
    sdk.api.abi.multiCall({ calls: VAULT_ADDRESSES.map((a) => ({ target: a })), chain: CHAIN, abi: 'erc20:decimals', permitFailure: true }),
    sdk.api.abi.multiCall({ calls: VAULT_ADDRESSES.map((a) => ({ target: a })), chain: CHAIN, abi: 'uint256:totalAssets', permitFailure: true }),
  ]);

  // 7d APY via share price growth
  const ts7dAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const { data: blockData } = await axios.get(
    `https://coins.llama.fi/block/${CHAIN}/${ts7dAgo}`
  );
  const oneShare = (10n ** 18n).toString();

  const [currentRates, pastRates] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: VAULT_ADDRESSES.map((a) => ({ target: a, params: [oneShare] })),
      chain: CHAIN,
      abi: 'function convertToAssets(uint256) view returns (uint256)',
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: VAULT_ADDRESSES.map((a) => ({ target: a, params: [oneShare] })),
      chain: CHAIN,
      abi: 'function convertToAssets(uint256) view returns (uint256)',
      block: blockData.height,
      permitFailure: true,
    }),
  ]);

  // Prices
  const uniqueAssets = [...new Set(
    assets.output.map((a) => a?.output).filter(Boolean)
  )];
  const coins = uniqueAssets.map((a) => `${CHAIN}:${a}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  const pools = [];
  for (let i = 0; i < VAULT_ADDRESSES.length; i++) {
    const asset = assets.output[i]?.output;
    const symbol = symbols.output[i]?.output;
    const dec = Number(decimals.output[i]?.output || 18);
    const total = Number(totalAssets.output[i]?.output || 0);
    if (!asset || !symbol || total === 0) continue;

    const price = prices[asset.toLowerCase()];
    if (!price) continue;

    const tvlUsd = (total / 10 ** dec) * price;
    const currentRate = Number(currentRates.output[i]?.output || 0);
    const pastRate = Number(pastRates.output[i]?.output || 0);
    const apyBase =
      pastRate > 0 ? ((currentRate / pastRate) ** (365 / 7) - 1) * 100 : null;

    pools.push({
      pool: `${VAULT_ADDRESSES[i]}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [asset],
      url: 'https://levva.fi',
    });
  }

  return addMerklRewardApy(
    pools.filter((p) => utils.keepFinite(p)),
    'levva',
    (p) => p.pool.split('-')[0]
  );
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://levva.fi',
};
