const sdk = require('@defillama/sdk');
const axios = require('axios');

// ========== MULTICALL BATCH SIZE ==========
const MULTICALL_BATCH_SIZE = 100; // Maximum number of calls per multicall batch

// ========== METRICS ==========
// Metrics for tracking multicall usage throughout the script
let metrics = {
  totalMulticallBatches: 0,
  totalMulticallCalls: 0,
  multicallByType: {},
};

// ------------ START SETTINGS PER CHAIN --------------
// Chain configuration with RPC endpoints and contracts
const CHAINS = {
  ethereum: {
    name: 'Ethereum',
    levManager: '0x4e6EF371C9CDDE8C3e6716AffEEBaD14C8c62D0B',
    idxManager: '0x6eFFcF94993d6a6081204fc3C30473468Eb7666E',
    chainId: 1,
    blocksPerDay: 7200,
  },
  arbitrum: {
    name: 'Arbitrum',
    levManager: '0x3f2257B6f1fd055aEe020027740f266127E8E2B0',
    idxManager: '0x64511ccE99ab01A6dD136207450eA81263b14FD8',
    chainId: 42161,
    blocksPerDay: 344000,
  },
  base: {
    name: 'Base',
    levManager: '0x31E35550b15B2DFd267Edfb39Dd9F3CD1c6ab82D',
    idxManager: '0x556059e80CB0073D4A9547081Cf0f80cBB94ec30',
    chainId: 8453,
    blocksPerDay: 43200,
  },
  sonic: {
    name: 'Sonic',
    levManager: '0x0C4B19994F466ac4B6bA8F9B220d83beC6118b61',
    idxManager: '0x9e054F6C328d8E424a2354af726FDc88cB166060',
    chainId: 146,
    blocksPerDay: 21600,
  },
  berachain: {
    name: 'Berachain',
    levManager: '0x0ff519EEEc6f1C362A76F87fef3B4a3997bF5a69',
    idxManager: '0xC9260cE495B5EeC77219Bf4faCCf27EeFD932f01',
    chainId: 80094,
    blocksPerDay: 43200,
  },
};
// ------------ END SETTINGS PER CHAIN --------------
// End chain config

// ========== ABIs ==========
// Contract ABIs for multicall usage
const idxManagerAbi = [
  'function allIndexes() view returns (tuple(address index, address creator, bool verified, bool selfLending, bool makePublic)[])',
];
const levManagerAbi = ['function lendingPairs(address) view returns (address)'];
const lendingPairAbi = [
  'function getPairAccounting() view returns (uint128,uint128,uint128,uint128,uint256)',
  'function asset() view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function currentRateInfo() view returns (tuple(uint32 lastBlock, uint32 feeToProtocolRate, uint64 lastTimestamp, uint64 ratePerSec, uint64 fullUtilizationRate))',
  'function totalAssets() view returns (uint256)',
];
const erc20Abi = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// ========== BATCHED MULTICALL HELPER ==========
// Helper for batching multicall requests and tracking metrics
async function batchedMultiCall({ calls, chain, abi, type = 'unknown' }) {
  const batches = [];
  for (let i = 0; i < calls.length; i += MULTICALL_BATCH_SIZE) {
    batches.push(calls.slice(i, i + MULTICALL_BATCH_SIZE));
  }
  metrics.totalMulticallCalls += calls.length;
  metrics.totalMulticallBatches += batches.length;
  if (!metrics.multicallByType[type])
    metrics.multicallByType[type] = { calls: 0, batches: 0 };
  metrics.multicallByType[type].calls += calls.length;
  metrics.multicallByType[type].batches += batches.length;
  let results = [];
  for (const batch of batches) {
    const res = await sdk.api.abi.multiCall({ calls: batch, chain, abi });
    results = results.concat(res.output);
  }
  return results;
}

// ========== Helper: Pool Discovery Per Chain ==========
// Discover lending pairs using batched multicall
async function discoverLendingPairs(chainConfig) {
  // Use DefiLlama SDK for single call (no ethers needed)
  const pods = (
    await sdk.api.abi.call({
      target: chainConfig.idxManager,
      abi: idxManagerAbi[0],
      chain: chainConfig.name.toLowerCase(),
    })
  ).output;
  // Prepare multicall for all pods to get their lendingPair
  const multicallCalls = pods.map((pod) => ({
    target: chainConfig.levManager,
    params: [pod.index],
    abi: 'function lendingPairs(address) view returns (address)',
  }));
  const multicallResOutput = await batchedMultiCall({
    calls: multicallCalls,
    chain: chainConfig.name.toLowerCase(),
    abi: 'function lendingPairs(address) view returns (address)',
    type: 'lendingPairs',
  });
  let lendingPairs = [];
  for (let i = 0; i < pods.length; i++) {
    const podAddr = pods[i].index;
    const lendingPairAddr = multicallResOutput[i]?.output;
    if (
      lendingPairAddr &&
      lendingPairAddr !== '0x0000000000000000000000000000000000000000'
    ) {
      lendingPairs.push({
        chain: chainConfig.chainId,
        pod: podAddr,
        lendingPair: lendingPairAddr,
        symbol: pods[i].symbol,
      });
    }
  }
  return lendingPairs;
}

