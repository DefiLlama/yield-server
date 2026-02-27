const axios = require('axios');
const utils = require('../utils');

const BASE_URL = 'https://api.solana.fluid.io/v1';

const bpsToApr = (bps) => (Number(bps) / 1e4) * 100;

const getEarnPools = (lendingTokens) =>
  lendingTokens.map((token) => {
    const price = Number(token.asset.price);
    const decimals = token.asset.decimals;
    const tvlUsd = (Number(token.totalAssets) / 10 ** decimals) * price;

    // supplyRate = interest earned from borrowers (excludes rewardsRate to avoid double-counting).
    const apyBase = utils.aprToApy(Number(token.supplyRate) / 100);
    const stakingApy = token.asset.stakingApr
      ? utils.aprToApy(bpsToApr(token.asset.stakingApr))
      : 0;
    const apyReward = token.rewardsRate
      ? utils.aprToApy(bpsToApr(token.rewardsRate))
      : 0;

    return {
      pool: `${token.address}-solana`.toLowerCase(),
      chain: utils.formatChain('solana'),
      project: 'jupiter-lend',
      symbol: utils.formatSymbol(token.asset.symbol),
      tvlUsd,
      apyBase: apyBase + stakingApy,
      apyReward: apyReward > 0 ? apyReward : null,
      rewardTokens: token.rewardsRate ? [token.assetAddress] : undefined,
      underlyingTokens: [token.assetAddress],
      poolMeta: 'Earn',
      url: 'https://jup.ag/lend',
    };
  });

const calcVaultSupplyApy = (vault) => {
  const marketApy = utils.aprToApy(
    (Number(vault.supplyRateLiquidity) + Number(vault.supplyRateMagnifier)) /
      100
  );
  const stakingApy = vault.supplyToken.stakingApr
    ? utils.aprToApy(bpsToApr(vault.supplyToken.stakingApr))
    : 0;

  return marketApy + stakingApy;
};

const calcVaultRewardApy = (vault, side) =>
  (vault.rewards || [])
    .filter((r) => r.side === side)
    .reduce((sum, r) => sum + utils.aprToApy(Number(r.apr) / 100), 0);

const getVaultPools = (vaults) =>
  vaults.map((vault) => {
    const supplyToken = vault.supplyToken;
    const borrowToken = vault.borrowToken;

    const totalSupply = Number(vault.totalSupply) / 10 ** supplyToken.decimals;
    const totalBorrow = Number(vault.totalBorrow) / 10 ** borrowToken.decimals;

    const totalSupplyUsd = totalSupply * Number(supplyToken.price);
    const totalBorrowUsd = totalBorrow * Number(borrowToken.price);

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
      symbol: utils.formatSymbol(supplyToken.symbol),
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
      ltv: Number(vault.collateralFactor) / 1e3,
      poolMeta: `${supplyToken.symbol}/${borrowToken.symbol}`,
      url: 'https://jup.ag/lend',
    };
  });

const getApy = async () => {
  const [lendingTokens, vaults] = await Promise.all([
    axios.get(`${BASE_URL}/lending/tokens`).then((r) => r.data),
    axios.get(`${BASE_URL}/borrowing/vaults`).then((r) => r.data),
  ]);

  if (!Array.isArray(lendingTokens) || !Array.isArray(vaults)) {
    throw new Error(
      `Unexpected API response shape: lendingTokens=${typeof lendingTokens}, vaults=${typeof vaults}`
    );
  }

  const earnPools = getEarnPools(lendingTokens);
  const vaultPools = getVaultPools(vaults);

  return [...earnPools, ...vaultPools].filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://jup.ag/lend',
};
