const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const CommonAbi = require('./abis/Common.json');
const reBalanceAbi = require('./abis/reBalance.json');

const ALADDIN_API_BASE_URL = 'https://api.aladdin.club/';

// Fallback underlying tokens for gauge pools where on-chain calls fail
const GAUGE_FALLBACK_UNDERLYINGS = {
  '0xA5250C540914E012E22e623275E290c4dC993D11': [
    '0x0000000000000000000000000000000000000000', // ETH
    '0x365AccFCa291e7D3914637ABf1F7635dB165Bb09', // FXN
  ],
  '0x215D87bd3c7482E2348338815E059DE07Daf798A': [
    '0x085780639CC2cACd35E474e71f4d000e2405d8f6', // fxUSD
  ],
};

const getRebalancePoolData = async () => {
  let RebalancePoolData = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/fx_rebalance_tvl_apy`
  );
  const newObj = Object.keys(RebalancePoolData.data).map((item) => {
    const { name, underlyingTokens, rebalancePoolAddress, apy, tvl } =
      RebalancePoolData.data[item];

    const n = name.split('_');
    const symbol = n[0];
    const poolMeta = n.slice(1).join(' ');
    return {
      pool: `${rebalancePoolAddress}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol,
      poolMeta,
      tvlUsd: parseInt(tvl, 10),
      apy: parseFloat(apy),
      underlyingTokens: underlyingTokens,
    };
  });
  return newObj;
};

// ABI for getting underlying tokens from LP contracts
const lpTokenAbi = [
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'coins',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
];

const getUnderlyingTokens = async (lpAddress) => {
  try {
    // Try Uniswap-style token0/token1 first
    const [token0Result, token1Result] = await Promise.all([
      sdk.api.abi.call({
        target: lpAddress,
        abi: lpTokenAbi.find((m) => m.name === 'token0'),
        chain: 'ethereum',
      }).catch(() => null),
      sdk.api.abi.call({
        target: lpAddress,
        abi: lpTokenAbi.find((m) => m.name === 'token1'),
        chain: 'ethereum',
      }).catch(() => null),
    ]);

    if (token0Result?.output && token1Result?.output) {
      return [token0Result.output, token1Result.output];
    }

    // Try Curve-style coins(0)/coins(1)
    const [coin0Result, coin1Result] = await Promise.all([
      sdk.api.abi.call({
        target: lpAddress,
        abi: lpTokenAbi.find((m) => m.name === 'coins'),
        params: [0],
        chain: 'ethereum',
      }).catch(() => null),
      sdk.api.abi.call({
        target: lpAddress,
        abi: lpTokenAbi.find((m) => m.name === 'coins'),
        params: [1],
        chain: 'ethereum',
      }).catch(() => null),
    ]);

    if (coin0Result?.output && coin1Result?.output) {
      return [coin0Result.output, coin1Result.output];
    }

    // Try stability pool yieldToken (fxUSD base pools)
    const yieldTokenResult = await sdk.api.abi.call({
      target: lpAddress,
      abi: 'address:yieldToken',
      chain: 'ethereum',
    }).catch(() => null);

    if (yieldTokenResult?.output) {
      return [yieldTokenResult.output];
    }

    return null;
  } catch (e) {
    return null;
  }
};

const getGaugePoolData = async () => {
  let RebalancePoolData = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/fx_gauge_tvl_apy`
  );

  const poolsWithTokens = await Promise.all(
    RebalancePoolData.data.map(async (data) => {
      const { gauge, lpAddress, name, tvl, apy } = data;

      // Try to get underlying tokens from LP contract, with fallback
      let underlyingTokens = lpAddress ? await getUnderlyingTokens(lpAddress) : null;
      if (!underlyingTokens && GAUGE_FALLBACK_UNDERLYINGS[gauge]) {
        underlyingTokens = GAUGE_FALLBACK_UNDERLYINGS[gauge];
      }

      return {
        pool: `${gauge}-f(x)`,
        chain: utils.formatChain('ethereum'),
        project: 'fx-protocol',
        symbol: utils.formatSymbol(name),
        tvlUsd: parseInt(tvl, 10),
        apy: parseFloat(apy),
        ...(underlyingTokens && { underlyingTokens }),
      };
    })
  );

  return poolsWithTokens;
};

const main = async () => {
  const rebalancedata = await getRebalancePoolData();
  const gaugeData = await getGaugePoolData();
  const data = [].concat(rebalancedata).concat(gaugeData);
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://fx.aladdin.club/rebalance-pool/',
};
