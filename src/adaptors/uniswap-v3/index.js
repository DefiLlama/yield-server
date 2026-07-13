const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');
const { EstimatedFees } = require('./estimateFee.ts');
const getOnchainPools = require('./onchain');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV'
  ),
  polygon: sdk.graph.modifyEndpoint(
    '3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm'
  ),
  arbitrum: sdk.graph.modifyEndpoint(
    'FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM'
  ),
  optimism: sdk.graph.modifyEndpoint(
    '7SVwgBfXoWmiK6x1NF1VEo1szkeWLniqWN1oYsX3UMb5'
  ),
  celo: sdk.graph.modifyEndpoint(
    '5GMxLtvwbfKxyCpSgHvS8FbeofS2ry9K76NL9RCzPNm2'
  ),
  avax: sdk.graph.modifyEndpoint(
    'GVH9h9KZ9CqheUEL93qMbq7QwgoBu32QXQDPR6bev4Eo'
  ),
  bsc: sdk.graph.modifyEndpoint('GcKPSgHoY42xNYVAkSPDhXSzi6aJDRQSKqBSXezL47gV'),
  base: sdk.graph.modifyEndpoint(
    'HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1'
  ),
};

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      volumeToken0
      volumeToken1
      feeTier
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
      volumeToken0
      volumeToken1
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

    // uni v3 subgraph reserves values are wrong!
    // instead of relying on subgraph values, gonna pull reserve data from contracts
    // new tvl calc
    // let
    if (chainString === 'base') {
      const excludeTokens = [
        '0xb50721bcf8d664c30412cfbc6cf7a15145234ad1',
        '0x4d224452801aced8b2f0aebe155379bb5d594381',
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        '0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7',
        '0x4701f80124f5ebf6846a43929b22a917bc30b2ca',
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ];
      dataNow = dataNow.filter(
        (p) =>
          !excludeTokens.some((i) => i === p.token0.id || i === p.token1.id)
      );
    }

    const balanceCalls = [];
    for (const pool of dataNow) {
      balanceCalls.push({
        target: pool.token0.id,
        params: pool.id,
      });
      balanceCalls.push({
        target: pool.token1.id,
        params: pool.id,
      });
    }

    const tokenBalances = await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: balanceCalls,
      chain: chainString,
      permitFailure: true,
    });

    const balancesByPool = tokenBalances.output.reduce((acc, item) => {
      const poolId = item.input.params[0];
      if (!acc[poolId]) acc[poolId] = {};
      acc[poolId][item.input.target.toLowerCase()] = item.output;
      return acc;
    }, {});

    dataNow = dataNow.map((p) => {
      const balances = balancesByPool[p.id];
      return {
        ...p,
        reserve0:
          balances[p.token0.id.toLowerCase()] /
          `1e${p.token0.decimals}`,
        reserve1:
          balances[p.token1.id.toLowerCase()] /
          `1e${p.token1.decimals}`,
      };
    });

    // balance calls not working on the uni v3 avax contracts
    if (chainString === 'avax') {
      dataNow = dataNow.map((p) => ({
        ...p,
        reserve0: Number(p.totalValueLockedToken0),
        reserve1: Number(p.totalValueLockedToken1),
      }));
    }

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
    // note re arbitrum: their subgraph is outdated (no tick data -> no uni v3 style apy calc)
    dataNow = dataNow.map((el) =>
      utils.apy(el, dataPrior, dataPrior7d, version)
    );

    const enableV3Apy = true;
    if (enableV3Apy && chainString !== 'arbitrum') {
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
      const chain = chainString === 'ethereum' ? 'mainnet' : chainString;

      const feeTier = Number(poolMeta.replace('%', '')) * 10000;
      const url = `https://app.uniswap.org/positions/create/v3?currencyA=${token0}&currencyB=${token1}&chain=${chain}&fee={"feeAmount":${feeTier}}`;

      let symbol = p.symbol;
      if (
        chainString === 'arbitrum' &&
        underlyingTokens
          .map((t) => t.toLowerCase())
          .includes('0xff970a61a04b1ca14834a43f5de4533ebddb5cc8')
      ) {
        symbol = p.symbol.replace('USDC', 'USDC.e');
      }
      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'uniswap-v3',
        poolMeta,
        symbol,
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
    console.log(chainString, e);
    return [];
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

  const dataPromise = Promise.all(
    Object.entries(chains).map(([chain, url]) => {
      console.log(chain);
      return topLvl(
        chain,
        url,
        query,
        queryPrior,
        'v3',
        timestamp,
        stablecoins
      );
    })
  );
  const [data, onchainPools] = await Promise.all([dataPromise, getOnchainPools()]);
  data.push(onchainPools);

  const pools = await addMerklRewardApy(
    data
      .flat()
      .filter(
        (p) =>
          utils.keepFinite(p) &&
          ![
            '0x0c6d9d0f82ed2e0b86c4d3e9a9febf95415d1b76',
            '0xc809d13e9ea08f296d3b32d4c69d46ff90f73fd8',
          ].includes(p.pool)
      )
      .filter((p) => !(p.tvlUsd > 1e7 && p.volumeUsd1d < 10)),
    'uniswap'
  );
  return pools;
};

module.exports = {
  protocolId: '2198',
  timetravel: false,
  apy: main,
};
