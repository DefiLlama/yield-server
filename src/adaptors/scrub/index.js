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
 *   Rolling 30-day APY is derived from `RewardDistributed` events emitted by
 *   each vault. For each reward event we record `rewardAmount` and the elapsed
 *   time since the previous reward. We sum all rewards in the 30-day window,
 *   divide by the pre-reward TVL at the start of that window, and annualise.
 *   The Kava vault additionally exposes this value via its subgraph (field `apr`
 *   in basis-points × 100, i.e. 10 000 = 100 %). The subgraph value is used as
 *   a primary source with direct event computation as a fallback.
 */

const sdk   = require('@defillama/sdk');
const axios = require('axios');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT = 'scrub';

const VAULTS = {
  kava: {
    chain:         'Kava',
    address:       '0x7BFf6c730dA681dF03364c955B165576186370Bc',
    stablecoin:    '0x919C1c267BC06a7039e03fcc2eF738525769109c', // USDt on Kava
    symbol:        'USDt',
    decimals:      6,
    subgraphUrl:   'https://subgraph.scrub.money/subgraphs/name/scrubvault',
    poolMeta:      'Delta Neutral USDt Vault',
  },
  arbitrum: {
    chain:         'Arbitrum',
    address:       '0x439a923517C4DFD3F3d0ABb0C36E356D39CF3f9D',
    stablecoin:    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC (native) on Arbitrum
    symbol:        'USDC',
    decimals:      6,
    subgraphUrl:   null, // subgraph deployment pending — will be filled once live
    poolMeta:      'Delta Neutral USDC Vault',
  },
};

// ─── ABI fragments ────────────────────────────────────────────────────────────

