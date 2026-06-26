/*
 * Tori Finance - DefiLlama yield-server adapter
 * Repo: github.com/DefiLlama/yield-server  ->  src/adaptors/tori-finance/index.js
 *
 * Lists the Tori-native yield pool: strUSD (StakedTrUSD), an ERC-4626 staking vault.
 * The adapter folder name equals the protocol slug (tori-finance) and protocolId equals
 * the id of "Tori Finance" on https://api.llama.fi/protocols (8063), both required by the
 * yield-server test.
 *
 * strUSD mechanics (confirmed on-chain):
 *   - ERC-4626 vault, asset = trUSD (a $1-pegged synthetic dollar, valued 1:1).
 *   - Rewards are streamed via transferInRewards(), emitting RewardsReceived(uint256), and
 *     vest linearly over an 8 hour window (3 distributions per day). 7 day unstaking cooldown.
 *   - totalAssets() = trUSD.balanceOf(vault) - unvestedAmount.
 *
 * APY is computed fully on-chain, no external API (similar to Ethena's sUSDe adapter):
 *   - apyBase: latest RewardsReceived amount annualized over the 8h cadence (3 * 365) and
 *     compounded weekly (utils.aprToApy(_, 52)).
 *   - apyBase7d: ERC-4626 share-price (convertToAssets) growth over a trailing window
 *     (clamped to launch so it never queries a pre-deployment block), annualized.
 *   - pricePerShare: current convertToAssets(1e18) / 1e18.
 * During the fee-waived pre-deposit phase, before transferInRewards has run, both APYs read 0.
 *
 * etrUSD (Tori Ecosystem Vault) is intentionally not listed here: it is an Upshift V2 vault
 * with no on-chain per-share price (convertToAssets reverts; only getTotalAssets), and its TVL
 * is already tracked under Tori Finance TVL + Upshift.
 */
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const TRUSD = '0xd0580192E98eA6CEB9c7b6191Ed2E27560911697';
const STRUSD = '0x280839980a7eD0D7717F64125fE241012E5F5815';
const ONE = '1000000000000000000'; // 1e18 shares
const DAY = 86400;

// Rewards vest over an 8 hour window => 3 distributions/day.
const REWARDS_EVENT = 'event RewardsReceived(uint256 amount)';
const DISTRIBUTIONS_PER_YEAR = 3 * 365;
const SHARE_PRICE_LOOKBACK_DAYS = 7;
// strUSD launched with the protocol (2026-06-23); never query before this.
const LAUNCH_TS = 1782172800;

const PPS_ABI = 'function convertToAssets(uint256) view returns (uint256)';

const call = async (target, abi, params, block) =>
  (await sdk.api.abi.call({ target, abi, params, chain: CHAIN, block })).output;

const blockForTs = async (ts) =>
  (await sdk.api.util.lookupBlock(ts, { chain: CHAIN })).block;

// ERC-4626 share-price growth over a trailing window, annualized.
// The lookback start is clamped to LAUNCH_TS so convertToAssets is never queried at a
// pre-deployment block, and the result is annualized over the actual elapsed window.
const sharePriceApy = async (nowBlock, nowTs, days) => {
  const startTs = Math.max(LAUNCH_TS, nowTs - days * DAY);
  const elapsedDays = (nowTs - startTs) / DAY;
  if (elapsedDays <= 0) return 0;
  const pastBlock = await blockForTs(startTs);
  const [ppsNow, ppsPast] = await Promise.all([
    call(STRUSD, PPS_ABI, [ONE], nowBlock),
    call(STRUSD, PPS_ABI, [ONE], pastBlock),
  ]);
  const ratio = Number(ppsNow) / Number(ppsPast);
  return isFinite(ratio) && ratio > 0 ? (ratio ** (365 / elapsedDays) - 1) * 100 : 0;
};

const apy = async () => {
  const latestBlock = await sdk.api.util.getLatestBlock(CHAIN);
  const nowBlock = latestBlock.number;
  const nowTs = latestBlock.timestamp;

  // TVL: strUSD is backed by trUSD, a $1 synthetic dollar, valued 1:1.
  const totalAssets = await call(STRUSD, 'uint256:totalAssets', [], nowBlock);
  const tvlUsd = Number(totalAssets) / 1e18;

  // Current price per share.
  const pps = await call(STRUSD, PPS_ABI, [ONE], nowBlock);
  const pricePerShare = Number(pps) / 1e18;

  // apyBase: from the latest streamed-rewards event, annualized over the vesting cadence.
  let apyBase = 0;
  try {
    const fromBlock = await blockForTs(LAUNCH_TS);
    const logs = (
      await sdk.getEventLogs({
        target: STRUSD,
        eventAbi: REWARDS_EVENT,
        fromBlock,
        toBlock: nowBlock,
        chain: CHAIN,
      })
    ).sort((a, b) => b.blockNumber - a.blockNumber);
    if (logs.length && tvlUsd) {
      const rewards = Number(logs[0].args.amount) / 1e18;
      const aprBase = ((rewards * DISTRIBUTIONS_PER_YEAR) / tvlUsd) * 100;
      apyBase = utils.aprToApy(aprBase, 52); // weekly compounding
    }
  } catch (e) {
    apyBase = 0; // no readable reward stream yet -> 0 during pre-deposit
  }

  // apyBase7d: share-price growth cross-check.
  let apyBase7d = 0;
  try {
    apyBase7d = await sharePriceApy(nowBlock, nowTs, SHARE_PRICE_LOOKBACK_DAYS);
  } catch (e) {
    apyBase7d = 0;
  }

  return [
    {
      pool: `${STRUSD.toLowerCase()}-${CHAIN}`,
      chain: 'Ethereum',
      project: 'tori-finance',
      symbol: 'strUSD',
      tvlUsd,
      apyBase: Math.max(Number(apyBase) || 0, 0),
      apyBase7d: Math.max(Number(apyBase7d) || 0, 0),
      pricePerShare,
      underlyingTokens: [TRUSD],
      poolMeta: '7 days unstaking',
      isIntrinsicSource: true,
      url: 'https://app.tori.finance/earn',
    },
  ];
};

module.exports = {
  timetravel: false,
  protocolId: '8063',
  apy,
  url: 'https://app.tori.finance/earn',
};
