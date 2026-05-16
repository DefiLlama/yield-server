// Mezo Earn yield mechanics: https://mezo.org/blog/introducing-mezo-earn
// - veBTC: passive BTC chain fees (apyBase) + max-TVL gauge voting yield (apyReward).
// - veMEZO: weekly MEZO emission rebases (apyBase). The boost-market incentives
//   from BTC holders attracting veMEZO votes are part of the design but not yet
//   exposed via the API, so apyReward is omitted until that data is available.

const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'mezo';
const API_BASE = 'https://api.mezo.org';
const API_ORIGIN = 'https://mezo.org';
const VOTING_APR_SCALE = 100;

const BTC = '0x7b7C000000000000000000000000000000000000';
const MEZO = '0x7B7c000000000000000000000000000000000001';
const MUSD = '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186';

const VE_BTC_REWARD_TOKENS = [MUSD];

const VE_BTC = '0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279';
const VE_MEZO = '0xb90fdAd3DFD180458D62Cc6acedc983D78E20122';

const VE_BTC_DISTRIBUTOR = '0xb58477e074265BdC7F7ca6100eD0f7De264F74A2';
const VE_MEZO_DISTRIBUTOR = '0x075108f275ed81c9cfc01065e6e50ceea81d6363';

const MUSD_VAULT = '0xb4D498029af77680cD1eF828b967f010d06C51CC';
const MUSD_VAULT_STRATEGY = '0x0C0944713c185ea3e64F5609ECee3fB3C054a295';

const TOKEN_DECIMALS = 18;
const WEEK = 604800;
const WEEKS_PER_YEAR = 52;

const supplyAbi = {
  inputs: [],
  name: 'supply',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const lastTokenTimeAbi = {
  inputs: [],
  name: 'lastTokenTime',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const tokensPerWeekAbi = {
  inputs: [{ type: 'uint256' }],
  name: 'tokensPerWeek',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const weiToNumber = (wei) => Number(wei) / 10 ** TOKEN_DECIMALS;

const fetchMezo = (path) =>
  axios
    .get(`${API_BASE}${path}`, {
      headers: { Origin: API_ORIGIN, Referer: `${API_ORIGIN}/` },
    })
    .then((r) => r.data?.data ?? []);

const getMusdVaultTvlUsd = async (musdPrice) => {
  const [vaultBalRes, strategyBalRes] = await Promise.all([
    sdk.api.erc20.balanceOf({ target: MUSD, owner: MUSD_VAULT, chain: CHAIN }),
    sdk.api.erc20.balanceOf({
      target: MUSD,
      owner: MUSD_VAULT_STRATEGY,
      chain: CHAIN,
    }),
  ]);
  const total = BigInt(vaultBalRes.output) + BigInt(strategyBalRes.output);
  return weiToNumber(total) * musdPrice;
};

const fetchTopGaugeVotingApr = async (musdPrice) => {
  try {
    const [votables, pools, musdVaultTvl] = await Promise.all([
      fetchMezo('/votes/votables'),
      fetchMezo('/pools'),
      getMusdVaultTvlUsd(musdPrice),
    ]);

    const poolTvlByAddress = new Map(
      pools.map((p) => [p.address.toLowerCase(), Number(p.tvl)])
    );

    const top = votables.reduce(
      (best, g) => {
        const targetId = g.target?.id?.toLowerCase();
        const targetType = g.target?.type;
        let tvl = 0;
        if (targetType === 'pool') {
          tvl = poolTvlByAddress.get(targetId) ?? 0;
        } else if (
          targetType === 'vault' &&
          targetId === MUSD_VAULT.toLowerCase()
        ) {
          tvl = musdVaultTvl;
        }
        return tvl > best.tvl
          ? { tvl, apr: Number(g.stats?.votingApr ?? 0) }
          : best;
      },
      { tvl: 0, apr: 0 }
    );
    return top.apr / VOTING_APR_SCALE;
  } catch {
    return null;
  }
};

const buildPool = async ({
  veAddress,
  distributor,
  underlying,
  symbol,
  poolMeta,
  price,
  apyReward = null,
  rewardTokens = null,
}) => {
  const [supplyRes, lastTokenTimeRes] = await Promise.all([
    sdk.api.abi.call({ target: veAddress, abi: supplyAbi, chain: CHAIN }),
    sdk.api.abi.call({
      target: distributor,
      abi: lastTokenTimeAbi,
      chain: CHAIN,
    }),
  ]);

  const supplyWei = BigInt(supplyRes.output);
  const lastTokenTime = Number(lastTokenTimeRes.output);
  const prevWeekTs = Math.floor(lastTokenTime / WEEK) * WEEK - WEEK;

  const tokensPerWeekRes = await sdk.api.abi.call({
    target: distributor,
    abi: tokensPerWeekAbi,
    params: [prevWeekTs],
    chain: CHAIN,
  });
  const weeklyEmissionWei = BigInt(tokensPerWeekRes.output);

  const apyBase =
    supplyWei > 0n
      ? (Number((weeklyEmissionWei * 10n ** 18n) / supplyWei) / 1e18) *
        WEEKS_PER_YEAR *
        100
      : null;

  const tvlUsd = weiToNumber(supplyWei) * price;

  return {
    pool: `${veAddress.toLowerCase()}-${CHAIN}`,
    chain: utils.formatChain(CHAIN),
    project: 'mezo-earn',
    symbol,
    poolMeta,
    tvlUsd,
    apyBase,
    apyReward,
    rewardTokens,
    underlyingTokens: [underlying],
  };
};

const getApy = async () => {
  const priceData = await utils.getPrices([BTC, MEZO, MUSD], CHAIN);
  const btcPrice = priceData.pricesByAddress[BTC.toLowerCase()] ?? 0;
  const mezoPrice = priceData.pricesByAddress[MEZO.toLowerCase()] ?? 0;
  const musdPrice = priceData.pricesByAddress[MUSD.toLowerCase()] ?? 1;

  const topGaugeApr = await fetchTopGaugeVotingApr(musdPrice);

  const pools = await Promise.all([
    buildPool({
      veAddress: VE_BTC,
      distributor: VE_BTC_DISTRIBUTOR,
      underlying: BTC,
      symbol: 'BTC',
      poolMeta: 'Locked veBTC',
      price: btcPrice,
      apyReward: topGaugeApr,
      rewardTokens: VE_BTC_REWARD_TOKENS,
    }),
    buildPool({
      veAddress: VE_MEZO,
      distributor: VE_MEZO_DISTRIBUTOR,
      underlying: MEZO,
      symbol: 'MEZO',
      poolMeta: 'Locked veMEZO',
      price: mezoPrice,
    }),
  ]);

  return pools.filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://mezo.org/earn/lock',
};
