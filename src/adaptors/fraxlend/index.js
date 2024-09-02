const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const BIG_10 = new BigNumber('10');
const utils = require('../utils');

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;

const FRAX = '0x853d955aCEf822Db058eb8505911ED77F175b99e';
const PAIR_DEPLOYERS = [
  '0x5d6e79bcf90140585ce88c7119b7e43caaa67044',
  '0x38488dE975B77dc1b0D4B8569f596f6FD6ca0B92',
  '0x7AB788d0483551428f2291232477F1818952998C',
  '0xaa913C26dD7723Fcae9dBD2036d28171a56C6251',
];
const MKR = '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2'; //Not a standard ERC20. symbol and name are base32 encoded
const HELPER = {
  abis: {
    getAllPairAddresses: {
      inputs: [],
      name: 'getAllPairAddresses',
      outputs: [
        {
          internalType: 'address[]',
          name: '',
          type: 'address[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const VAULTS = {
  abis: {
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
  const vaults = (
    await Promise.all(
      PAIR_DEPLOYERS.map(
        async (deployerAddress) =>
          (
            await sdk.api.abi.call({
              target: deployerAddress,
              abi: HELPER.abis.getAllPairAddresses,
              chain: 'ethereum',
            })
          ).output
      )
    )
  ).flat();

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

  const underlyingCollaterals = (
    await sdk.api.abi.multiCall({
      calls: collateralContracts.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: 'erc20:symbol',
      chain: 'ethereum',
      requery: false,
      permitFailure: true,
    })
  ).output.map((x) => (x.input.target === MKR ? 'MKR' : x.output));

  const decimalCollaterals = (
    await sdk.api.abi.multiCall({
      calls: collateralContracts.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: 'erc20:decimals',
      requery: true,
    })
  ).output.map((x) => x.output);

  const coins = [...collateralContracts, FRAX].map(
    (addr) => `ethereum:${addr}`
  );
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  return vaults
    .map((vaultAddress, index) => {
      const tvlUsd = new BigNumber(totalCollaterals[index])
        .dividedBy(BIG_10.pow(decimalCollaterals[index]))
        .times(prices[collateralContracts[index].toLowerCase()]);
      const totalBorrowUsd = new BigNumber(totalBorrows[index].amount)
        .dividedBy(BIG_10.pow(18))
        .times(prices[FRAX.toLowerCase()]);

      const debtCeilingUsd = new BigNumber(totalSupplys[index])
        .dividedBy(BIG_10.pow(18))
        .times(prices[FRAX.toLowerCase()]);

      const apyBaseBorrow = new BigNumber(currentRateInfos[index].ratePerSec)
        .multipliedBy(SECONDS_PER_YEAR)
        .div(BIG_10.pow(18))
        .multipliedBy(100);

      const apyBase = apyBaseBorrow
        .multipliedBy(new BigNumber(totalBorrows[index].amount))
        .div(new BigNumber(totalAssets[index].amount));
      return {
        pool: vaultAddress,
        project: 'fraxlend',
        symbol: underlyingCollaterals[index],
        chain: 'ethereum',
        apyBase: apyBase.toNumber(),
        tvlUsd: tvlUsd.toNumber(),
        // borrow fields
        apyBaseBorrow: apyBaseBorrow.toNumber(),
        totalSupplyUsd: tvlUsd.toNumber(),
        totalBorrowUsd: totalBorrowUsd.toNumber(),
        debtCeilingUsd: debtCeilingUsd.toNumber(),
        mintedCoin: 'FRAX',
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
  url: 'https://app.frax.finance/fraxlend/available-pairs',
};
