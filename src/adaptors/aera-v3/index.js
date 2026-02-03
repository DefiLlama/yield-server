const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');

// ABI for on-chain data
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

// USDC addresses by chain (6 decimals)
const USDC = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
};

// MultiDepositorVaultFactory config by chain
const FACTORY_CONFIG = {
  base: {
    address: '0x29722cc9a1cacff4a15914f9bc274b46f3b90b4f',
    fromBlock: 25000000,
  },
  ethereum: {
    address: '0x29722cc9a1cacff4a15914f9bc274b46f3b90b4f',
    fromBlock: 21000000,
  },
  arbitrum: {
    address: '0xd1883062629157ff6eae51ca355aca4f52d2bd4e',
    fromBlock: 280000000,
  },
  optimism: {
    address: '0xd1883062629157ff6eae51ca355aca4f52d2bd4e',
    fromBlock: 120000000,
  },
};

// VaultCreated event ABI
const VAULT_CREATED_EVENT =
  'event VaultCreated(address indexed vault, address indexed owner, address hooks, (string name, string symbol) erc20Params, (address feeReceiver, address numeraireToken, address feeCalculator) feeVaultParams, address beforeTransferHook, string description)';

const CHAIN_SLUG_MAP = {
  ethereum: 'eth',
  optimism: 'op',
  polygon: 'polygon',
  base: 'base',
  arbitrum: 'arb',
};

const ONE_UNIT = '1000000000000000000'; // 1e18

// Get block number for a timestamp using DefiLlama API
const getBlockByTimestamp = async (timestamp, chain) => {
  try {
    const response = await superagent.get(
      `https://coins.llama.fi/block/${chain}/${timestamp}`
    );
    return response.body.height;
  } catch (e) {
    return null;
  }
};

// Calculate APY from price change over a period
const calcApy = (currentPrice, historicalPrice, days) => {
  if (!historicalPrice || historicalPrice <= 0 || !currentPrice) return 0;
  const priceChange = (currentPrice - historicalPrice) / historicalPrice;
  return (priceChange / days) * 365 * 100;
};

// Fetch v3 multi-depositor vaults from on-chain events
const fetchVaultsFromChain = async (chain) => {
  const config = FACTORY_CONFIG[chain];
  if (!config) return [];

  try {
    const currentBlock = await sdk.api.util.getLatestBlock(chain);
    const toBlock = currentBlock.number;

    const logs = await sdk.getEventLogs({
      target: config.address,
      eventAbi: VAULT_CREATED_EVENT,
      fromBlock: config.fromBlock,
      toBlock,
      chain,
    });

    // Extract vault addresses from event args
    const vaults = logs.map((log) => ({
      vault_address: log.args.vault.toLowerCase(),
      chain,
    }));

    return vaults;
  } catch (e) {
    console.error(`Error fetching vaults from ${chain}:`, e.message);
    return [];
  }
};

// Get on-chain data (TVL, symbol, name) for all vaults on a chain
const getOnChainData = async (vaults, chain) => {
  const usdc = USDC[chain];
  if (!usdc) return {};

  const addresses = vaults.map((v) => v.vault_address);

  // Batch fetch: totalSupply, feeCalculator, symbol, name
  const [totalSupplyResults, feeCalcResults, symbolResults, nameResults] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: VAULT_ABI.totalSupply,
      calls: addresses.map((target) => ({ target })),
      chain,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: VAULT_ABI.feeCalculator,
      calls: addresses.map((target) => ({ target })),
      chain,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: VAULT_ABI.symbol,
      calls: addresses.map((target) => ({ target })),
      chain,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: VAULT_ABI.name,
      calls: addresses.map((target) => ({ target })),
      chain,
      permitFailure: true,
    }),
  ]);

  // Build TVL calls: convertUnitsToToken(vault, USDC, totalSupply)
  const tvlCalls = [];
  const tvlCallMap = [];

  addresses.forEach((vaultAddr, i) => {
    const feeCalc = feeCalcResults.output[i]?.output;
    const totalSupply = totalSupplyResults.output[i]?.output;
    if (feeCalc && totalSupply) {
      tvlCalls.push({ target: feeCalc, params: [vaultAddr, usdc, totalSupply] });
      tvlCallMap.push(i);
    }
  });

  let tvlByIndex = {};
  if (tvlCalls.length > 0) {
    const tvlResults = await sdk.api.abi.multiCall({
      abi: PRICE_CALC_ABI.convertUnitsToToken,
      calls: tvlCalls,
      chain,
      permitFailure: true,
    });

    tvlCallMap.forEach((vaultIndex, callIndex) => {
      const tvlRaw = tvlResults.output[callIndex]?.output;
      if (tvlRaw) {
        tvlByIndex[vaultIndex] = Number(tvlRaw) / 1e6; // USDC decimals
      }
    });
  }

  // Build result map
  const result = {};
  addresses.forEach((addr, i) => {
    const feeCalc = feeCalcResults.output[i]?.output;
    result[addr.toLowerCase()] = {
      tvlUsd: tvlByIndex[i] || 0,
      symbol: symbolResults.output[i]?.output || null,
      name: nameResults.output[i]?.output || null,
      feeCalculator: feeCalc || null,
    };
  });

  return result;
};

