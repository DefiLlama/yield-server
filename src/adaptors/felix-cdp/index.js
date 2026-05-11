const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'hyperliquid';
const COLLATERAL_REGISTRY = '0x9De1e57049c475736289Cb006212F3E1DCe4711B';
const FE_USD = '0x02c6a2fa58cc01a18b8d9e00ea48d65e4df26c70';
const SP_YIELD_SPLIT = 0.75;

const ABIS = {
  totalCollaterals: 'uint256:totalCollaterals',
  getTroveManager: 'function getTroveManager(uint256) view returns (address)',
  stabilityPool: 'address:stabilityPool',
  activePool: 'address:activePool',
  borrowerOperations: 'address:borrowerOperations',
  collToken: 'address:collToken',
  defaultPoolAddress: 'address:defaultPoolAddress',
  getCollBalance: 'uint256:getCollBalance',
  getfeUSDDebt: 'function getfeUSDDebt() view returns (uint256)',
  getTotalfeUSDDeposits:
    'function getTotalfeUSDDeposits() view returns (uint256)',
  symbol: 'string:symbol',
  decimals: 'uint8:decimals',
  MCR: 'uint256:MCR',
  getNewApproxAvgInterestRateFromTroveChange: {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'appliedRedistBoldDebtGain',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'appliedRedistCollGain',
            type: 'uint256',
          },
          { internalType: 'uint256', name: 'collIncrease', type: 'uint256' },
          { internalType: 'uint256', name: 'collDecrease', type: 'uint256' },
          { internalType: 'uint256', name: 'debtIncrease', type: 'uint256' },
          { internalType: 'uint256', name: 'debtDecrease', type: 'uint256' },
          {
            internalType: 'uint256',
            name: 'newWeightedRecordedDebt',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'oldWeightedRecordedDebt',
            type: 'uint256',
          },
          { internalType: 'uint256', name: 'upfrontFee', type: 'uint256' },
          {
            internalType: 'uint256',
            name: 'batchAccruedManagementFee',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'newWeightedRecordedBatchManagementFee',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'oldWeightedRecordedBatchManagementFee',
            type: 'uint256',
          },
        ],
        internalType: 'struct TroveChange',
        name: '_troveChange',
        type: 'tuple',
      },
    ],
    name: 'getNewApproxAvgInterestRateFromTroveChange',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
};

const ZERO_TROVE_CHANGE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const multiCall = (abi, targets, params) =>
  sdk.api.abi.multiCall({
    abi,
    calls: targets.map((target) => (params ? { target, params } : { target })),
    chain: CHAIN,
  });

const apy = async () => {
  const branchCount = Number(
    (
      await sdk.api.abi.call({
        target: COLLATERAL_REGISTRY,
        abi: ABIS.totalCollaterals,
        chain: CHAIN,
      })
    ).output
  );
  if (!branchCount) return [];

  const indices = Array.from({ length: branchCount }, (_, i) => i);

  const troveManagers = (
    await sdk.api.abi.multiCall({
      abi: ABIS.getTroveManager,
      calls: indices.map((i) => ({ target: COLLATERAL_REGISTRY, params: [i] })),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const [stabilityPools, activePools, borrowerOperations] = (
    await Promise.all([
      multiCall(ABIS.stabilityPool, troveManagers),
      multiCall(ABIS.activePool, troveManagers),
      multiCall(ABIS.borrowerOperations, troveManagers),
    ])
  ).map((r) => r.output.map((o) => o.output));

  const [collTokens, defaultPools, activeColl, activeDebt, avgInterestRates] = (
    await Promise.all([
      multiCall(ABIS.collToken, activePools),
      multiCall(ABIS.defaultPoolAddress, activePools),
      multiCall(ABIS.getCollBalance, activePools),
      multiCall(ABIS.getfeUSDDebt, activePools),
      multiCall(ABIS.getNewApproxAvgInterestRateFromTroveChange, activePools, [
        ZERO_TROVE_CHANGE,
      ]),
    ])
  ).map((r) => r.output.map((o) => o.output));

  const [defaultColl, spDeposits, symbols, decimals, mcrs] = (
    await Promise.all([
      multiCall(ABIS.getCollBalance, defaultPools),
      multiCall(ABIS.getTotalfeUSDDeposits, stabilityPools),
      multiCall(ABIS.symbol, collTokens),
      multiCall(ABIS.decimals, collTokens),
      multiCall(ABIS.MCR, borrowerOperations),
    ])
  ).map((r) => r.output.map((o) => o.output));

  const priceKeys = [
    ...new Set([...collTokens.map((a) => a.toLowerCase()), FE_USD]),
  ];
  const { pricesByAddress } = await utils.getPrices(priceKeys, CHAIN);
  const feUsdPrice = pricesByAddress[FE_USD] ?? 1;
  const chain = utils.formatChain(CHAIN);

  const pools = [];
  for (let i = 0; i < branchCount; i++) {
    const collToken = collTokens[i].toLowerCase();
    const collPrice = pricesByAddress[collToken];
    if (!collPrice) continue;

    const collDec = Number(decimals[i] ?? 18);
    const symbol = symbols[i] || 'UNKNOWN';
    const totalColl =
      (Number(activeColl[i]) + Number(defaultColl[i])) / 10 ** collDec;
    const totalCollUsd = totalColl * collPrice;

    const totalDebt = Number(activeDebt[i]) / 1e18;
    const totalDebtUsd = totalDebt * feUsdPrice;

    const borrowApy = Number(avgInterestRates[i]) / 1e16;
    const ltv = mcrs[i] ? 1 / (Number(mcrs[i]) / 1e18) : undefined;

    const spSupply = Number(spDeposits[i]) / 1e18;
    const spSupplyUsd = spSupply * feUsdPrice;
    const spApy =
      spSupply > 0 ? (borrowApy * SP_YIELD_SPLIT * totalDebt) / spSupply : 0;

    pools.push({
      pool: activePools[i].toLowerCase(),
      chain,
      project: 'felix-cdp',
      symbol,
      tvlUsd: totalCollUsd,
      apy: 0,
      apyBaseBorrow: borrowApy,
      totalSupplyUsd: totalCollUsd,
      totalBorrowUsd: totalDebtUsd,
      ltv,
      mintedCoin: 'feUSD',
      underlyingTokens: [collToken],
      token: null,
    });

    if (spSupplyUsd > 0) {
      pools.push({
        pool: stabilityPools[i].toLowerCase(),
        chain,
        project: 'felix-cdp',
        symbol: 'feUSD',
        tvlUsd: spSupplyUsd,
        apy: spApy,
        underlyingTokens: [FE_USD],
        rewardTokens: [FE_USD, collToken],
        poolMeta: `${symbol} Stability Pool`,
        token: null,
      });
    }
  }

  return pools.filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.usefelix.xyz/earn',
};
