const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const BIG_10 = new BigNumber('10');
const utils = require('../utils');

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;

const DATA_PROVIDER = "0x69764E3e0671747A7768A1C1AfB7C0C39868CC9e";
const HELPER = {
  abis: {
    getStrategies: {
      "inputs": [],
      "name": "getStrategies",
      "outputs": [
        {
          "components": [
            {
              "internalType": "address",
              "name": "deployedAt",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "pair",
              "type": "address"
            },
            {
              "components": [
                {
                  "internalType": "address",
                  "name": "asset",
                  "type": "address"
                },
                {
                  "internalType": "string",
                  "name": "assetSymbol",
                  "type": "string"
                },
                {
                  "internalType": "uint256",
                  "name": "assetDecimals",
                  "type": "uint256"
                },
                {
                  "internalType": "address",
                  "name": "collateral",
                  "type": "address"
                },
                {
                  "internalType": "string",
                  "name": "collateralSymbol",
                  "type": "string"
                },
                {
                  "internalType": "uint256",
                  "name": "collateralDecimals",
                  "type": "uint256"
                },
                {
                  "internalType": "address",
                  "name": "rateContract",
                  "type": "address"
                },
                {
                  "internalType": "address",
                  "name": "oracle",
                  "type": "address"
                },
                {
                  "internalType": "uint256",
                  "name": "depositLimit",
                  "type": "uint256"
                },
                {
                  "internalType": "uint64",
                  "name": "ratePerSec",
                  "type": "uint64"
                },
                {
                  "internalType": "uint64",
                  "name": "fullUtilizationRate",
                  "type": "uint64"
                },
                {
                  "internalType": "uint32",
                  "name": "feeToProtocolRate",
                  "type": "uint32"
                },
                {
                  "internalType": "uint32",
                  "name": "maxOacleDeviation",
                  "type": "uint32"
                },
                {
                  "internalType": "uint256",
                  "name": "lowExchangeRate",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "highExchangeRate",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "maxLTV",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "protocolLiquidationFee",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "totalAsset",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "totalCollateral",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "totalBorrow",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "version",
                  "type": "uint256"
                }
              ],
              "internalType": "struct IAggregatorDataProvider.StrategyPairData",
              "name": "pairData",
              "type": "tuple"
            }
          ],
          "internalType": "struct IAggregatorDataProvider.StrategyData[]",
          "name": "",
          "type": "tuple[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
  },
};

const VAULTS = {
  abis: {
    asset: {
      inputs:[],
      name: 'asset',
      outputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address'
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    collateralContract: {
      inputs: [],
      name: 'collateralContract',
      outputs: [
        {
          internalType: 'contract IERC20',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    totalCollateral: {
      inputs: [],
      name: 'totalCollateral',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    totalBorrow: {
      inputs: [],
      name: 'totalBorrow',
      outputs: [
        {
          internalType: 'uint128',
          name: 'amount',
          type: 'uint128',
        },
        {
          internalType: 'uint128',
          name: 'shares',
          type: 'uint128',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    currentRateInfo: {
      inputs: [],
      name: 'currentRateInfo',
      outputs: [
        {
          internalType: 'uint64',
          name: 'lastBlock',
          type: 'uint64',
        },
        {
          internalType: 'uint64',
          name: 'feeToProtocolRate',
          type: 'uint64',
        },
        {
          internalType: 'uint64',
          name: 'lastTimestamp',
          type: 'uint64',
        },
        {
          internalType: 'uint64',
          name: 'ratePerSec',
          type: 'uint64',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    maxLTV: {
      inputs: [],
      name: 'maxLTV',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    totalAsset: {
      inputs: [],
      name: 'totalAsset',
      outputs: [
        {
          internalType: 'uint128',
          name: 'amount',
          type: 'uint128',
        },
        {
          internalType: 'uint128',
          name: 'shares',
          type: 'uint128',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    totalSupply: {
      inputs: [],
      name: 'totalSupply',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const main = async () => {
  const addressPairs = (await sdk.api.abi.call({
    target: DATA_PROVIDER,
    abi: HELPER.abis.getStrategies,
    chain: 'ethereum',
    requery: true,
  })).output.map((v) => [v[0], v[1]]);

  const strategies = addressPairs.map((a) => a[0]);
  const vaults = addressPairs.map((a) => a[1]);

  const assets = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.asset,
      requery: true,
    })
  ).output.map((x) => x.output);

  const collateralContracts = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.collateralContract,
      requery: true,
    })
  ).output.map((x) => x.output);

  const totalCollaterals = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.totalCollateral,
      requery: true,
    })
  ).output.map((x) => x.output);

  const totalBorrows = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.totalBorrow,
      requery: true,
    })
  ).output.map((x) => x.output);

  const currentRateInfos = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.currentRateInfo,
      requery: true,
    })
  ).output.map((x) => x.output);

  const maxLTVs = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.maxLTV,
      requery: true,
    })
  ).output.map((x) => x.output);

  const totalAssets = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.totalAsset,
      requery: true,
    })
  ).output.map((x) => x.output);

  const totalSupplys = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.totalSupply,
      requery: true,
    })
  ).output.map((x) => x.output);

  const underlyingAssets = (
    await sdk.api.abi.multiCall({
      calls: assets.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: 'erc20:symbol',
      chain: 'ethereum',
      requery: false,
    })
  ).output.map((x) => (x.output));

  const underlyingCollaterals = (
    await sdk.api.abi.multiCall({
      calls: collateralContracts.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: 'erc20:symbol',
      chain: 'ethereum',
      requery: false,
    })
  ).output.map((x) => (x.output));

  const decimalCollaterals = (
    await sdk.api.abi.multiCall({
      calls: collateralContracts.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: 'erc20:decimals',
      requery: true,
    })
  ).output.map((x) => x.output);

  const coins = [...assets, ...collateralContracts].map(
    (addr) => `ethereum:${addr}`
  );
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  return strategies
    .map((strategyAddress, index) => {
      const tvlUsd = new BigNumber(totalCollaterals[index])
        .dividedBy(BIG_10.pow(decimalCollaterals[index]))
        .times(prices[collateralContracts[index].toLowerCase()]);
      const totalBorrowUsd = new BigNumber(totalBorrows[index].amount)
        .dividedBy(BIG_10.pow(18))
        .times(prices[assets[index].toLowerCase()]);

      const debtCeilingUsd = new BigNumber(totalSupplys[index])
        .dividedBy(BIG_10.pow(18))
        .times(prices[assets[index].toLowerCase()]);

      const apyBaseBorrow = new BigNumber(currentRateInfos[index].ratePerSec)
        .multipliedBy(SECONDS_PER_YEAR)
        .div(BIG_10.pow(18))
        .multipliedBy(100);

      return {
        pool: strategyAddress,
        project: 'sturdy-v2',
        symbol: underlyingCollaterals[index],
        chain: 'ethereum',
        apyBase: apyBaseBorrow.toNumber(),
        tvlUsd: tvlUsd.toNumber(),
        // borrow fields
        apyBaseBorrow: apyBaseBorrow.toNumber(),
        totalSupplyUsd: tvlUsd.toNumber(),
        totalBorrowUsd: totalBorrowUsd.toNumber(),
        debtCeilingUsd: debtCeilingUsd.toNumber(),
        mintedCoin: underlyingAssets[index],
        ltv: new BigNumber(maxLTVs[index])
          .dividedBy(new BigNumber(100000))
          .toNumber(),
        underlyingTokens: [collateralContracts[index]],
      };
    })
    .filter((e) => e.tvlUsd);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://v2.sturdy.finance/silos/ethereum',
};
