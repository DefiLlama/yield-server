const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const SECONDS_PER_BLOCK = 12;
const LOOKBACK_DAYS = 7;

const VAULTS = [
  {
    address: '0x617A6877f0a55D1eF2B64b5861A2bB5Fe6FEB739',
    collateral: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    decimals: 8,
    symbol: 'WBTC',
  },
  {
    address: '0xbaEc8343B610A5ee7Ca2c5b93507AC7def98E2B1',
    collateral: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    decimals: 18,
    symbol: 'WSTETH',
  },
  {
    address: '0x7d5281D590Fb0647aDc7d8494a2c8Fb8C2B23cBD',
    collateral: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
    decimals: 6,
    symbol: 'XAUT',
  },
];

const TOTAL_ASSETS_ABI = {
  name: 'totalAssets',
  type: 'function',
  inputs: [],
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
};

const CONVERT_TO_ASSETS_ABI = {
  name: 'convertToAssets',
  type: 'function',
  inputs: [{ name: 'shares', type: 'uint256' }],
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
};

const apy = async () => {
  const priceKeys = VAULTS.map((v) => `${CHAIN}:${v.collateral}`).join(',');
  const { data: priceData } = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );
  const prices = priceData.coins;

  const totalAssetsRes = await sdk.api.abi.multiCall({
    calls: VAULTS.map((v) => ({ target: v.address })),
    abi: TOTAL_ASSETS_ABI,
    chain: CHAIN,
  });

  const currentBlock = (await sdk.api.util.getLatestBlock(CHAIN)).number;
  const lookbackBlocks = Math.floor((LOOKBACK_DAYS * 86400) / SECONDS_PER_BLOCK);
  const olderBlock = currentBlock - lookbackBlocks;

  const ppsCalls = VAULTS.map((v) => ({
    target: v.address,
    params: [(BigInt(10) ** BigInt(v.decimals)).toString()],
  }));

  const [ppsNow, ppsThen] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: ppsCalls,
      abi: CONVERT_TO_ASSETS_ABI,
      chain: CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: ppsCalls,
      abi: CONVERT_TO_ASSETS_ABI,
      chain: CHAIN,
      block: olderBlock,
      permitFailure: true,
    }),
  ]);

  return VAULTS.map((vault, i) => {
    const assets = Number(totalAssetsRes.output[i].output);
    const price = prices[`${CHAIN}:${vault.collateral}`]?.price ?? 0;
    const tvlUsd = (assets / 10 ** vault.decimals) * price;

    let apyBase = 0;
    const currRaw = ppsNow.output[i]?.output;
    const oldRaw = ppsThen.output[i]?.output;
    if (currRaw && oldRaw) {
      const curr = BigInt(currRaw);
      const old = BigInt(oldRaw);
      if (old > 0n && curr > old) {
        const SCALE = 10n ** 18n;
        const ratio = ((curr - old) * SCALE) / old;
        apyBase = (Number(ratio) / 1e18) * (365 / LOOKBACK_DAYS) * 100;
      }
    }

    return {
      pool: `${vault.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'zensats',
      symbol: utils.formatSymbol(vault.symbol),
      tvlUsd,
      apyBase,
      underlyingTokens: [vault.collateral],
      token: vault.address,
      url: 'https://zensats.app',
    };
  }).filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://zensats.app',
};
