const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const CHAIN = 'base';
const PROJECT = 'levva';

const vaults = [
  {
    address: '0xCF9bdc835104FFc0ec838b454862aA615BCc31ac',
    symbol: 'LWETHcB',
    underlying: '0x4200000000000000000000000000000000000006', // WETH
    decimals: 18,
  },
  {
    address: '0xbC246dC3b5E27e9561eBB8179805CA92580B8655',
    symbol: 'LUSDCusB',
    underlying: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    decimals: 6,
  },
];

const getBlock7dAgo = async () => {
  const ts = Math.floor(Date.now() / 1000) - 7 * 86400;
  const { data } = await axios.get(`https://coins.llama.fi/block/${CHAIN}/${ts}`);
  return data.height;
};

const apy = async () => {
  const block7dAgo = await getBlock7dAgo();

  const oneShare = vaults.map((v) => (10n ** BigInt(v.decimals)).toString());

  const [currentRates, pastRates, totalAssets] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: vaults.map((v, i) => ({ target: v.address, params: [oneShare[i]] })),
      chain: CHAIN,
      abi: 'function convertToAssets(uint256) view returns (uint256)',
    }),
    sdk.api.abi.multiCall({
      calls: vaults.map((v, i) => ({ target: v.address, params: [oneShare[i]] })),
      chain: CHAIN,
      abi: 'function convertToAssets(uint256) view returns (uint256)',
      block: block7dAgo,
    }),
    sdk.api.abi.multiCall({
      calls: vaults.map((v) => ({ target: v.address })),
      chain: CHAIN,
      abi: 'uint256:totalAssets',
    }),
  ]);

  const coins = vaults.map((v) => `${CHAIN}:${v.underlying}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  const pools = [];
  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    const currentRate = Number(currentRates.output[i].output);
    const pastRate = Number(pastRates.output[i].output);
    const total = Number(totalAssets.output[i].output);
    const price = prices[vault.underlying.toLowerCase()];

    if (!price || !pastRate) continue;

    const tvlUsd = (total / 10 ** vault.decimals) * price;
    const apyBase = ((currentRate / pastRate - 1) * (365 / 7)) * 100;

    pools.push({
      pool: `${vault.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: utils.formatSymbol(vault.symbol),
      tvlUsd,
      apyBase,
      underlyingTokens: [vault.underlying],
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
