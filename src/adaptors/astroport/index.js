const axios = require('axios');
const num = require('bignumber.js');

const chainIdToNames = {
  'phoenix-1': 'Terra2',
  'injective-1': 'Injective',
  'neutron-1': 'Neutron',
  'pacific-1': 'Sei',
};

const NEUTRON_TOKEN_MAP = {
  'ibc/B559A80D62249C8AA07A380E2A2BEA6E5CA9A6F079C912C3A9E9B494105E4F81': 'coingecko:usd-coin',
  'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9': 'coingecko:cosmos',
  'ibc/2CB87BCE0937B1D1DFCEE79BE4501AAF3C265E923509AEAC410AD85D27F35130': 'coingecko:dydx-chain',
  'ibc/0E293A7622DC9A6439DB60E6D234B5AF446962E27CA3AB44D0590603DFF6968E': 'coingecko:wrapped-bitcoin',
  'ibc/773B4D0A3CD667B2275D5A4A7A2F0909C0BA0F4059C0B9181E680DDF4965DCC7': 'coingecko:celestia',
  'ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349': 'coingecko:axlusdc',
  'factory/neutron17sp75wng9vl2hu3sf4ky86d7smmk3wle9gkts2gmedn9x4ut3xcqa5xp34/maxbtc': 'coingecko:maxbtc',
  'factory/neutron1k6hr0f83e7un2wjf29cspk7j69jrnskk65k3ek2nj9dztrlzpj6q00rtsa/udatom': 'coingecko:drop-staked-atom',
  'factory/neutron1frc0p5czd9uaaymdkug2njz7dc7j65jxukp9apmt9260a8egujkspms2t2/udntrn':'coingecko:drop-staked-ntrn',
  'untrn': 'coingecko:neutron-3',
};
const resolveNeutronToken = (addr) => NEUTRON_TOKEN_MAP[addr] || addr;

const astroDenoms = {
  'phoenix-1':
    'terra1nsuqsk6kh58ulczatwev87ttq2z6r3pusulg9r24mfj2fvtzd4uq3exn26',
  'injective-1':
    'ibc/EBD5A24C554198EBAF44979C5B4D2C2D312E6EBAB71962C92F735499C7575839',
  'neutron-1':
    'ibc/5751B8BCDA688FD0A8EC0B292EEF1CDEAB4B766B63EC632778B196D317C40C3A',
  'pacific-1':
    'ibc/0EC78B75D318EA0AAB6160A12AEE8F3C7FEA3CFEAD001A3B103E11914709F4CE',
};

// ASTRO is emitted as a native factory denom but tracked under its IBC denom
const getRewardTokens = (pool) => {
  const rewardTokens = (pool.rewards ?? [])
    .filter((reward) => reward.yield > 0)
    .map((reward) =>
      reward.symbol === 'ASTRO' ? astroDenoms[pool.chainId] : reward.denom
    );
  return rewardTokens.length > 0 ? [...new Set(rewardTokens)] : undefined;
};

const apy = async () => {
  const results = (await axios.get('https://api.astroport.fi/api/pools')).data;

  return results
    .filter(
      (pool) =>
        !pool.isDeregistered &&
        pool.totalLiquidityUSD > 10000 &&
        chainIdToNames[pool.chainId]
    )
    .map((pool) => {
      const chain = chainIdToNames[pool.chainId];
      const apyBase = new num(pool.yield?.poolFees || 0)
        .times(100)
        .dp(6)
        .toNumber();
      const apyReward = new num(pool.yield?.astro || 0)
        .plus(pool.yield?.externalRewards || 0)
        .times(100)
        .dp(6)
        .toNumber();

      return {
        pool: `${pool.poolAddress}-${chain}`.toLowerCase(),
        project: 'astroport',
        chain,
        symbol: `${pool.assets[0].symbol}-${pool.assets[1].symbol}`,
        tvlUsd: pool.totalLiquidityUSD || 0,
        apyBase,
        apyReward,
        rewardTokens: getRewardTokens(pool) ?? null,
        underlyingTokens: [
          resolveNeutronToken(pool.assets[0].denom),
          resolveNeutronToken(pool.assets[1].denom),
        ],
        url: `https://app.astroport.fi/pools/${pool.poolAddress}/provide`,
      };
    });
};

module.exports = {
  protocolId: '3117',
  apy,
  timetravel: false,
  url: 'https://app.astroport.fi/pools/',
};
