const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');

const VAULT_ABI = {
  totalSupply: 'function totalSupply() view returns (uint256)',
  symbol: 'function symbol() view returns (string)',
  name: 'function name() view returns (string)',
  feeCalculator: 'function feeCalculator() view returns (address)',
};

const PRICE_CALC_ABI = {
  convertUnitsToToken:
    'function convertUnitsToToken(address vault, address token, uint256 unitsAmount) view returns (uint256)',
};

const USDC = {
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

// Gauntlet vault addresses by chain (gtUSDa - Gauntlet USD Alpha)
const VAULTS = {
  ethereum: ['0x3bd9248048df95db4fbd748c6cd99c1baa40bad0'],
  optimism: ['0x000000001DC8bd45d7E7829fb1c969cbe4D0D1eC'],
  base: ['0x000000000001CdB57E58Fa75Fe420a0f4D6640D5'],
  arbitrum: ['0x000000001DC8bd45d7E7829fb1c969cbe4D0D1eC'],
};

const ONE_UNIT = '1000000000000000000';

const getBlockByTimestamp = async (timestamp, chain) => {
  try {
    const { body } = await superagent.get(
      `https://coins.llama.fi/block/${chain}/${timestamp}`
    );
    return body.height;
  } catch {
    console.error(`Error getting block for timestamp ${timestamp} on chain ${chain}`);
    return null;
  }
};

const calcApy = (currentPrice, historicalPrice, days) => {
  if (!historicalPrice || historicalPrice <= 0 || !currentPrice) return 0;
  return ((currentPrice - historicalPrice) / historicalPrice / days) * 365 * 100;
};

const getVaultData = async (addresses, chain) => {
  const usdc = USDC[chain];
  const calls = addresses.map((target) => ({ target }));

  const [totalSupply, feeCalc, symbol, name] = await Promise.all([
    sdk.api.abi.multiCall({ abi: VAULT_ABI.totalSupply, calls, chain, permitFailure: true }),
    sdk.api.abi.multiCall({ abi: VAULT_ABI.feeCalculator, calls, chain, permitFailure: true }),
    sdk.api.abi.multiCall({ abi: VAULT_ABI.symbol, calls, chain, permitFailure: true }),
    sdk.api.abi.multiCall({ abi: VAULT_ABI.name, calls, chain, permitFailure: true }),
  ]);

  const tvlCalls = [];
  const tvlMap = [];
  addresses.forEach((addr, i) => {
    const calc = feeCalc.output[i]?.output;
    const supply = totalSupply.output[i]?.output;
    if (calc && supply) {
      tvlCalls.push({ target: calc, params: [addr, usdc, supply] });
      tvlMap.push(i);
    }
  });

  const tvlResults = tvlCalls.length > 0
    ? await sdk.api.abi.multiCall({
        abi: PRICE_CALC_ABI.convertUnitsToToken,
        calls: tvlCalls,
        chain,
        permitFailure: true,
      })
    : { output: [] };

  const tvlByIndex = {};
  tvlMap.forEach((idx, i) => {
    if (tvlResults.output[i]?.output) {
      tvlByIndex[idx] = Number(tvlResults.output[i].output) / 1e6;
    }
  });

  return addresses.reduce((acc, addr, i) => {
    acc[addr.toLowerCase()] = {
      tvlUsd: tvlByIndex[i] || 0,
      symbol: symbol.output[i]?.output,
      name: name.output[i]?.output,
      feeCalculator: feeCalc.output[i]?.output,
    };
    return acc;
  }, {});
};

const getPrices = async (vaultData, chain, block = null) => {
  const usdc = USDC[chain];
  const entries = Object.entries(vaultData).filter(([, d]) => d.feeCalculator);

  if (!entries.length) return {};

  const calls = entries.map(([addr, d]) => ({
    target: d.feeCalculator,
    params: [addr, usdc, ONE_UNIT],
  }));

  try {
    const result = await sdk.api.abi.multiCall({
      abi: PRICE_CALC_ABI.convertUnitsToToken,
      calls,
      chain,
      block,
      permitFailure: true,
    });

    return entries.reduce((acc, [addr], i) => {
      if (result.output[i]?.output) {
        acc[addr] = Number(result.output[i].output);
      }
      return acc;
    }, {});
  } catch {
    console.error(`Error getting prices for chain ${chain}`);
    return {};
  }
};

const main = async () => {
  const pools = [];

  for (const [chain, addresses] of Object.entries(VAULTS)) {
    const vaultData = await getVaultData(addresses.map((a) => a.toLowerCase()), chain);

    const now = Math.floor(Date.now() / 1000);
    const [block7d, block30d] = await Promise.all([
      getBlockByTimestamp(now - 7 * 86400, chain),
      getBlockByTimestamp(now - 30 * 86400, chain),
    ]);

    const [currentPrices, prices7d, prices30d] = await Promise.all([
      getPrices(vaultData, chain),
      getPrices(vaultData, chain, block7d),
      getPrices(vaultData, chain, block30d),
    ]);

    for (const addr of addresses) {
      const key = addr.toLowerCase();
      const data = vaultData[key];
      if (!data?.tvlUsd || data.tvlUsd <= 0) continue;

      const apyBase = calcApy(currentPrices[key], prices30d[key], 30);
      const apyBase7d = calcApy(currentPrices[key], prices7d[key], 7);

      pools.push({
        pool: `${key}-${chain}`,
        chain: utils.formatChain(chain),
        project: 'gauntlet',
        symbol: utils.formatSymbol(data.symbol || 'GAUNTLET'),
        tvlUsd: data.tvlUsd,
        apyBase,
        apyBase7d,
        poolMeta: data.name || undefined,
        url: 'https://app.gauntlet.xyz/vaults/gtusda',
        underlyingTokens: [USDC[chain]],
      });
    }
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.gauntlet.xyz',
};
