/**
 * Boar Finance yield adapter — BTC vault on Mezo (chain ID 31612).
 *
 * Exact mirror of the dapp's getProtocolApy / currentApy logic:
 *   1. Fetch the most recent compound event from subgraph
 *   2. Estimate epoch-start block from the event timestamp (same constants as dapp)
 *   3. Read locked(managedTokenId).amount at that block
 *   4. Read yieldPerEpoch(epochStart) at current block
 *   5. APY = (1 + yieldPerEpoch / lockedAmount)^52 - 1
 */

const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'mezo';
const EPOCH_DURATION = 604800;
const EPOCHS_PER_YEAR = 52;

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cmlihkrxs647t01t34wtrafk1/subgraphs/boar-finance-data-mezo/current/gn';

// Mainnet addresses (chain ID 31612)
const BTC = '0x7b7C000000000000000000000000000000000000';
const VE_BTC = '0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279';
const BOAR_BTC_RELAY = '0x920b1c573F503554E113e4c47A92cd289a3d1625';
const MANAGED_TOKEN_ID = 1226;

const lockedAbi = {
  inputs: [{ name: '_tokenId', type: 'uint256' }],
  name: 'locked',
  outputs: [
    {
      name: '',
      type: 'tuple',
      components: [
        { name: 'amount', type: 'int128' },
        { name: 'end', type: 'uint256' },
        { name: 'isPermanent', type: 'bool' },
        { name: 'boost', type: 'uint256' },
      ],
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const yieldPerEpochAbi = {
  inputs: [{ name: 'epoch', type: 'uint256' }],
  name: 'yieldPerEpoch',
  outputs: [{ name: 'amount', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

// Block estimation constants — copied verbatim from dapp's get-protocol-apy.ts
const MAINNET_DEPLOYMENT_BLOCK = 6_820_684;
const MAINNET_DEPLOYMENT_TIMESTAMP = 1_770_823_223;
const MAINNET_AVG_BLOCK_TIME = 4; // seconds per block

function epochStartFromTimestamp(timestamp) {
  return timestamp - (timestamp % EPOCH_DURATION);
}

function estimateBlockAtEpochStart(epochStart) {
  const elapsed = epochStart - MAINNET_DEPLOYMENT_TIMESTAMP;
  const blocksSince = Math.floor(elapsed / MAINNET_AVG_BLOCK_TIME);
  return MAINNET_DEPLOYMENT_BLOCK + blocksSince;
}

// Matches dapp's APY_PRECISION from @repo/shared
const APY_PRECISION = 10_000_000n;

const getApy = async () => {
  // Step 1: most recent compound event — mirrors fetchCompoundEvents
  const { data } = await axios.post(
    SUBGRAPH_URL,
    {
      query: `{
        compounds(orderBy: block_number, orderDirection: desc, first: 1) {
          timestamp: timestamp_
        }
      }`,
    },
    { headers: { 'Content-Type': 'application/json' } },
  );

  const compounds = data?.data?.compounds ?? [];
  if (compounds.length === 0) return [];

  const latestTimestamp = Number(compounds[0].timestamp);
  const epochStart = epochStartFromTimestamp(latestTimestamp);

  const epochStartBlock = estimateBlockAtEpochStart(epochStart);

  // Steps 2-4: read on-chain — mirrors fetchLockedAmountsAtEpochStarts + fetchYieldsPerEpoch
  const [lockedRes, yieldRes, priceData] = await Promise.all([
    sdk.api.abi.call({
      target: VE_BTC,
      abi: lockedAbi,
      params: [MANAGED_TOKEN_ID],
      chain: CHAIN,
      block: epochStartBlock,
    }),
    sdk.api.abi.call({
      target: BOAR_BTC_RELAY,
      abi: yieldPerEpochAbi,
      params: [epochStart],
      chain: CHAIN,
    }),
    utils.getPrices([BTC], CHAIN),
  ]);

  const lockedAmount = BigInt(lockedRes.output.amount);
  const yieldAmount = BigInt(yieldRes.output);

  if (lockedAmount === 0n || yieldAmount === 0n) return [];

  // Step 5: mirrors computeEpochApy + weeklyRateToApy
  const rateBP = (yieldAmount * APY_PRECISION) / lockedAmount;
  const rate = Number(rateBP) / Number(APY_PRECISION);
  const apyBase = ((1 + rate) ** EPOCHS_PER_YEAR - 1) * 100;

  const btcPrice = priceData.pricesByAddress[BTC.toLowerCase()] ?? 0;
  const tvlUsd = (Number(lockedAmount) / 1e18) * btcPrice;

  return [
    {
      pool: `${VE_BTC.toLowerCase()}-boar-btc-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'boar-finance',
      symbol: 'BTC',
      poolMeta: 'veBTC — Boar managed',
      tvlUsd,
      apyBase,
      underlyingTokens: [BTC],
      rewardTokens: [BTC],
      url: 'https://boar.finance/dashboard',
    },
  ].filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://boar.finance',
};
