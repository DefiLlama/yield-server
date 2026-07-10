const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const BIG_10 = new BigNumber('10');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;
const FEE_PRECISION = new BigNumber('100000');

// Active Fraxlend markets listed on frax.com/lend?view=fraxlend.
// Do not discover from pair deployers which include deprecated/unlisted pairs.
const FRAXLEND_MARKETS = [
  {
    chain: 'ethereum',
    chainId: 1,
    poolSuffix: '',
    pairs: [
      '0xc045a53936d793839bfca146058976ef4285161e',
      '0x470c677af6cce089ac38245332bfa03b22b4caed',
      '0xb5a46f712f03808ae5c4b885c6f598fa06442684',
      '0xeca60a11c49486088ad7c5e4ad7dae2c061dbb1c',
      '0x78bb3aec3d855431bd9289fd98da13f9ebb7ef15',
      '0xee847a804b67f4887c9e8fe559a2da4278defb52',
      '0x1d95c12d7a8d525f8d8cb0c44814b12cd13dfa01',
      '0x54e20b542eed95e6c7d8f29ad46a3cf5661c3048',
      '0x8087346b8865e5b0bf9f8a49742c2d83f6a50a6c',
      '0xab3cb84c310186b2fa4b4503624a5d90b5dcb22d',
      '0x28cdf6ce79702aaefbf217cf98cbd11f5639b9f1',
      '0x8e5f09de0cd7841239410f929a905e214443d9e0',
      '0xc653f61ba422f97beb141b34580906184f3765a2',
    ],
  },
  {
    chain: 'fraxtal',
    chainId: 252,
    poolSuffix: '-fraxtal',
    pairs: [
      '0x032578d99b1070682a5e171012be1756a50a17d4',
      '0x4f968317721b9c300afbff3fd37365637318271d',
      '0x8eda613ec96992d3c42bcd9ac2ae58a92929ceb2',
      '0xb71e4829e81f72f7f36a0d858e58109f5948a713',
      '0x3e92765ee2b009b104a8a7baf3759b159c19aba1',
      '0x1b48c9595385f1780d7be1ab57f8eacfea3a5ce5',
      '0x19031d9104d6242da19cc2ae0d29e60f2e37e426',
      '0x7a26b401475a332f62632453a31519c6838b59cc',
      '0xb2d53df70181fbe783f84b74f58e38cc1ca8528d',
      '0x25cb9bf429d5ea0530c5db6c96c131499dc255b7',
    ],
  },
];
const MKR = '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2'; //Not a standard ERC20. symbol and name are base32 encoded

