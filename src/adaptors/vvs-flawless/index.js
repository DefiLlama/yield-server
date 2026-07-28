const { request, gql } = require('graphql-request');

const utils = require('../utils');

const SUBGRAPH =
  'https://graph-v2.cronoslabs.com/subgraphs/name/vvs/exchange-v3';
const chain = 'cronos';

const poolsQuery = gql`
  query poolsQuery($block: Int!) {
    pools(
      first: 1000
      orderBy: volumeUSD
      orderDirection: desc
      block: { number: $block }
    ) {
      id
      feeTier
      feeProtocol
      volumeUSD
      totalValueLockedToken0
      totalValueLockedToken1
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

const poolsPriorQuery = gql`
  query poolsPriorQuery($block: Int!) {
    pools(
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

// feeProtocol packs the protocol fee as two uniswap style denominators
// (token0 in the low nibble, token1 in the high nibble), share = 1/n, 0 = off.
// currently 0x44 -> the protocol keeps 1/4 of swap fees, LPs earn the rest
const lpFeeShare = (feeProtocol) => {
  const fp0 = feeProtocol % 16;
  const fp1 = feeProtocol >> 4;
  const lp0 = fp0 ? 1 - 1 / fp0 : 1;
  const lp1 = fp1 ? 1 - 1 / fp1 : 1;
  return (lp0 + lp1) / 2;
};

const main = async (timestamp = null) => {
  const ts =
    timestamp != null ? Number(timestamp) : Math.floor(Date.now() / 1000);
  const [[block, blockPrior], [blockPrior7d]] = await Promise.all([
    utils.getBlocks(chain, timestamp, [SUBGRAPH]),
    utils.getBlocksByTime([ts - 604800], chain),
  ]);

  const [dataNow, dataPrior, dataPrior7d] = await Promise.all([
    request(SUBGRAPH, poolsQuery, { block }),
    request(SUBGRAPH, poolsPriorQuery, { block: blockPrior }),
    request(SUBGRAPH, poolsPriorQuery, { block: blockPrior7d }),
  ]);

  // reprice reserves via the price api, subgraph derived usd values include
  // pools with junk pricing
  let pools = await utils.tvl(
    dataNow.pools.map((p) => ({
      ...p,
      reserve0: p.totalValueLockedToken0,
      reserve1: p.totalValueLockedToken1,
    })),
    chain
  );

  return pools
    .filter((p) => p.totalValueLockedUSD >= utils.MIN_TVL_USD)
    .map((p) =>
      utils.apy(
        {
          ...p,
          feeTierFull: Number(p.feeTier),
          feeTier: Number(p.feeTier) * lpFeeShare(Number(p.feeProtocol)),
        },
        dataPrior.pools,
        dataPrior7d.pools
      )
    )
    .map((p) => ({
      pool: p.id,
      chain: utils.formatChain(chain),
      project: 'vvs-flawless',
      poolMeta: `${p.feeTierFull / 1e4}%`,
      url: `https://vvs.finance/pool/${p.id}`,
      symbol: `${p.token0.symbol}-${p.token1.symbol}`,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      underlyingTokens: [p.token0.id, p.token1.id],
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    }))
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '3549',
  timetravel: false,
  apy: main,
  url: 'https://vvs.finance/earn/pools',
};