// Get historical unit prices for APY calculation
const getHistoricalPrices = async (vaults, chain, daysAgo) => {
  const usdc = USDC[chain];
  if (!usdc) return {};

  const timestamp = Math.floor(Date.now() / 1000) - 24 * 60 * 60 * daysAgo;
  const historicalBlock = await getBlockByTimestamp(timestamp, chain);
  if (!historicalBlock) return {};

  // Build price calls for each vault
  const priceCalls = [];
  const priceCallMap = [];

  for (const vault of vaults) {
    const feeCalc = vault.feeCalculator;
    if (feeCalc) {
      priceCalls.push({
        target: feeCalc,
        params: [vault.address, usdc, ONE_UNIT],
      });
      priceCallMap.push(vault.address.toLowerCase());
    }
  }

  if (priceCalls.length === 0) return {};

  try {
    const priceResults = await sdk.api.abi.multiCall({
      abi: PRICE_CALC_ABI.convertUnitsToToken,
      calls: priceCalls,
      chain,
      block: historicalBlock,
      permitFailure: true,
    });

    const prices = {};
    priceCallMap.forEach((addr, i) => {
      const price = priceResults.output[i]?.output;
      if (price) {
        prices[addr] = Number(price);
      }
    });

    return prices;
  } catch (e) {
    console.error(`Error fetching historical prices for ${chain} at ${daysAgo}d:`, e.message);
    return {};
  }
};

// Get current unit prices
const getCurrentPrices = async (vaults, chain) => {
  const usdc = USDC[chain];
  if (!usdc) return {};

  const priceCalls = [];
  const priceCallMap = [];

  for (const vault of vaults) {
    const feeCalc = vault.feeCalculator;
    if (feeCalc) {
      priceCalls.push({
        target: feeCalc,
        params: [vault.address, usdc, ONE_UNIT],
      });
      priceCallMap.push(vault.address.toLowerCase());
    }
  }

  if (priceCalls.length === 0) return {};

  const priceResults = await sdk.api.abi.multiCall({
    abi: PRICE_CALC_ABI.convertUnitsToToken,
    calls: priceCalls,
    chain,
    permitFailure: true,
  });

  const prices = {};
  priceCallMap.forEach((addr, i) => {
    const price = priceResults.output[i]?.output;
    if (price) {
      prices[addr] = Number(price);
    }
  });

  return prices;
};

const main = async () => {
  const chains = Object.keys(FACTORY_CONFIG);

  // Fetch vaults from all chains in parallel
  const vaultsByChainArrays = await Promise.all(
    chains.map((chain) => fetchVaultsFromChain(chain))
  );

  // Group vaults by chain
  const vaultsByChain = {};
  chains.forEach((chain, i) => {
    if (vaultsByChainArrays[i].length > 0) {
      vaultsByChain[chain] = vaultsByChainArrays[i];
    }
  });

  const totalVaults = Object.values(vaultsByChain).reduce((sum, v) => sum + v.length, 0);
  console.log(`Found ${totalVaults} Aera v3 multi-depositor vaults on-chain`);

  const pools = [];

  for (const [chain, chainVaults] of Object.entries(vaultsByChain)) {
    // Get on-chain data (TVL, symbol, name, feeCalculator)
    const onChainData = await getOnChainData(chainVaults, chain);

    // Build vault objects with feeCalculator for APY queries
    const vaultsWithData = chainVaults.map((v) => ({
      address: v.vault_address,
      feeCalculator: onChainData[v.vault_address.toLowerCase()]?.feeCalculator,
    }));

    // Get current and historical prices for APY calculation
    const [currentPrices, historicalPrices7d, historicalPrices30d] = await Promise.all([
      getCurrentPrices(vaultsWithData, chain),
      getHistoricalPrices(vaultsWithData, chain, 7),
      getHistoricalPrices(vaultsWithData, chain, 30),
    ]);

    for (const vault of chainVaults) {
      const addr = vault.vault_address.toLowerCase();
      const data = onChainData[addr];
      const tvlUsd = data?.tvlUsd || 0;

      if (tvlUsd <= 0) continue;

      // Calculate APY from price changes
      const currentPrice = currentPrices[addr];
      const price7d = historicalPrices7d[addr];
      const price30d = historicalPrices30d[addr];

      const apyBase7d = calcApy(currentPrice, price7d, 7);
      const apyBase = calcApy(currentPrice, price30d, 30);

      const chainSlug = CHAIN_SLUG_MAP[chain] || chain;

      pools.push({
        pool: `${vault.vault_address}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'aera-v3',
        symbol: utils.formatSymbol(data?.symbol || 'AERA'),
        tvlUsd,
        apyBase,
        apyBase7d,
        poolMeta: data?.name || undefined,
        url: `https://app.aera.finance/vaults/${chainSlug}:${vault.vault_address}`,
      });
    }
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.aera.finance',
};
