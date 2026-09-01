/**
 * ScrubVault yield adapter for DefiLlama.
 *
 * ScrubVault is a delta-neutral managed vault where users deposit USDt (Kava)
 * or USDC (Arbitrum) and receive share tokens representing their proportional
 * ownership. The deposited capital is deployed off-chain across centralised and
 * decentralised exchanges running a delta-neutral strategy that earns yield from
 * funding rates and market-making activity.
 *
 * Why funds are not held in the vault contract:
 *   The vault contract functions as an on-chain accounting and settlement layer.
 *   Once a deposit batch is processed, the stablecoins are transferred to the
 *   strategy wallet and actively deployed on exchanges. The on-chain variable
 *   `totalVaultValue` is the authoritative AUM figure — it is updated by the
 *   admin/strategy role via `distributeRewards()` each time PnL is settled.
 *   TVL and APY reported here are therefore based on that on-chain accounting
 *   value, not on a simple `balanceOf` check.
 *
 * APY methodology:
 *   APR is derived from all `RewardDistributed` events within the past 3 days.
 *   All events are included — negative (loss) days reduce the result so the
 *   figure reflects the true rolling return, not just positive days.
 *   Rewards are distributed once per day (6 pm - 1 am UTC), so a 3-day
 *   lookback always captures at least one event.
 *   APR formula: sum(rewardAmount over window) / prevTVL / windowDays * 365 * 100.
 *
 *   Block numbers and logs are fetched via the DefiLlama SDK for both chains:
 *   - Latest block: sdk.api.util.getLatestBlock(chain).
 *   - Logs: sdk.getEventLogs with the RewardDistributed event ABI.
 *   - Arbitrum: single getEventLogs call (no per-request block limit).
 *   - Kava: RPC caps eth_getLogs at 10 000 blocks, so the 3-day window
 *     (~43 200 blocks) is split into 5 parallel SDK calls.
 */

const sdk        = require('@defillama/sdk');
const { ethers } = require('ethers');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT = 'scrubvault';

const VAULTS = {
  kava: {
    chain:        'Kava',
    address:      '0x7BFf6c730dA681dF03364c955B165576186370Bc',
    stablecoin:   '0x919C1c267BC06a7039e03fcc2eF738525769109c', // USDt on Kava
    symbol:       'USDt',
    decimals:     6,
    poolMeta:     'Delta Neutral USDt Vault',
    logChunkSize: 10000, // Kava RPC limit per eth_getLogs request
    blockTime:    6,     // seconds per block
  },
  arbitrum: {
    chain:        'Arbitrum',
    address:      '0x439a923517C4DFD3F3d0ABb0C36E356D39CF3f9D',
    stablecoin:   '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // native USDC
    symbol:       'USDC',
    decimals:     6,
    poolMeta:     'Delta Neutral USDC Vault',
    logChunkSize: null,  // Arbitrum handles large ranges in one call
    blockTime:    0.25,
  },
};

// ─── ABI / event setup ───────────────────────────────────────────────────────

