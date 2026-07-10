const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const { EstimatedFees } = require('./estimateFee');
const { getCakeAprs, CAKE, chainIds } = require('./cakeReward');

const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    'CJYGNhb7RvnhfBDjqpRnD3oxgyhibzc7fkAMa38YV3oS'
  ),
  // temp disable bsc
  // bsc: sdk.graph.modifyEndpoint('Hv1GncLY5docZoGtXjo4kwbTvxm3MAhVZqBZE4sUT9eZ'),
  polygon_zkevm:
    'https://api.studio.thegraph.com/query/45376/exchange-v3-polygon-zkevm/version/latest',
  era: 'https://api.studio.thegraph.com/query/45376/exchange-v3-zksync/version/latest',
  arbitrum: sdk.graph.modifyEndpoint(
    '251MHFNN1rwjErXD2efWMpNS73SANZN8Ua192zw6iXve'
  ),
  op_bnb: 'https://proxy-worker-dev.pancake-swap.workers.dev/opbnb-exchange-v3',
  linea:
    'https://graph-query.linea.build/subgraphs/name/pancakeswap/exchange-v3-linea',
  base: sdk.graph.modifyEndpoint(
    'BHWNsedAHtmTCzXxCCDfhPmm6iN9rxUhoRHdHKyujic3'
  ),
};

const cakeByFormatChain = Object.keys(chains).reduce((acc, chain) => {
  acc[utils.formatChain(chain)] = CAKE[chain];
  return acc;
}, {});

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      feeTier
      feeProtocol
      liquidity
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

