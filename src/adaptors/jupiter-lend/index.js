const axios = require('axios');
const utils = require('../utils');

const BASE_URL = 'https://api.solana.fluid.io/v1';
const UI_URL = 'https://jup.ag/lend';

const MARKETS = {
  main: { label: null, ui: UI_URL, earnUi: `${UI_URL}/earn` },
  ethena: {
    label: 'Ethena Market',
    ui: `${UI_URL}/ethena`,
    earnUi: `${UI_URL}/ethena/market`,
  },
  sentora: {
    label: 'Sentora Market',
    ui: `${UI_URL}/sentora`,
    earnUi: `${UI_URL}/sentora/market`,
  },
};

// The /ethena program hosts both isolated markets; the UI splits them by lent asset.
const INSTANCES = [
  { path: '/main', marketFor: () => MARKETS.main },
  {
    path: '/ethena',
    marketFor: (asset) =>
      asset === 'PYUSD' ? MARKETS.sentora : MARKETS.ethena,
  },
];

const bpsToApr = (bps) => (Number(bps) / 1e4) * 100;

const getEarnPools = (lendingTokens, { marketFor }) =>
  lendingTokens.map((token) => {
    const { label, earnUi } = marketFor(token.asset.symbol);
    const price = Number(token.asset.price);
    const decimals = token.asset.decimals;
    const tvlUsd = (Number(token.totalAssets) / 10 ** decimals) * price;

    const apyBase = utils.aprToApy(Number(token.supplyRate) / 100);
    const apyReward = token.rewardsRate
      ? utils.aprToApy(bpsToApr(token.rewardsRate))
      : 0;

    return {
      pool: `${token.address}-solana`.toLowerCase(),
      chain: utils.formatChain('solana'),
      project: 'jupiter-lend',
      symbol: token.asset.symbol,
      tvlUsd,
      apyBase,
      apyReward: apyReward > 0 ? apyReward : null,
      rewardTokens: token.rewardsRate ? [token.assetAddress] : undefined,
      underlyingTokens: [token.assetAddress],
      poolMeta: label ? `Earn (${label})` : 'Earn',
      url: `${earnUi}/${token.asset.symbol}/deposit`,
    };
  });

const calcVaultSupplyApy = (vault) =>
  utils.aprToApy(
    (Number(vault.supplyRateLiquidity) + Number(vault.supplyRateMagnifier)) /
      100
  );

const calcVaultRewardApy = (vault, side) =>
  (vault.rewards || [])
    .filter((r) => r.side === side)
    .reduce((sum, r) => sum + utils.aprToApy(Number(r.apr) / 100), 0);

const getVaultPools = (vaults, { marketFor }) =>
  vaults.map((vault) => {
    const supplyToken = vault.supplyToken;
    const borrowToken = vault.borrowToken;
    const { label, ui } = marketFor(borrowToken.symbol);

    const totalSupply = Number(vault.totalSupply) / 10 ** supplyToken.decimals;
    const totalBorrow = Number(vault.totalBorrow) / 10 ** borrowToken.decimals;

    const totalSupplyUsd = totalSupply * Number(supplyToken.price);
    const totalBorrowUsd = totalBorrow * Number(borrowToken.price);
    const availableBorrowUsd =
      (Number(vault.borrowable) / 10 ** borrowToken.decimals) *
      Number(borrowToken.price);

    const apyBase = calcVaultSupplyApy(vault);
    const apyReward = calcVaultRewardApy(vault, 'supply');
    const apyBaseBorrow = utils.aprToApy(Number(vault.borrowRate) / 100);
    const apyRewardBorrow = calcVaultRewardApy(vault, 'borrow');

    const supplyRewardTokens = (vault.rewards || [])
      .filter((r) => r.side === 'supply')
      .map((r) => r.rewardToken.address);
    const borrowRewardTokens = (vault.rewards || [])
      .filter((r) => r.side === 'borrow')
      .map((r) => r.rewardToken.address);

    return {
      pool: `${vault.address}-solana`.toLowerCase(),
      chain: utils.formatChain('solana'),
      project: 'jupiter-lend',
      symbol: supplyToken.symbol,
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase,
      apyReward: apyReward > 0 ? apyReward : null,
      rewardTokens:
        supplyRewardTokens.length > 0 ? supplyRewardTokens : undefined,
      apyBaseBorrow,
      apyRewardBorrow: apyRewardBorrow > 0 ? apyRewardBorrow : null,
      ...(borrowRewardTokens.length > 0 && {
        rewardTokensBorrow: borrowRewardTokens,
      }),
      underlyingTokens: [supplyToken.address],
      totalSupplyUsd,
      totalBorrowUsd,
      availableBorrowUsd,
      ltv: Number(vault.collateralFactor) / 1e3,
      borrowable: Number(vault.borrowable) > 0,
      borrowToken: borrowToken.address,
      borrowMarketOnly: true,
      poolMeta: label
        ? `${supplyToken.symbol}/${borrowToken.symbol} (${label})`
        : `${supplyToken.symbol}/${borrowToken.symbol}`,
      url: `${ui}/borrow/${vault.id}`,
    };
  });

const getInstancePools = async (instance) => {
  const { path } = instance;
  const [lendingTokens, vaults] = await Promise.all([
    axios.get(`${BASE_URL}${path}/lending/tokens`).then((r) => r.data),
    axios.get(`${BASE_URL}${path}/borrowing/vaults`).then((r) => r.data),
  ]);

  if (!Array.isArray(lendingTokens) || !Array.isArray(vaults)) {
    throw new Error(
      `Unexpected API response shape for ${path}: lendingTokens=${typeof lendingTokens}, vaults=${typeof vaults}`
    );
  }

  return [
    ...getEarnPools(lendingTokens, instance),
    ...getVaultPools(vaults, instance),
  ];
};

const getApy = async () => {
  const pools = await Promise.allSettled(INSTANCES.map(getInstancePools));

  pools.forEach((r, i) => {
    if (r.status === 'rejected')
      console.error(
        `jupiter-lend ${INSTANCES[i].path} failed: ${r.reason?.message}`
      );
  });

  return pools
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '6600',
  timetravel: false,
  apy: getApy,
  url: UI_URL,
};