const TOTAL_VAULT_VALUE_ABI = {
  inputs:          [],
  name:            'totalVaultValue',
  outputs:         [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type:            'function',
};

// shareValue() returns the USD value of one vault share, always 18 decimals,
// regardless of the underlying stablecoin's decimals. Returns 1e18 when no
// shares have been minted yet (1:1 default).
const SHARE_VALUE_ABI = {
  inputs:          [],
  name:            'shareValue',
  outputs:         [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type:            'function',
};
const SHARE_VALUE_DECIMALS = 18;

const REWARD_EVENT_ABI =
  'event RewardDistributed(int256 rewardAmount, uint256 newTotalVaultValue, uint256 timestamp)';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchTvlUsd(chain, vaultAddress, decimals) {
  const { output } = await sdk.api.abi.call({
    abi:    TOTAL_VAULT_VALUE_ABI,
    target: vaultAddress,
    chain,
  });
  // formatUnits is overflow-safe for 256-bit values; Number coercion alone is not.
  return Number(ethers.utils.formatUnits(output, decimals));
}

async function fetchPricePerShare(chain, vaultAddress) {
  const { output } = await sdk.api.abi.call({
    abi:    SHARE_VALUE_ABI,
    target: vaultAddress,
    chain,
  });
  // shareValue() is always 18-decimal USD regardless of stablecoin decimals.
  return Number(ethers.utils.formatUnits(output, SHARE_VALUE_DECIMALS));
}

async function fetchRewardLogs(chain, vaultAddress, latestBlock, blockTime, chunkSize) {
  const blockWindow = Math.ceil(3 * 24 * 3600 / blockTime); // 3-day window
  const fromBlock   = Math.max(0, latestBlock - blockWindow);

  // sdk.getEventLogs (event-ABI based) for consistency with the rest of the
  // codebase; it returns logs pre-decoded into `.args`. Errors propagate to
  // the per-vault try/catch in apy() — not swallowed — so an RPC failure is
  // never reported as a real 0% APR.
  const logsCall = (from, to) =>
    sdk.getEventLogs({
      target:    vaultAddress,
      eventAbi:  REWARD_EVENT_ABI,
      fromBlock: from,
      toBlock:   to,
      chain,
    });

  if (!chunkSize) {
    return logsCall(fromBlock, latestBlock);
  }

  // Kava: split 3-day window into parallel 10k-block chunks (~5 chunks)
  const chunks = [];
  for (let s = fromBlock; s <= latestBlock; s += chunkSize) {
    chunks.push([s, Math.min(s + chunkSize - 1, latestBlock)]);
  }
  const results = await Promise.all(chunks.map(([f, t]) => logsCall(f, t)));
  return results.flat();
}

function computeDailyApr(logs, decimals) {
  // Logs are pre-decoded by sdk.getEventLogs (oldest first); args are BigInt.
  const events = logs
    .filter((l) => l && l.args)
    .map((l) => ({
      reward: BigInt(l.args.rewardAmount),         // int256 — negative on loss days
      newTvl: BigInt(l.args.newTotalVaultValue),   // uint256
    }));
  if (!events.length) return 0;

  // Sum all rewards across the window — negative (loss) days are included so
  // the result reflects the true rolling return, not just positive days.
  let totalReward = 0n;
  for (const { reward } of events) {
    totalReward += reward;
  }

  // TVL before the earliest event in the window is used as the denominator.
  const firstPrevTvl = events[0].newTvl - events[0].reward;
  if (firstPrevTvl <= 0n) return 0;

  // formatUnits is overflow-safe for 256-bit values and handles negatives;
  // plain Number coercion is not.
  const totalRewardUsd = Number(ethers.utils.formatUnits(totalReward, decimals));
  const prevTvlUsd     = Number(ethers.utils.formatUnits(firstPrevTvl, decimals));
  if (prevTvlUsd <= 0) return 0;

  // Annualise over the 3-day lookback window.
  const WINDOW_DAYS = 3;
  const apr = (totalRewardUsd / prevTvlUsd / WINDOW_DAYS) * 365 * 100;
  return Number.isFinite(apr) ? apr : 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const apy = async () => {
  const pools = [];

  for (const [chainKey, vault] of Object.entries(VAULTS)) {
    // Wrap each vault independently so an RPC outage on one chain does not
    // prevent the other chain's pool from being reported.
    try {
      const latestBlock = (await sdk.api.util.getLatestBlock(chainKey)).number;

      const [tvlUsd, logs, pricePerShare] = await Promise.all([
        fetchTvlUsd(chainKey, vault.address, vault.decimals),
        fetchRewardLogs(
          chainKey,
          vault.address,
          latestBlock,
          vault.blockTime,
          vault.logChunkSize,
        ),
        fetchPricePerShare(chainKey, vault.address),
      ]);

      const apyBase  = computeDailyApr(logs, vault.decimals);
      const vaultUrl =
        `https://invest.scrub.money/vault/chain/${chainKey}/${vault.address.toLowerCase()}`;

      pools.push({
        pool:             `${vault.address}-${chainKey}`.toLowerCase(),
        chain:            vault.chain,
        project:          PROJECT,
        symbol:           vault.symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: [vault.stablecoin],
        poolMeta:         vault.poolMeta,
        url:              vaultUrl,
        pricePerShare,
      });
    } catch (err) {
      console.error(
        `[${PROJECT}] ${vault.chain} vault ${vault.address} failed: ${err.message}`,
      );
    }
  }

  return pools;
};

module.exports = {
  protocolId: '7849',
  timetravel: false,
  apy,
  url: 'https://invest.scrub.money/',
};
