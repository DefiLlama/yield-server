const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('../aave-v3/poolAbi');

const PROTOCOL_DATA_PROVIDER = '0xfc87bE7f3657AAD69baDb6247A88E924D1F8bc53';
const REWARDS_CONTROLLER = '0xe1d8B642c83587Df813a36F361C682C0475c4ea4';
const XK613 = '0x9064d55A8A8473fA39c41A16492Fa1094Eb4E8b5';
// K613 is not listed on the price API, so its price comes from this on-chain
// oracle: a 30 minute TWAP of the K613/USDC pool, quoted with 8 decimals.
const K613_ORACLE = '0x83002fe57364DEf515B5BBa326484bE2E220255e';
const K613_ORACLE_DECIMALS = 8;
const USDC = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
const CHAIN = 'monad';
const PROJECT = 'k613';
const APP_URL = 'https://k613.net';
const SECONDS_PER_YEAR = 31536000;

// (index, emissionPerSecond, lastUpdateTimestamp, distributionEnd)
const rewardsDataAbi =
  'function getRewardsData(address asset, address reward) view returns (uint256, uint256, uint256, uint256)';

const apy = async () => {
  const reserveTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain: CHAIN,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain: CHAIN,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const poolsReserveCaps = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveCaps'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:balanceOf',
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:decimals',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const reserveTokensAddresses = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveTokensAddresses'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const supplyRewards = (
    await sdk.api.abi.multiCall({
      calls: aTokens.map((t) => ({
        target: REWARDS_CONTROLLER,
        params: [t.tokenAddress, XK613],
      })),
      abi: rewardsDataAbi,
      chain: CHAIN,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const borrowRewards = (
    await sdk.api.abi.multiCall({
      calls: reserveTokensAddresses.map((t) => ({
        target: REWARDS_CONTROLLER,
        params: [t.variableDebtTokenAddress, XK613],
      })),
      abi: rewardsDataAbi,
      chain: CHAIN,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  // The oracle quotes K613 against USDC, so its answer is scaled by the USDC
  // price to end up in USD. A failed call leaves the reward apy unset.
  const k613UsdcPrice = await sdk.api.abi
    .call({
      target: K613_ORACLE,
      abi: 'int256:latestAnswer',
      chain: CHAIN,
    })
    .then((r) => Number(r.output) / 10 ** K613_ORACLE_DECIMALS)
    .catch(() => null);

  const priceKeys = reserveTokens
    .map((t) => `${CHAIN}:${t.tokenAddress}`)
    .join(',');
  const prices = (
    await utils.getPriceApiData(`/prices/current/${priceKeys}`)
  ).coins;

  // xK613 is backed 1:1 by K613, so K613's price is used for reward emissions
  const usdcPrice = prices[`${CHAIN}:${USDC}`]?.price;
  const k613Price =
    k613UsdcPrice > 0 && usdcPrice > 0 ? k613UsdcPrice * usdcPrice : null;

  const now = Math.floor(Date.now() / 1000);
  // getRewardsData -> [index, emissionPerSecond, lastUpdateTimestamp, distributionEnd]
  const rewardApy = (data, denomUsd) => {
    if (!k613Price || !data || !denomUsd) return null;
    const emissionPerSecond = Number(data[1]);
    const distributionEnd = Number(data[3]);
    if (!(emissionPerSecond > 0) || distributionEnd <= now) return null;
    return (
      (((emissionPerSecond / 1e18) * SECONDS_PER_YEAR * k613Price) /
        denomUsd) *
      100
    );
  };

  const pools = reserveTokens
    .map((pool, i) => {
      const cfg = poolsReservesConfigurationData[i];
      if (cfg.isFrozen) return null;

      const price = prices[`${CHAIN}:${pool.tokenAddress}`]?.price;
      if (!price) return null;

      const p = poolsReserveData[i];
      const decimals = Number(underlyingDecimals[i]);
      const toTokenAmount = (amount) => Number(amount) / 10 ** decimals;

      const tvlUsd = toTokenAmount(underlyingBalances[i]) * price;
      const totalBorrow =
        BigInt(p.totalStableDebt) + BigInt(p.totalVariableDebt);
      const totalBorrowUsd = toTokenAmount(totalBorrow) * price;
      const totalSupplyUsd = tvlUsd + totalBorrowUsd;

      const borrowCap = Number(poolsReserveCaps[i].borrowCap);
      const borrowCapUsd = borrowCap * price;
      const supplyCap = Number(poolsReserveCaps[i].supplyCap);
      const availableBorrowUsd = borrowCap
        ? Math.max(Math.min(tvlUsd, borrowCapUsd - totalBorrowUsd), 0)
        : tvlUsd;

      const apyReward = rewardApy(supplyRewards[i], totalSupplyUsd);
      const apyRewardBorrow = rewardApy(borrowRewards[i], totalBorrowUsd);

      return {
        pool: `${aTokens[i].tokenAddress}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (Number(p.liquidityRate) / 10 ** 27) * 100,
        ...(apyReward != null && { apyReward }),
        ...((apyReward != null || apyRewardBorrow != null) && {
          rewardTokens: [XK613],
        }),
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        ...(supplyCap > 0 && { supplyCapUsd: supplyCap * price }),
        totalBorrowUsd,
        availableBorrowUsd,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        ...(apyRewardBorrow != null && { apyRewardBorrow }),
        borrowToken: pool.tokenAddress,
        ltv: Number(cfg.ltv) / 10000,
        borrowable: cfg.borrowingEnabled,
        token: aTokens[i].tokenAddress,
      };
    })
    .filter(Boolean);

  return pools.filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy,
  url: APP_URL,
  protocolId: '7785',
};
