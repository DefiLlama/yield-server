const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'equilibria';

// PendleProxy contract per chain — holds LP tokens on behalf of Equilibria depositors
const PENDLE_PROXY = {
  ethereum: '0x64627901dAdb46eD7f275fD4FC87d086cfF1e6E3',
};

// EQB reward token
const EQB = '0xfE80D611c6403f70e5B1b9B722D2B3510B740B2B';

const PENDLE_API_BASE = 'https://api-v2.pendle.finance/core/v1';

const getPoolsForChain = async (chain, pendleProxyAddr) => {
  const chainId = { ethereum: 1, arbitrum: 42161, optimism: 10, base: 8453 }[
    chain
  ];
  if (!chainId) return [];

  const { data } = await axios.get(
    `${PENDLE_API_BASE}/${chainId}/markets/active`
  );
  const markets = data.markets || [];

  const marketAddresses = markets.map((m) => m.address);

  const [balances, totalSupplies] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: marketAddresses.map((m) => ({
        target: m,
        params: [pendleProxyAddr],
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

    if (tvlUsd < 1000) continue;

    const aggregatedApy = market.details?.aggregatedApy || 0;
    const maxBoostedApy = market.details?.maxBoostedApy || 0;
    const pendleApy = market.details?.pendleApy || 0;

    const apyBase = (aggregatedApy - pendleApy) * 100;
    const apyReward = (maxBoostedApy - aggregatedApy + pendleApy) * 100;

    const underlyingAsset = market.underlyingAsset?.split('-')[1];

    pools.push({
      pool: `${market.address}-equilibria-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: market.name,
      tvlUsd,
      apyBase: apyBase > 0 ? apyBase : null,
      apyReward: apyReward > 0 ? apyReward : null,
      rewardTokens:
        apyReward > 0
          ? ['0x808507121b80c02388fad14726482e061b8da827', EQB]
          : [],
      underlyingTokens: underlyingAsset ? [underlyingAsset] : [],
      poolMeta: `Expires ${market.expiry?.split('T')[0] || 'unknown'}`,
      url: 'https://equilibria.fi/home',
    });
  }

  return pools;
};

const apy = async () => {
  const results = await Promise.all(
    Object.entries(PENDLE_PROXY).map(([chain, addr]) =>
      getPoolsForChain(chain, addr).catch((e) => {
        console.log(`equilibria error on ${chain}: ${e.message}`);
        return [];
      })
    )
  );

  const pools = results.flat().filter((p) => utils.keepFinite(p));
  return addMerklRewardApy(pools, 'equilibria', (p) => {
    const parts = p.pool.split('-equilibria-');
    return parts[0];
  });
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://equilibria.fi/home',
};
