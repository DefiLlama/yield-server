const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

// HypurrFi EVK (Euler Vault Kit) Vaults on Hyperliquid L1
// ERC-4626 vaults deployed via eVault Factory
const EVAULT_FACTORY = '0xcF5552580fD364cdBBFcB5Ae345f75674c59273A';
const chain = 'hyperliquid';
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

const factoryAbi = {
  getProxyListLength: {
    inputs: [],
    name: 'getProxyListLength',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  proxyList: {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'proxyList',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
};

const vaultAbi = {
  asset: {
    inputs: [],
    name: 'asset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  name: {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  symbol: {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  totalAssets: {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  totalBorrows: {
    inputs: [],
    name: 'totalBorrows',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  interestRate: {
    inputs: [],
    name: 'interestRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  interestFee: {
    inputs: [],
    name: 'interestFee',
    outputs: [{ internalType: 'uint16', name: '', type: 'uint16' }],
    stateMutability: 'view',
    type: 'function',
  },
};

// EVK vault symbol: "e{ASSET}-{N}" → parse out asset symbol
const parseAssetSymbol = (vaultSymbol) =>
  vaultSymbol.replace(/^e/, '').replace(/-\d+$/, '');

const apy = async () => {
  // 1. Get vault count from factory
  const proxyCount = (
    await sdk.api.abi.call({
      target: EVAULT_FACTORY,
      abi: factoryAbi.getProxyListLength,
      chain,
    })
  ).output;

  const count = Number(proxyCount);
  if (count === 0) return [];

  // 2. Get all vault addresses
  const indices = Array.from({ length: count }, (_, i) => i);
  const vaultAddresses = (
    await sdk.api.abi.multiCall({
      calls: indices.map((i) => ({
        target: EVAULT_FACTORY,
        params: [i],
      })),
      abi: factoryAbi.proxyList,
      chain,
    })
  ).output.map((o) => o.output);

  // 3. Batch-read vault data (permitFailure to skip broken vaults)
  const [
    assetsRes,
    namesRes,
    symbolsRes,
    totalAssetsRes,
    totalBorrowsRes,
    interestRateRes,
    interestFeeRes,
  ] = await Promise.all(
    [
      'asset',
      'name',
      'symbol',
      'totalAssets',
      'totalBorrows',
      'interestRate',
      'interestFee',
    ].map((method) =>
      sdk.api.abi.multiCall({
        calls: vaultAddresses.map((v) => ({ target: v })),
        abi: vaultAbi[method],
        chain,
        permitFailure: true,
      })
    )
  );

  // 4. Get asset decimals for all unique underlying tokens
  const assetAddresses = assetsRes.output.map((o) => o.output).filter(Boolean);
  const uniqueAssets = [...new Set(assetAddresses)];
  const decResults = (
    await sdk.api.abi.multiCall({
      calls: uniqueAssets.map((a) => ({ target: a })),
      abi: 'erc20:decimals',
      chain,
    })
  ).output;

  const decMap = {};
  uniqueAssets.forEach((a, i) => {
    decMap[a.toLowerCase()] = Number(decResults[i].output);
  });

  // 5. Prices
  const priceKeys = uniqueAssets.map((t) => `${chain}:${t}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  // 6. Build pool objects
  const pools = vaultAddresses
    .map((vaultAddr, i) => {
      const asset = assetsRes.output[i].output;
      const vaultName = namesRes.output[i].output;
      const vaultSymbol = symbolsRes.output[i].output;
      const totalAssets = totalAssetsRes.output[i].output;
      const totalBorrows = totalBorrowsRes.output[i].output;
      const interestRate = interestRateRes.output[i].output;
      const interestFee = interestFeeRes.output[i].output;

      // Skip vaults with missing data or zero deposits
      if (!asset || !totalAssets || totalAssets === '0') return null;

      const assetKey = asset.toLowerCase();
      const dec = decMap[assetKey];
      if (dec === undefined) return null;

      const price = prices[`${chain}:${asset}`]?.price;
      if (!price) return null;

      const totalAssetsNum = Number(totalAssets) / 10 ** dec;
      const totalBorrowsNum = Number(totalBorrows || '0') / 10 ** dec;
      const totalSupplyUsd = totalAssetsNum * price;
      const totalBorrowUsd = totalBorrowsNum * price;
      const tvlUsd = totalSupplyUsd - totalBorrowUsd;

      // EVK interestRate() returns per-second borrow rate in 1e27 (ray)
      const rate = Number(interestRate || '0');
      let borrowApy = 0;
      let apyBase = 0;

      if (rate > 0) {
        const ratePerSec = rate / 1e27;
        borrowApy = (Math.pow(1 + ratePerSec, SECONDS_PER_YEAR) - 1) * 100;

        // Supply APY = borrow APY * utilization * (1 - interestFee)
        // interestFee is a uint16 fraction of 1e4 (0.01% precision)
        const utilization =
          totalAssetsNum > 0 ? totalBorrowsNum / totalAssetsNum : 0;
        const fee = Number(interestFee || '0') / 1e4;
        apyBase = borrowApy * utilization * (1 - fee);
      }

      const symbol = parseAssetSymbol(vaultSymbol || '');

      return {
        pool: `${vaultAddr}-hypurrfi-evk`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'hypurrfi-evk',
        symbol: utils.formatSymbol(symbol),
        tvlUsd,
        apyBase,
        apyBaseBorrow: borrowApy,
        totalSupplyUsd,
        totalBorrowUsd,
        underlyingTokens: [asset],
        poolMeta: vaultName,
        url: 'https://app.hypurr.fi/lend',
      };
    })
    .filter((p) => p && p.tvlUsd >= 10000)
    .filter((p) => utils.keepFinite(p));

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.hypurr.fi/lend',
};
