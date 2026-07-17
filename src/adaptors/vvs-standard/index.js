const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

// V1 Craftsman: custodies all farm LP tokens, but its own VVS emissions to
// LP farms have ended (totalAllocPoint is fully redirected away from LP pools)
const CRAFTSMAN = '0xDccd6455AE04b03d785F12196B492b18129564bc';
// CraftsmanV2 wrapper: users stake current farms through it; it owns the
// V1 Craftsman positions and distributes the (third party) rewarder incentives
const CRAFTSMAN_V2 = '0xbc149c62EFe8AFC61728fC58b1b66a0661712e76';
const VVS = '0x2d03bece6747adc00e1a131bba1469c15fd11e03';

const FARMS_API = 'https://api.vvs.finance/general/api/v1/farms';
const FARM_APRS_API = 'https://api.vvs.finance/general/api/info/v1/farm-aprs';
const SUBGRAPH = 'https://graph-v2.cronoslabs.com/subgraphs/name/vvs/exchange';

const userInfoAbi = {
  inputs: [
    { internalType: 'uint256', name: '', type: 'uint256' },
    { internalType: 'address', name: '', type: 'address' },
  ],
  name: 'userInfo',
  outputs: [
    { internalType: 'uint256', name: 'amount', type: 'uint256' },
    { internalType: 'uint256', name: 'rewardDebt', type: 'uint256' },
  ],
  stateMutability: 'view',
  type: 'function',
};

const balanceOfAbi = 'erc20:balanceOf';

const pairsQuery = gql`
  query pairsQuery($ids: [ID!]) {
    pairs(where: { id_in: $ids }) {
      id
      name
      reserveUSD
      totalSupply
      token0 {
        id
      }
      token1 {
        id
      }
    }
  }
`;

// 0.3% swap fee of which 0.2% goes to LPs (0.1% is protocol revenue)
const LP_FEE_TIER = 2000;

const allPairsQuery = gql`
  query allPairsQuery($block: Int!) {
    pairs(
      first: 1000
      orderBy: volumeUSD
      orderDirection: desc
      block: { number: $block }
    ) {
      id
      name
      volumeUSD
      reserve0
      reserve1
      token0 {
        symbol
        id
        decimals
      }
      token1 {
        symbol
        id
        decimals
      }
    }
  }
`;

const allPairsPriorQuery = gql`
  query allPairsPriorQuery($block: Int!) {
    pairs(
      first: 1000
      orderBy: volumeUSD
      orderDirection: desc
      block: { number: $block }
    ) {
      id
      volumeUSD
    }
  }
`;

// fee apy for every pair with real tvl, not just the ones with an active farm
const pairPools = async (timestamp, farmLps) => {
  const ts =
    timestamp != null ? Number(timestamp) : Math.floor(Date.now() / 1000);
  const [[block, blockPrior], [blockPrior7d]] = await Promise.all([
    utils.getBlocks('cronos', timestamp, [SUBGRAPH]),
    utils.getBlocksByTime([ts - 604800], 'cronos'),
  ]);

  const [dataNow, dataPrior, dataPrior7d] = await Promise.all([
    request(SUBGRAPH, allPairsQuery, { block }),
    request(SUBGRAPH, allPairsPriorQuery, { block: blockPrior }),
    request(SUBGRAPH, allPairsPriorQuery, { block: blockPrior7d }),
  ]);

  // reprice reserves via the price api, subgraph derived usd values include
  // pairs with junk pricing
  let pairs = await utils.tvl(dataNow.pairs, 'cronos');

  return pairs
    .filter((p) => p.totalValueLockedUSD >= utils.MIN_TVL_USD)
    .filter((p) => !farmLps.has(p.id.toLowerCase()))
    .map((p) =>
      utils.apy(
        { ...p, feeTier: LP_FEE_TIER },
        dataPrior.pairs,
        dataPrior7d.pairs
      )
    )
    .map((p) => ({
      pool: p.id,
      chain: utils.formatChain('cronos'),
      project: 'vvs-standard',
      symbol: p.name,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      underlyingTokens: [p.token0.id, p.token1.id],
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    }));
};

const farmPools = async () => {
  const [farms, farmAprs] = await Promise.all([
    utils.getData(FARMS_API),
    utils.getData(FARM_APRS_API),
  ]);

  const activeFarms = farms.filter(
    (farm) => farm.chainId === 25 && !farm.isFinished
  );
  if (activeFarms.length === 0) return [];

  const aprByLp = Object.fromEntries(
    (farmAprs?.data ?? []).map((apr) => [apr.address.toLowerCase(), apr])
  );

  const lpAddresses = activeFarms.map((farm) => farm.lpAddress.toLowerCase());
  const { pairs } = await request(SUBGRAPH, pairsQuery, { ids: lpAddresses });
  const pairByLp = Object.fromEntries(pairs.map((pair) => [pair.id, pair]));

  // current (V2) farms are staked through the CraftsmanV2 wrapper, which owns
  // the whole V1 Craftsman position of a pool -> its userInfo amount is the
  // total staked in the farm. Legacy V1 farms hold user LP in V1 directly.
  const [wrapperStakes, craftsmanBalances] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: activeFarms.map((farm) => ({
        target: CRAFTSMAN,
        params: [farm.pid, CRAFTSMAN_V2],
      })),
      abi: userInfoAbi,
      chain: 'cronos',
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: activeFarms.map((farm) => ({
        target: farm.lpAddress,
        params: [CRAFTSMAN],
      })),
      abi: balanceOfAbi,
      chain: 'cronos',
      permitFailure: true,
    }),
  ]);

  const pools = activeFarms.map((farm, i) => {
    const pair = pairByLp[farm.lpAddress.toLowerCase()];
    const aprInfo = aprByLp[farm.lpAddress.toLowerCase()];
    const staked =
      farm.version === 'V2'
        ? wrapperStakes.output?.[i]?.output?.amount
        : craftsmanBalances.output?.[i]?.output;
    if (!pair || !aprInfo || !staked) return null;

    const tvlUsd =
      Number(pair.totalSupply) > 0
        ? Number(pair.reserveUSD) *
          (Number(staked) / 1e18 / Number(pair.totalSupply))
        : 0;

    const activeRewarders = (aprInfo.rewarders ?? []).filter(
      (rewarder) => rewarder.apr > 0
    );
    const apyReward =
      (aprInfo.emissionApr ?? 0) +
      activeRewarders.reduce((acc, rewarder) => acc + rewarder.apr, 0);

    const rewardTokens = [
      ...(aprInfo.emissionApr > 0 ? [VVS] : []),
      ...activeRewarders.map((rewarder) => rewarder.tokenAddress),
    ];

    return {
      pool: pair.id,
      chain: utils.formatChain('cronos'),
      project: 'vvs-standard',
      symbol: pair.name,
      tvlUsd,
      apyBase: aprInfo.lpApr ?? 0,
      apyReward,
      underlyingTokens: [pair.token0.id, pair.token1.id],
      rewardTokens,
    };
  });

  return pools.filter(Boolean);
};

const main = async (timestamp = null) => {
  const farms = await farmPools();
  const farmLps = new Set(farms.map((p) => p.pool.toLowerCase()));
  const pairs = await pairPools(timestamp, farmLps);

  return [...farms, ...pairs].filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '831',
  timetravel: false,
  apy: main,
  url: 'https://vvs.finance/earn/pools',
};