const queryPrior = gql`
  {
    pools( first: 1000 orderBy: totalValueLockedUSD orderDirection:desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
    }
  }
`;

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp,
  stablecoins
) => {
  try {
    const timestampForBlocks =
      timestamp != null ? Number(timestamp) : Math.floor(Date.now() / 1000);
    const [[block, blockPrior], [blockPrior7d]] = await Promise.all([
      utils.getBlocks(chainString, timestamp, [url]),
      utils.getBlocksByTime([timestampForBlocks - 604800], chainString),
    ]);

    // pull data
    let queryC = query;
    let queryPriorC = queryPrior;
    let [dataNow, dataPrior, dataPrior7d] = await Promise.all([
      request(url, queryC.replace('<PLACEHOLDER>', block)),
      request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior)),
      request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d)),
    ]);
    dataNow = dataNow.pools;
    dataPrior = dataPrior.pools;
    dataPrior7d = dataPrior7d.pools;

    const balanceCalls = dataNow.flatMap((pool) => [
      { target: pool.token0.id, params: pool.id },
      { target: pool.token1.id, params: pool.id },
    ]);

    const tokenBalances = await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: balanceCalls,
      chain: chainString,
      permitFailure: true,
    });

    const balancesByPool = tokenBalances.output.reduce(
      (acc, { input, output }) => {
        const poolId = input.params[0];
        if (!acc[poolId]) acc[poolId] = {};
        acc[poolId][input.target.toLowerCase()] = output ?? '0';
        return acc;
      },
      {}
    );

    dataNow = dataNow.map((pool) => {
      const poolBalances = balancesByPool[pool.id] || {};
      const reserve0Raw = poolBalances[pool.token0.id.toLowerCase()];
      const reserve1Raw = poolBalances[pool.token1.id.toLowerCase()];

      const reserve0 = reserve0Raw
        ? Number(reserve0Raw) / 10 ** Number(pool.token0.decimals)
        : Number(pool.totalValueLockedToken0);
      const reserve1 = reserve1Raw
        ? Number(reserve1Raw) / 10 ** Number(pool.token1.decimals)
        : Number(pool.totalValueLockedToken1);

      return {
        ...pool,
        reserve0,
        reserve1,
      };
    });

    // calculate tvl
    dataNow = await utils.tvl(dataNow, chainString);

    // to reduce the nb of subgraph calls for tick range, we apply the lb db filter in here
    dataNow = dataNow.filter(
      (p) => p.totalValueLockedUSD >= utils.MIN_TVL_USD
    );
    // add the symbol for the stablecoin (we need to distinguish btw stable and non stable pools
    // so we apply the correct tick range)
    dataNow = dataNow.map((p) => {
      const symbol = `${p.token0.symbol}-${p.token1.symbol}`;
      const stablecoin = utils.checkStablecoin(
        { ...p, symbol: utils.formatSymbol(symbol) },
        stablecoins
      );
      return {
        ...p,
        symbol,
        stablecoin,
      };
    });

    // calc apy (note: old way of using 24h fees * 365 / tvl. keeping this for now) and will store the
    // new apy calc as a separate field
    dataNow = dataNow.map((el) =>
      utils.apy(el, dataPrior, dataPrior7d, version)
    );

    const enableV3Apy = true;
    if (enableV3Apy && dataNow.length) {
      dataNow = dataNow.map((p) => ({
        ...p,
        token1_in_token0: p.price1 / p.price0,
      }));

      // assume an investment of 1e5 USD
      const investmentAmount = 1e5;

      // tick range
      const pct = 0.3;
      const pctStablePool = 0.001;

      dataNow = dataNow.map((p) => {
        if (!p.liquidity) {
          console.log(`No pool liquidity found for ${p.id}`);
          return { ...p, estimatedFee: null, apy7d: null };
        }

        const delta = p.stablecoin ? pctStablePool : pct;

        const priceAssumption = p.stablecoin ? 1 : p.token1_in_token0;

        const estimatedFee = EstimatedFees(
          priceAssumption,
          [p.token1_in_token0 * (1 - delta), p.token1_in_token0 * (1 + delta)],
          p.price1,
          p.price0,
          investmentAmount,
          p.token0.decimals,
          p.token1.decimals,
          p.feeTier,
          p.volumeUSD7d,
          p.feeProtocol,
          p.liquidity
        );

        const apy7d = ((estimatedFee * 52) / investmentAmount) * 100;

        return { ...p, estimatedFee, apy7d };
      });
    }

    return dataNow.map((p) => {
      const poolMeta = `${p.feeTier / 1e4}%`;
      const underlyingTokens = [p.token0.id, p.token1.id];
      const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
      const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];

      const chainId = chainIds[chainString].id;

      const feeTier = Number(poolMeta.replace('%', '')) * 10000;
      const url = `https://pancakeswap.finance/add/${token0}/${token1}/${feeTier}?chainId=${chainId}`;

      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'pancakeswap-amm-v3',
        poolMeta: poolMeta,
        symbol: p.symbol,
        tvlUsd: p.totalValueLockedUSD,
        apyBase: p.apy1d,
        apyBase7d: p.apy7d,
        underlyingTokens,
        url,
        volumeUsd1d: p.volumeUSD1d,
        volumeUsd7d: p.volumeUSD7d,
      };
    });
  } catch (e) {
    if (e.message.includes('Stale subgraph')) return [];
    else throw e;
  }
};

const main = async (timestamp = null) => {
  const stablecoins = (
    await axios.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).data.peggedAssets.map((s) => s.symbol.toLowerCase());
  if (!stablecoins.includes('eur')) stablecoins.push('eur');
  if (!stablecoins.includes('3crv')) stablecoins.push('3crv');

  let cakeAPRsByChain = {};
  const data = (
    await Promise.all(
      Object.entries(chains).map(async ([chain, url]) => {
        console.log(chain);
        try {
          // cakeAPRsByChain[utils.formatChain(chain)] = await getCakeAprs(chain);

          return await topLvl(
            chain,
            url,
            query,
            queryPrior,
            'v3',
            timestamp,
            stablecoins
          );
        } catch (err) {
          console.log(err);
          return [];
        }
      })
    )
  ).flat();

  const pools = data
    .filter((p) => utils.keepFinite(p))
    .map((p) => {
      if (
        cakeAPRsByChain[p.chain] &&
        cakeAPRsByChain[p.chain] &&
        cakeAPRsByChain[p.chain][p.pool]
      ) {
        return {
          ...p,
          apyReward: cakeAPRsByChain[p.chain][p.pool],
          rewardTokens: [
            cakeByFormatChain[p.chain] ??
              '0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898',
          ],
        };
      }
      return p;
    });

  return addMerklRewardApy(pools, 'pancake-swap');
};

module.exports = {
  protocolId: '2769',
  timetravel: false,
  apy: main,
};
