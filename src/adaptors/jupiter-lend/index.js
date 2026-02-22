const axios = require('axios');
const utils = require('../utils');

const BASE_URL = 'https://api.solana.fluid.io/v1';

const bpsToApy = (bps) => (Number(bps) / 1e4) * 100;

const getEarnPools = (lendingTokens) =>
  lendingTokens.map((token) => {
    const price = Number(token.asset.price);
    const decimals = token.asset.decimals;
    const tvlUsd = (Number(token.totalAssets) / 10 ** decimals) * price;

    // totalRate = supplyRate (interest from borrowers) + rewardsRate (protocol-native yield).
    const apyBase = utils.aprToApy(Number(token.totalRate) / 100);
    const stakingApy = token.asset.stakingApr ? bpsToApy(token.asset.stakingApr) : 0;
    const supplyRewards = (token.rewards || []).filter((r) => r.side === 'supply');
    const apyReward = supplyRewards.reduce(
      (sum, r) => sum + utils.aprToApy(Number(r.apr) / 100),
      0
    );
    const rewardTokens = supplyRewards.map((r) => r.rewardToken.address);

    return {
      pool: `${token.address}-solana`.toLowerCase(),
      chain: utils.formatChain('solana'),
      project: 'jupiter-lend',
      symbol: utils.formatSymbol(token.asset.symbol),
      tvlUsd,
      apyBase: apyBase + stakingApy,
      apyReward: apyReward > 0 ? apyReward : null,
      rewardTokens: rewardTokens.length > 0 ? rewardTokens : undefined,
      underlyingTokens: [token.assetAddress],
      poolMeta: 'Earn',
      url: 'https://jup.ag/lend',
    };
  });

const calcVaultSupplyApy = (vault) => {
  const marketApy = utils.aprToApy(
    (Number(vault.supplyRateLiquidity) + Number(vault.supplyRateMagnifier)) / 100
  );
  const stakingApy = vault.supplyToken.stakingApr ? bpsToApy(vault.supplyToken.stakingApr) : 0;

  return marketApy + stakingApy;
};

const calcVaultBorrowApy = (vault) =>
  utils.aprToApy(
    (Number(vault.borrowRateLiquidity) + Number(vault.borrowRateMagnifier)) / 100
  );

const calcVaultRewardApy = (vault, side) =>
  (vault.rewards || [])
    .filter((r) => r.side === side)
    .reduce((sum, r) => sum + utils.aprToApy(Number(r.apr) / 100), 0);

const getVaultPools = (vaults) => {
  const bestByToken = {};
  for (const vault of vaults) {
    const tokenAddr = vault.supplyToken.address;
    const supplyApy =
      calcVaultSupplyApy(vault) + calcVaultRewardApy(vault, 'supply');

    if (
      !bestByToken[tokenAddr] ||
      supplyApy > bestByToken[tokenAddr].supplyApy
    ) {
      bestByToken[tokenAddr] = { vault, supplyApy };
    }
  }

  return Object.values(bestByToken).map(({ vault }) => {
    const supplyToken = vault.supplyToken;
    const borrowToken = vault.borrowToken;

    const totalSupply = Number(vault.totalSupply) / 10 ** supplyToken.decimals;
    const totalBorrow = Number(vault.totalBorrow) / 10 ** borrowToken.decimals;

    const totalSupplyUsd = totalSupply * Number(supplyToken.price);
    const totalBorrowUsd = totalBorrow * Number(borrowToken.price);

    const apyBase = calcVaultSupplyApy(vault);
    const apyReward = calcVaultRewardApy(vault, 'supply');
    const apyBaseBorrow = calcVaultBorrowApy(vault);
    const apyRewardBorrow = calcVaultRewardApy(vault, 'borrow');

    const supplyRewardTokens = (vault.rewards || [])
      .filter((r) => r.side === 'supply')
      .map((r) => r.rewardToken.address);

    return {
      pool: `${vault.address}-solana`.toLowerCase(),
      chain: utils.formatChain('solana'),
      project: 'jupiter-lend',
      symbol: utils.formatSymbol(supplyToken.symbol),
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase,
      apyReward: apyReward > 0 ? apyReward : null,
      rewardTokens: supplyRewardTokens.length > 0 ? supplyRewardTokens : undefined,
      underlyingTokens: [supplyToken.address],
      apyBaseBorrow,
      apyRewardBorrow: apyRewardBorrow > 0 ? apyRewardBorrow : null,
      totalSupplyUsd,
      totalBorrowUsd,
      ltv: Number(vault.collateralFactor) / 1e3,
      poolMeta: `${supplyToken.symbol}/${borrowToken.symbol}`,
      url: 'https://jup.ag/lend',
    };
  });
};

const getApy = async () => {
  const [lendingTokens, vaults] = await Promise.all([
    axios.get(`${BASE_URL}/lending/tokens`).then((r) => r.data),
    axios.get(`${BASE_URL}/borrowing/vaults`).then((r) => r.data),
  ]);

  const earnPools = getEarnPools(lendingTokens);
  const vaultPools = getVaultPools(vaults);

  return [...earnPools, ...vaultPools].filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://jup.ag/lend',
};
