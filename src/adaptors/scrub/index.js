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
 *   Daily APR is derived from the most recent `RewardDistributed` event within
 *   the past 3 days. Rewards are distributed once per day (6 pm - 1 am UTC),
 *   so a 3-day lookback always captures at least one event.
 *   APR formula: rewardAmount / prevTVL * 365 * 100.
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
  return Number(output) / 10 ** decimals;
}

async function fetchRewardLogs(chain, vaultAddress, latestBlock, blockTime, chunkSize) {
  const blockWindow = Math.ceil(3 * 24 * 3600 / blockTime); // 3-day window
  const fromBlock   = Math.max(0, latestBlock - blockWindow);

  const logsCall = (from, to) =>
    sdk.api.util.getLogs({
      target:    vaultAddress,
      topic:     '',
      fromBlock: from,
      toBlock:   to,
      keys:      [],
      topics:    [REWARD_TOPIC],
      chain,
    }).then((r) => r.output || []).catch(() => []);

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
  // Iterate newest-first to find the most recent positive reward event.
  for (let i = logs.length - 1; i >= 0; i--) {
    try {
      const parsed = rewardIface.parseLog(logs[i]);
      const reward = parsed.args.rewardAmount; // int256, may be negative on a loss day
      const newTvl = parsed.args.newTotalVaultValue;

      if (reward.lte(0)) continue;

      const rewardUsd = reward.toNumber()             / 10 ** decimals;
      const prevTvl   = newTvl.sub(reward).toNumber() / 10 ** decimals;

      if (prevTvl <= 0) continue;

      const apr = (rewardUsd / prevTvl) * 365 * 100;
      return Number.isFinite(apr) ? Math.max(0, apr) : 0;
    } catch (_) {
      continue;
    }
  }
  return 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const apy = async () => {
  const pools = [];

  for (const [chainKey, vault] of Object.entries(VAULTS)) {
    const latestBlock = await getLatestBlockNumber(chainKey, vault.rpcUrl);

    const [tvlUsd, logs] = await Promise.all([
      fetchTvlUsd(chainKey, vault.address, vault.decimals),
      fetchRewardLogs(
        chainKey,
        vault.address,
        latestBlock,
        vault.blockTime,
        vault.logChunkSize,
      ),
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
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://invest.scrub.money/',
};
