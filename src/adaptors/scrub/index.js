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
 *   Logs are fetched via the DefiLlama SDK for both chains:
 *   - Arbitrum: single sdk.api.util.getLogs call (no per-request block limit).
 *   - Kava: RPC caps eth_getLogs at 10 000 blocks, so the 3-day window
 *     (~43 200 blocks) is split into 5 parallel SDK calls.
 *   - Kava's latest block is obtained via ethers.providers.JsonRpcProvider
 *     because sdk.api.util.getLatestBlock does not support Kava.
 */

const sdk        = require('@defillama/sdk');
const { ethers } = require('ethers');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT = 'scrub';

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
    rpcUrl:       'https://evm.kava.io',
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
    rpcUrl:       null,  // use sdk.api.util.getLatestBlock
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

const rewardIface  = new ethers.utils.Interface([
  'event RewardDistributed(int256 rewardAmount, uint256 newTotalVaultValue, uint256 timestamp)',
]);
const REWARD_TOPIC = rewardIface.getEventTopic('RewardDistributed');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getLatestBlockNumber(chainKey, rpcUrl) {
  if (rpcUrl) {
    // sdk.api.util.getLatestBlock does not support all chains (e.g. Kava).
    // Fall back to a direct JSON-RPC call via ethers — already a dependency.
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    return provider.getBlockNumber();
  }
  return (await sdk.api.util.getLatestBlock(chainKey)).number;
}

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

  // Let RPC/SDK errors propagate to the per-vault try/catch in apy(); swallowing
  // them here would make a network failure indistinguishable from "no rewards"
  // and the vault would be emitted with apyBase: 0.
  const logsCall = (from, to) =>
    sdk.api.util.getLogs({
      target:    vaultAddress,
      topic:     '',
      fromBlock: from,
      toBlock:   to,
      keys:      [],
      topics:    [REWARD_TOPIC],
      chain,
    }).then((r) => r.output || []);

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
  // Parse all events in the window (logs are in chronological order, oldest first).
  const events = [];
  for (const log of logs) {
    try {
      const p = rewardIface.parseLog(log);
      events.push({ reward: p.args.rewardAmount, newTvl: p.args.newTotalVaultValue });
    } catch (_) {
      // skip unparseable logs
    }
  }
  if (!events.length) return 0;

  // Sum all rewards across the window — negative (loss) days are included so
  // the result reflects the true rolling return, not just positive days.
  let totalReward = ethers.BigNumber.from(0);
  for (const { reward } of events) {
    totalReward = totalReward.add(reward);
  }

  // TVL before the earliest event in the window is used as the denominator.
  const firstPrevTvl = events[0].newTvl.sub(events[0].reward);
  if (firstPrevTvl.lte(0)) return 0;

  // Use formatUnits instead of toNumber() to avoid Number.MAX_SAFE_INTEGER
  // overflow on large balances (toNumber throws above 2^53-1, ~$9B at 6 decimals).
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
      const latestBlock = await getLatestBlockNumber(chainKey, vault.rpcUrl);

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
        apyBase:          Math.round(apyBase * 100) / 100,
        underlyingTokens: [vault.stablecoin],
        poolMeta:         vault.poolMeta,
        url:              vaultUrl,
        pricePerShare:    Math.round(pricePerShare * 1e6) / 1e6,
      });
    } catch (err) {
      console.error(
        `[scrub] ${vault.chain} vault ${vault.address} failed: ${err.message}`,
      );
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://invest.scrub.money/',
};