const TOTAL_VAULT_VALUE_ABI = {
  inputs:  [],
  name:    'totalVaultValue',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

// keccak256("RewardDistributed(int256,uint256,uint256)")
const REWARD_DISTRIBUTED_TOPIC =
  '0x7e4e42cfa6e77e4567e0e9540568546a5e29c29438d9d7c6b05db0db29f5fd51';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch the current `totalVaultValue` (6-decimal stablecoin units) from the
 * DepositVault contract and return the USD equivalent.
 */
async function fetchTvlUsd(chain, vaultAddress, decimals) {
  const { output } = await sdk.api.abi.call({
    abi:    TOTAL_VAULT_VALUE_ABI,
    target: vaultAddress,
    chain,
  });
  return Number(output) / 10 ** decimals;
}

/**
 * Try to read the rolling APR from the Kava subgraph.
 * The `apr` field is stored as an integer scaled by 10 000 (where 10 000 = 100 %).
 * Returns a plain percentage number, e.g. 8.5 for 8.5 % APR, or null on failure.
 */
async function fetchAprFromSubgraph(subgraphUrl, vaultAddress) {
  if (!subgraphUrl) return null;
  try {
    const query = `{
      vault(id: "${vaultAddress.toLowerCase()}") {
        apr
      }
    }`;
    const { data } = await axios.post(subgraphUrl, { query }, { timeout: 8000 });
    const aprRaw = data?.data?.vault?.apr;
    if (aprRaw == null) return null;
    // apr is in basis-points × 100: divide by 100 to get plain percentage
    return Number(aprRaw) / 100;
  } catch (_) {
    return null;
  }
}

/**
 * Compute a rolling 30-day APY from on-chain `RewardDistributed` events using
 * a direct eth_getLogs RPC call. Returns a plain percentage or 0 on failure.
 *
 * Event signature: RewardDistributed(int256 rewardAmount, uint256 newTotalVaultValue, uint256 timestamp)
 * We only count positive rewards (negative = loss events) for the APY figure.
 */
async function fetchAprFromEvents(chain, vaultAddress, tvlUsd, decimals) {
  try {
    const chainToRpc = {
      kava:     'https://evm.kava.io',
      arbitrum: 'https://arb1.arbitrum.io/rpc',
    };
    const rpc = chainToRpc[chain];
    if (!rpc) return 0;

    const nowSec      = Math.floor(Date.now() / 1000);
    const windowSec   = 30 * 24 * 60 * 60; // 30 days
    const fromTimeSec = nowSec - windowSec;

    // Approximate block numbers (used as a wide filter — exact time filtering
    // happens by comparing the decoded timestamp in each log).
    const avgBlockTime = chain === 'kava' ? 6 : 0.25;
    const blocksWindow = Math.ceil(windowSec / avgBlockTime);

    // Fetch latest block number
    const latestResp = await axios.post(rpc, {
      jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [],
    }, { timeout: 8000 });
    const latestBlock = parseInt(latestResp.data.result, 16);
    const fromBlock   = Math.max(0, latestBlock - blocksWindow);

    // Fetch logs
    const logsResp = await axios.post(rpc, {
      jsonrpc: '2.0', id: 2,
      method: 'eth_getLogs',
      params: [{
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock:   '0x' + latestBlock.toString(16),
        address:   vaultAddress,
        topics:    [REWARD_DISTRIBUTED_TOPIC],
      }],
    }, { timeout: 12000 });

    const logs = logsResp.data.result ?? [];
    if (!logs.length) return 0;

    // Each log: data = abi.encode(int256 rewardAmount, uint256 newTotalVaultValue, uint256 timestamp)
    // 3 × 32-byte words, no indexed params
    let totalRewardUsd = 0;
    let oldestTimestamp = nowSec;

    for (const log of logs) {
      const data  = log.data.slice(2); // strip 0x
      // word 0: rewardAmount (int256, signed) — positive means profit
      const rewardHex = data.slice(0, 64);
      const rewardBig = BigInt('0x' + rewardHex);
      // interpret as signed: if top bit set, it's negative
      const rewardSigned =
        rewardBig > BigInt('0x7' + 'f'.repeat(63))
          ? rewardBig - BigInt('0x1' + '0'.repeat(64))
          : rewardBig;

      // word 2: timestamp
      const tsSec = parseInt(data.slice(128, 192), 16);

      if (tsSec < fromTimeSec) continue; // outside 30-day window
      if (rewardSigned <= 0n) continue;  // losses don't count toward APY

      totalRewardUsd += Number(rewardSigned) / 10 ** decimals;
      if (tsSec < oldestTimestamp) oldestTimestamp = tsSec;
    }

    if (totalRewardUsd === 0 || tvlUsd === 0) return 0;

    const elapsedDays = Math.max((nowSec - oldestTimestamp) / 86400, 1);
    const apr = (totalRewardUsd / tvlUsd) * (365 / elapsedDays) * 100;
    return Math.max(0, apr);
  } catch (_) {
    return 0;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const apy = async () => {
  const pools = [];

  for (const [chainKey, vault] of Object.entries(VAULTS)) {
    const sdkChain = chainKey; // sdk uses lowercase chain names

    // TVL
    const tvlUsd = await fetchTvlUsd(sdkChain, vault.address, vault.decimals);

    // APY: prefer subgraph (already computes rolling 30-day APR), fall back to events
    let apyBase = await fetchAprFromSubgraph(vault.subgraphUrl, vault.address);
    if (apyBase == null) {
      apyBase = await fetchAprFromEvents(sdkChain, vault.address, tvlUsd, vault.decimals);
    }

    pools.push({
      pool:             `${vault.address}-${sdkChain}`.toLowerCase(),
      chain:            vault.chain,
      project:          PROJECT,
      symbol:           vault.symbol,
      tvlUsd,
      apyBase:          Math.round(apyBase * 100) / 100, // round to 2 dp
      underlyingTokens: [vault.stablecoin],
      poolMeta:         vault.poolMeta,
      url:              'https://invest.scrub.money/',
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://invest.scrub.money/',
};