// ========== Asset Metadata Helper ==========
// Get asset addresses, decimals, and symbols for each lending pair
async function getAssetMetadata(lendingPairs, chainConfig) {
  const uniqueAssets = {};
  // Multicall: asset addresses
  const calls = lendingPairs.map((lp) => ({
    target: lp.lendingPair,
    abi: 'function asset() view returns (address)',
  }));
  const assetsResOutput = await batchedMultiCall({
    calls,
    chain: chainConfig.name.toLowerCase(),
    abi: 'function asset() view returns (address)',
    type: 'asset',
  });
  const assetAddresses = assetsResOutput.map((r) => r.output);

  // Multicall: decimals
  const decCalls = assetAddresses.map((addr) => ({
    target: addr,
    abi: 'function decimals() view returns (uint8)',
  }));
  const decResOutput = await batchedMultiCall({
    calls: decCalls,
    chain: chainConfig.name.toLowerCase(),
    abi: 'function decimals() view returns (uint8)',
    type: 'decimals',
  });

  // Multicall: symbols
  const symbolCalls = assetAddresses.map((addr) => ({
    target: addr,
    abi: 'function symbol() view returns (string)',
  }));
  const symbolResOutput = await batchedMultiCall({
    calls: symbolCalls,
    chain: chainConfig.name.toLowerCase(),
    abi: 'function symbol() view returns (string)',
    type: 'symbol',
  });

  // Fill uniqueAssets with all data
  for (let i = 0; i < lendingPairs.length; i++) {
    const assetAddr = assetsResOutput[i].output;
    const decimals = decResOutput[i].output;
    const symbol = symbolResOutput[i].output;
    uniqueAssets[assetAddr.toLowerCase()] = { assetAddr, decimals, symbol };
    lendingPairs[i].assetAddr = assetAddr;
    lendingPairs[i].assetDecimals = decimals;
    lendingPairs[i].assetSymbol = symbol; // mocht je het direct op de pairs willen hebben
  }
  return uniqueAssets;
}

// ========== Asset Price Helper ==========
// Fetch prices for all unique assets in one API call
async function getAssetPrices(uniqueAssets, chainConfig) {
  const assetAddrs = Object.values(uniqueAssets).map((obj) => obj.assetAddr);
  if (assetAddrs.length === 0) return {};
  const chainName = chainConfig.name.toLowerCase();
  const pricesArray = assetAddrs.map(
    (addr) => `${chainName}:${addr.toLowerCase()}`
  );
  const url = `https://coins.llama.fi/prices/current/${pricesArray.join(',')}`;
  let prices = {};
  try {
    const { data } = await axios.get(url);
    for (const key of Object.keys(data.coins)) {
      if (!data.coins[key].price) {
        console.log(
          `[WARNING] No price found in API response for asset ${key}, setting price to 0.`
        );
        prices[key.split(':')[1]] = 0;
      } else {
        prices[key.split(':')[1]] = data.coins[key].price;
      }
    }
  } catch (e) {
    for (const addr of assetAddrs) {
      prices[addr.toLowerCase()] = 0;
      console.log(
        `[WARNING] Failed to fetch price for asset ${addr} on ${chainConfig.name}, setting price to 0.`
      );
    }
  }
  return prices;
}

// ========== Pool Data Multicall Helper ==========
// Fetch pool-level data for all lending pairs in batches
async function getPoolsMulticallData(validLendingPairs, prices, chainConfig) {
  const poolAddresses = validLendingPairs.map((lp) => lp.lendingPair);

  async function getAllBatchOutputs(calls, abi, type) {
    return await batchedMultiCall({
      calls,
      chain: chainConfig.name.toLowerCase(),
      abi,
      type,
    });
  }

  const accountingCalls = poolAddresses.map((addr) => ({
    target: addr,
    abi: 'function getPairAccounting() view returns (uint128,uint128,uint128,uint128,uint256)',
  }));
  const nameCalls = poolAddresses.map((addr) => ({
    target: addr,
    abi: 'function name() view returns (string)',
  }));
  const symbolCalls = poolAddresses.map((addr) => ({
    target: addr,
    abi: 'function symbol() view returns (string)',
  }));
  const rateInfoCalls = poolAddresses.map((addr) => ({
    target: addr,
    abi: 'function currentRateInfo() view returns (tuple(uint32 lastBlock, uint32 feeToProtocolRate, uint64 lastTimestamp, uint64 ratePerSec, uint64 fullUtilizationRate))',
  }));

  const [accountingRes, nameRes, symbolRes, rateInfoRes] = await Promise.all([
    getAllBatchOutputs(accountingCalls, accountingCalls[0]?.abi, 'accounting'),
    getAllBatchOutputs(nameCalls, nameCalls[0]?.abi, 'name'),
    getAllBatchOutputs(symbolCalls, symbolCalls[0]?.abi, 'symbol'),
    getAllBatchOutputs(rateInfoCalls, rateInfoCalls[0]?.abi, 'rateInfo'),
  ]);

  return {
    accountingRes: { output: accountingRes },
    nameRes: { output: nameRes },
    symbolRes: { output: symbolRes },
    rateInfoRes: { output: rateInfoRes },
  };
}

