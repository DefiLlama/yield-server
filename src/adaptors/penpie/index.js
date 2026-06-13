const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'penpie';

// PendleStaking contract per chain — holds LP tokens on behalf of Penpie depositors
const PENDLE_STAKING = {
  ethereum: '0x6E799758CEE75DAe3d84e09D40dc416eCf713652',
};

// PNP reward token
const PNP = '0x7DEdBce5a2E31E4c75f87FeA60bF796C17718715';

const PENDLE_API_BASE = 'https://api-v2.pendle.finance/core/v1';

const getPoolsForChain = async (chain, pendleStakingAddr) => {
  const chainId = { ethereum: 1, arbitrum: 42161, optimism: 10, base: 8453 }[
    chain
  ];
  if (!chainId) return [];

  // Fetch active markets from Pendle API
  const { data } = await axios.get(
    `${PENDLE_API_BASE}/${chainId}/markets/active`
  );
  const markets = data.markets || [];

  // For each market, check how much LP Penpie has staked
  const marketAddresses = markets.map((m) => m.address);

  const [balances, totalSupplies] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: marketAddresses.map((m) => ({
        target: m,
        params: [pendleStakingAddr],
      })),
      chain,
      abi: 'erc20:balanceOf',
    }),
    sdk.api.abi.multiCall({
      calls: marketAddresses.map((m) => ({ target: m })),
      chain,
      abi: 'erc20:totalSupply',
    }),
  ]);

  const pools = [];
  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    const balance = Number(balances.output[i].output);
    const totalSupply = Number(totalSupplies.output[i].output);

    if (!balance || !totalSupply || balance === 0) continue;

    const stakedFraction = balance / totalSupply;
    const totalLiquidity = market.details?.liquidity || 0;
    const tvlUsd = totalLiquidity * stakedFraction;

    if (tvlUsd < 1000) continue; // skip dust

    // Base APY: underlying yield (aggregatedApy - pendleApy) since Pendle gauge rewards
    // are boosted separately. For boosters, use maxBoostedApy as the effective yield
    // since they maximize vePENDLE allocation.
    const aggregatedApy = market.details?.aggregatedApy || 0;
    const maxBoostedApy = market.details?.maxBoostedApy || 0;

    // apyBase = non-PENDLE component (PT implied yield + swap fees)
    const pendleApy = market.details?.pendleApy || 0;
    const apyBase = (aggregatedApy - pendleApy) * 100;

    // apyReward = boosted PENDLE rewards (approximated by maxBoostedApy - base)
    const apyReward = (maxBoostedApy - aggregatedApy + pendleApy) * 100;

    const underlyingAsset = market.underlyingAsset?.split('-')[1];

    pools.push({
      pool: `${market.address}-penpie-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: market.name,
      tvlUsd,
      apyBase: apyBase > 0 ? apyBase : null,
      apyReward: apyReward > 0 ? apyReward : null,
      rewardTokens:
        apyReward > 0
          ? ['0x808507121b80c02388fad14726482e061b8da827', PNP]
          : [],
      underlyingTokens: underlyingAsset ? [underlyingAsset] : [],
      poolMeta: `Expires ${market.expiry?.split('T')[0] || 'unknown'}`,
      url: `https://www.pendle.magpiexyz.io/stake`,
    });
  }

  return pools;
};

const apy = async () => {
  const results = await Promise.all(
    Object.entries(PENDLE_STAKING).map(([chain, addr]) =>
      getPoolsForChain(chain, addr).catch((e) => {
        console.log(`penpie error on ${chain}: ${e.message}`);
        return [];
      })
    )
  );

  const pools = results.flat().filter((p) => utils.keepFinite(p));
  return addMerklRewardApy(pools, 'penpie', (p) => {
    // Extract pendle market address from pool ID (format: {market}-penpie-{chain})
    const parts = p.pool.split('-penpie-');
    return parts[0];
  });
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.pendle.magpiexyz.io/stake',
};