const VAULTS = {
  abis: {
    asset: {
      inputs: [],
      name: 'asset',
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
  },
};

const getMerklMarketAddress = (pool) =>
  pool.pool.replace(/-borrow$/, '').replace(/-fraxtal$/, '');

const getPools = async ({ chain, chainId, poolSuffix, pairs: vaults }) => {
  const getPoolId = (vaultAddress) => `${vaultAddress}${poolSuffix}`;

  const assetContracts = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.asset,
      chain,
      requery: true,
    })
  ).output.map((x) => x.output);

  const collateralContracts = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.collateralContract,
      chain,
      requery: true,
    })
  ).output.map((x) => x.output);

  const totalCollaterals = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.totalCollateral,
      chain,
      requery: true,
    })
  ).output.map((x) => x.output);

  const totalBorrows = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.totalBorrow,
      chain,
      requery: true,
    })
  ).output.map((x) => x.output);

  const currentRateInfos = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.currentRateInfo,
      chain,
      requery: true,
    })
  ).output.map((x) => x.output);

  const maxLTVs = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.maxLTV,
      chain,
      requery: true,
    })
  ).output.map((x) => x.output);

  const totalAssets = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: VAULTS.abis.totalAsset,
      chain,
      requery: true,
    })
  ).output.map((x) => x.output);

  const underlyingCollaterals = (
    await sdk.api.abi.multiCall({
      calls: collateralContracts.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: 'erc20:symbol',
      chain,
      requery: false,
      permitFailure: true,
    })
  ).output.map((x) =>
    x.input.target.toLowerCase() === MKR.toLowerCase() ? 'MKR' : x.output
  );

  const decimalCollaterals = (
    await sdk.api.abi.multiCall({
      calls: collateralContracts.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: 'erc20:decimals',
      chain,
      requery: true,
    })
  ).output.map((x) => x.output);

  const assetSymbols = (
    await sdk.api.abi.multiCall({
      calls: assetContracts.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: 'erc20:symbol',
      chain,
      requery: false,
      permitFailure: true,
    })
  ).output.map((x) =>
    x.input.target.toLowerCase() === MKR.toLowerCase() ? 'MKR' : x.output
  );

  const assetDecimals = (
    await sdk.api.abi.multiCall({
      calls: assetContracts.map((vaultAddress) => ({
        target: vaultAddress,
      })),
      abi: 'erc20:decimals',
      chain,
      requery: true,
    })
  ).output.map((x) => x.output);

  const coins = [...new Set([...collateralContracts, ...assetContracts])];
  const prices = (await utils.getPrices(coins, chain)).pricesByAddress;

  return vaults
    .map((vaultAddress, index) => {
      const poolId = getPoolId(vaultAddress);
      const pairAddress = vaultAddress.toLowerCase();
      const tvlUsd = new BigNumber(totalCollaterals[index])
        .dividedBy(BIG_10.pow(decimalCollaterals[index]))
        .times(prices[collateralContracts[index].toLowerCase()]);
      const totalSupplyUsd = tvlUsd.isFinite() ? tvlUsd.toNumber() : null;
      const totalBorrowUsd = new BigNumber(totalBorrows[index].amount)
        .dividedBy(BIG_10.pow(assetDecimals[index]))
        .times(prices[assetContracts[index].toLowerCase()]);
      const isDustBorrowMismatch = tvlUsd.lt(10) && totalBorrowUsd.gt(tvlUsd);

      if (isDustBorrowMismatch) return null;

      const totalAssetUsd = new BigNumber(totalAssets[index].amount)
        .dividedBy(BIG_10.pow(assetDecimals[index]))
        .times(prices[assetContracts[index].toLowerCase()]);
      const availableBorrowUsd = BigNumber.maximum(
        new BigNumber(totalAssets[index].amount).minus(
          totalBorrows[index].amount
        ),
        0
      )
        .dividedBy(BIG_10.pow(assetDecimals[index]))
        .times(prices[assetContracts[index].toLowerCase()]);

      const apyBaseBorrow = new BigNumber(currentRateInfos[index].ratePerSec)
        .multipliedBy(SECONDS_PER_YEAR)
        .div(BIG_10.pow(18))
        .multipliedBy(100);

      const totalAssetAmount = new BigNumber(totalAssets[index].amount);
      const lenderShare = FEE_PRECISION.minus(
        currentRateInfos[index].feeToProtocolRate
      ).div(FEE_PRECISION);
      const apyBase = totalAssetAmount.gt(0)
        ? apyBaseBorrow
            .multipliedBy(new BigNumber(totalBorrows[index].amount))
            .div(totalAssetAmount)
            .multipliedBy(lenderShare)
        : new BigNumber(0);
      const assetShares = new BigNumber(totalAssets[index].shares);
      const pricePerShare = assetShares.gt(0)
        ? totalAssetAmount.div(assetShares).toNumber()
        : null;
      const ltv = new BigNumber(maxLTVs[index])
        .dividedBy(new BigNumber(100000))
        .toNumber();

      return [
        {
          pool: poolId,
          project: 'fraxlend',
          symbol: assetSymbols[index],
          chain,
          apyBase: apyBase.toNumber(),
          tvlUsd: totalAssetUsd.toNumber(),
          ...(pricePerShare !== null && { pricePerShare }),
          poolMeta: `${underlyingCollaterals[index]} collateral`,
          underlyingTokens: [assetContracts[index]],
          url: `https://frax.com/lend/fraxlend-lend/add?lendingpair=${pairAddress}&chainId=${chainId}`,
        },
        {
          pool: `${poolId}-borrow`,
          project: 'fraxlend',
          symbol: underlyingCollaterals[index],
          token: null,
          chain,
          apy: 0,
          tvlUsd: availableBorrowUsd.toNumber(),
          poolMeta: `${assetSymbols[index]} borrow`,
          underlyingTokens: [collateralContracts[index]],
          apyBaseBorrow: apyBaseBorrow.toNumber(),
          ...(totalSupplyUsd !== null && { totalSupplyUsd }),
          totalBorrowUsd: totalBorrowUsd.toNumber(),
          availableBorrowUsd: availableBorrowUsd.toNumber(),
          mintedCoin: assetSymbols[index],
          borrowToken: assetContracts[index],
          ltv,
          borrowable: ltv > 0,
          url: `https://frax.com/borrow/fraxlend/${chainId}/${pairAddress}?mode=borrow`,
        },
      ];
    })
    .flat()
    .filter((e) => e && utils.keepFinite(e));
};

const main = async () => {
  const pools = (await Promise.all(FRAXLEND_MARKETS.map(getPools))).flat();

  const poolsWithRewards = await addMerklRewardApy(
    pools,
    'fraxlend',
    getMerklMarketAddress
  );

  return poolsWithRewards.map((pool) => {
    if (pool.pool.endsWith('-borrow')) {
      const { apyReward, ...borrowPool } = pool;
      return borrowPool;
    }

    const { apyRewardBorrow, ...earnPool } = pool;
    return earnPool;
  });
};

module.exports = {
  protocolId: '2076',
  timetravel: false,
  apy: main,
  url: 'https://frax.com/lend?view=fraxlend',
};