// ========== Main Export ==========
// Entrypoint: fetch all pool data across all configured chains
async function main() {
  let allPools = [];

  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    const lendingPairs = await discoverLendingPairs(chainConfig);
    console.log(
      'Discovered lending pairs for chain',
      chainConfig.name,
      ':',
      lendingPairs.map((x) => x.lendingPair)
    );

    const uniqueAssets = await getAssetMetadata(lendingPairs, chainConfig);
    const prices = await getAssetPrices(uniqueAssets, chainConfig);
    console.log('Asset prices used for', chainConfig.name, ':', prices);

    // Multicall for all pool info at once
    const validLendingPairs = lendingPairs.filter(
      (lp) => lp.assetAddr && lp.assetDecimals
    );
    const { accountingRes, nameRes, symbolRes, rateInfoRes } =
      await getPoolsMulticallData(validLendingPairs, prices, chainConfig);

    const poolData = validLendingPairs.map((lp, i) => {
      const accounting = accountingRes.output[i]?.output || [];
      const pairName = nameRes.output[i]?.output || '';
      const pairSymbol = symbolRes.output[i]?.output || '';
      const rateInfo = rateInfoRes.output[i]?.output || {};
      let assetPrice = prices[lp.assetAddr.toLowerCase()];
      if (assetPrice === undefined) {
        console.log(
          `[WARNING] No price found for asset in pool ${lp.lendingPair}. Setting assetPrice = 0.`
        );
        assetPrice = 0;
      }
      const totalAssetAmount = accounting[0]?.toString() || '0';
      const totalBorrowAmount = accounting[2]?.toString() || '0';
      const assetDecimals = lp.assetDecimals;
      const ratePerSec = rateInfo.ratePerSec ?? rateInfo[3] ?? 0;
      const protocolFee =
        Number(rateInfo.feeToProtocolRate ?? rateInfo[1] ?? 0) / 1e5;
      const borrowApr =
        (Number(ratePerSec.toString()) * 60 * 60 * 24 * 365) / 1e18;
      const totalBorrowToken = Number(
        +totalBorrowAmount / Math.pow(10, assetDecimals)
      );
      const totalAssetToken = Number(
        +totalAssetAmount / Math.pow(10, assetDecimals)
      );
      const utilization =
        totalAssetToken > 0 ? totalBorrowToken / totalAssetToken : 0;
      const supplierApr = borrowApr * utilization * (1 - protocolFee);
      const blocksPerDay = chainConfig.blocksPerDay || 7200;
      const secondsPerBlock = 86400 / blocksPerDay;
      const compoundPeriods = Math.floor(31557600 / secondsPerBlock);
      const supplierApy =
        Math.pow(1 + supplierApr / compoundPeriods, compoundPeriods) - 1;
      const tvlToken = totalAssetToken;
      const borrowToken = totalBorrowToken;
      const tvlUsd = tvlToken * assetPrice;
      const totalBorrowUsd = borrowToken * assetPrice;
      return {
        pool: lp.lendingPair,
        chain: chainKey,
        project: 'peapods-finance',
        symbol: lp.assetSymbol,
        tvlUsd,
        apyBase: supplierApy * 100,
        apyBaseBorrow: borrowApr * 100,
        underlyingTokens: [lp.assetAddr],
        rewardTokens: [],
        poolMeta: pairName,
        totalSupplyUsd: tvlUsd,
        totalBorrowUsd: totalBorrowUsd,
        url: `https://beta.peapods.finance/pod/${chainConfig.chainId}/${lp.pod}`,
        borrowable: true,
      };
    });

    allPools = allPools.concat(poolData.filter(Boolean));
  }

  // ==== METRICS LOGGING ====
  // Print multicall usage metrics after completion
  console.log('\n========= Multicall Metrics =========');
  console.log('Total multicall batches:', metrics.totalMulticallBatches);
  console.log('Total multicall calls:', metrics.totalMulticallCalls);
  console.log(
    'Breakdown by type:',
    JSON.stringify(metrics.multicallByType, null, 2)
  );
  console.log('Batch size:', MULTICALL_BATCH_SIZE);
  console.log('====================================\n');

  return allPools;
}

module.exports = {
  timetravel: false,
  apy: main,
};
