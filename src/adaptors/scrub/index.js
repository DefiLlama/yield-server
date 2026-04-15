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

const sdk    = require('@defillama/sdk');
const axios  = require('axios');
const { ethers } = require('ethers');

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

const REWARD_DISTRIBUTED_ABI =
  'event RewardDistributed(int256 rewardAmount, uint256 newTotalVaultValue, uint256 timestamp)';

// keccak256("RewardDistributed(int256,uint256,uint256)")
const REWARD_DISTRIBUTED_TOPIC =
  '0x7e4e42cfa6e77e4567e0e9540568546a5e29c29438d9d7c6b05db0db29f5fd51';

const rewardIface = new ethers.utils.Interface([REWARD_DISTRIBUTED_ABI]);

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
 * Returns a finite percentage number, e.g. 8.5 for 8.5 % APR, or null on any failure.
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
    const apr = Number(aprRaw) / 100;
    return Number.isFinite(apr) ? apr : null;
  } catch (_) {
    return null;
  }
}

/**
 * Compute a rolling 30-day APR from on-chain `RewardDistributed` events using
 * the DefiLlama SDK. Returns a plain percentage or 0 on failure.
 *
 * Event: RewardDistributed(int256 rewardAmount, uint256 newTotalVaultValue, uint256 timestamp)
 * Only positive rewards count toward APY.
 */
async function fetchAprFromEvents(chain, vaultAddress, tvlUsd, decimals) {
  try {
    const nowSec      = Math.floor(Date.now() / 1000);
    const windowSec   = 30 * 24 * 60 * 60; // 30 days
    const fromTimeSec = nowSec - windowSec;

    // Approximate block window — exact time filtering happens via decoded timestamp.
    const avgBlockTime = chain === 'kava' ? 6 : 0.25;
    const blocksWindow = Math.ceil(windowSec / avgBlockTime);

    const currentBlock = await sdk.api.util.getLatestBlock(chain);
    const latestBlock  = currentBlock.number;
    const fromBlock    = Math.max(0, latestBlock - blocksWindow);

    const { output: logs } = await sdk.api.util.getLogs({
      target:    vaultAddress,
      topic:     '',
      fromBlock,
      toBlock:   latestBlock,
      keys:      [],
      topics:    [REWARD_DISTRIBUTED_TOPIC],
      chain,
    });

    if (!logs.length) return 0;

    let totalRewardUsd  = 0;
    let oldestTimestamp = nowSec;

    for (const log of logs) {
      const parsed     = rewardIface.parseLog(log);
      const rewardRaw  = parsed.args.rewardAmount; // ethers BigNumber (signed)
      const tsSec      = parsed.args.timestamp.toNumber();

      if (tsSec < fromTimeSec) continue; // outside 30-day window
      if (rewardRaw.lte(0)) continue;    // losses don't count toward APY

      totalRewardUsd += rewardRaw.toNumber() / 10 ** decimals;
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
    if (!Number.isFinite(apyBase)) {
      apyBase = await fetchAprFromEvents(sdkChain, vault.address, tvlUsd, vault.decimals);
    }

    // Dynamic vault URL using chain name and vault address
    const vaultUrl = `https://invest.scrub.money/vault/chain/${sdkChain}/${vault.address.toLowerCase()}`;

    pools.push({
      pool:             `${vault.address}-${sdkChain}`.toLowerCase(),
      chain:            vault.chain,
      project:          PROJECT,
      symbol:           vault.symbol,
      tvlUsd,
      apyBase:          Math.round(apyBase * 100) / 100, // round to 2 dp
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
