const sdk = require('@defillama/sdk');

// BTCD: synthetic basket-backed token (~50% BTC / ~50% USD), RFQ-minted via BTCDMinting.
// sBTCD: ERC-4626 staking vault over BTCD with 8h linear vesting and 7-day Silo cooldown.
// SBTCDOracle: on-chain Chainlink-compatible oracle returning sBTCD/USD in 8 decimals.

const BTCD = '0xC6694e05B750015f54Ac646544a4a9D33cbe4086';
const SBTCD = '0x3BC801419479865B24b4d32faB0Bf64638Abbd5f';
const SBTCD_ORACLE = '0x332ebF042a7B7D87A8a2628186f8A5B12d8a6d94';

const WAD = '1000000000000000000'; // 1e18
const SCALE = 10n ** 18n;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_BLOCK = 12;
const LOOKBACK_DAYS = 7;
const BLOCKS_PER_LOOKBACK = Math.floor((SECONDS_PER_DAY * LOOKBACK_DAYS) / SECONDS_PER_BLOCK);

const convertToAssetsAbi = {
  inputs: [{ type: 'uint256', name: 'shares' }],
  name: 'convertToAssets',
  outputs: [{ type: 'uint256', name: 'assets' }],
  stateMutability: 'view',
  type: 'function',
};

const latestRoundDataAbi = {
  inputs: [],
  name: 'latestRoundData',
  outputs: [
    { type: 'uint80', name: 'roundId' },
    { type: 'int256', name: 'answer' },
    { type: 'uint256', name: 'startedAt' },
    { type: 'uint256', name: 'updatedAt' },
    { type: 'uint80', name: 'answeredInRound' },
  ],
  stateMutability: 'view',
  type: 'function',
};

// 7-day annualised share-price growth, compounded to APY.
async function computeApyBase(currentBlock) {
  const olderBlock = currentBlock - BLOCKS_PER_LOOKBACK;
  const calls = [
    sdk.api.abi.call({
      chain: 'ethereum',
      target: SBTCD,
      abi: convertToAssetsAbi,
      params: [WAD],
    }),
    sdk.api.abi.call({
      chain: 'ethereum',
      target: SBTCD,
      abi: convertToAssetsAbi,
      params: [WAD],
      block: olderBlock,
    }),
  ];
  const [nowRes, oldRes] = await Promise.all(calls);
  const nowVal = BigInt(nowRes.output);
  const oldVal = BigInt(oldRes.output);
  if (oldVal <= 0n || nowVal <= 0n) return 0;
  const ratioScaled = (nowVal * SCALE) / oldVal; // (now/old) × 1e18
  const ratio = Number(ratioScaled) / 1e18;
  if (!isFinite(ratio) || ratio <= 0) return 0;
  return (Math.pow(ratio, 365 / LOOKBACK_DAYS) - 1) * 100;
}

const apy = async () => {
  const [totalSupplyRes, oracleRes, latestBlock] = await Promise.all([
    sdk.api.abi.call({ chain: 'ethereum', target: SBTCD, abi: 'erc20:totalSupply' }),
    sdk.api.abi.call({ chain: 'ethereum', target: SBTCD_ORACLE, abi: latestRoundDataAbi }),
    sdk.api.util.getLatestBlock('ethereum'),
  ]);

  const totalSupply = BigInt(totalSupplyRes.output);    // 18 decimals
  const priceUsd_e8 = BigInt(oracleRes.output.answer);  // 8 decimals
  // tvlUsd = totalSupply × price / 10^(18+8). Use BigInt to avoid float overflow on large supply.
  const tvlUsdScaled = (totalSupply * priceUsd_e8) / 10n ** 18n; // 8-decimal USD
  const tvlUsd = Number(tvlUsdScaled) / 1e8;

  const apyBase = await computeApyBase(latestBlock.number);

  return [
    {
      pool: `${SBTCD.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project: 'btcd',
      symbol: 'sBTCD',
      tvlUsd,
      apyBase,
      underlyingTokens: [BTCD],
      poolMeta: 'BTCD staking vault (8h vesting, 7d cooldown)',
      url: 'https://app.btcd.com',
      token: SBTCD,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.btcd.com',
};
