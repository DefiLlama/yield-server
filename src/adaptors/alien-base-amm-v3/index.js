const sdk = require('@defillama/sdk4');
const { request, gql } = require('graphql-request');
const superagent = require('superagent');

const utils = require('../utils');
const { EstimatedFees } = require('./estimateFee');
const { getCakeAprs } = require('./cakeReward');
const { checkStablecoin } = require('../../handlers/triggerEnrichment');
const { boundaries } = require('../../utils/exclude');
const {getFeeFromVolume} = require('./getFees');

const v3abi = require('./uniswapv3.json');
const bunniLensV2Abi = require('./bunnilens.json');

const bunniLensAddress = '0x8fcd066d9507C02512972673d805a15Aa55031c2' //base only, for now
const masterChefAddress = '0x52eaecac2402633d98b95213d0b473e069d86590'

const baseUrl = 'https://api.thegraph.com/subgraphs/name';
const chains = {
  ethereum: `${baseUrl}/pancakeswap/exchange-v3-eth`,
  bsc: `${baseUrl}/pancakeswap/exchange-v3-bsc`,
  polygon_zkevm:
    'https://api.studio.thegraph.com/query/45376/exchange-v3-polygon-zkevm/version/latest',
  era: 'https://api.studio.thegraph.com/query/45376/exchange-v3-zksync/version/latest',
  arbitrum: `${baseUrl}/pancakeswap/exchange-v3-arb`,
};

const CAKE = {
  [utils.formatChain('ethereum')]: '0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898',
  [utils.formatChain('bsc')]: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
};

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      feeTier
      feeProtocol
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
    const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
      url,
    ]);

    const [_, blockPrior7d] = await utils.getBlocks(
      chainString,
      timestamp,
      [url],
      604800
    );

    // TODO: Change with actual query
    let queryC = query;
    let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
    console.log("dataNowPre", dataNow);
    dataNow = dataNow.poolDayDatas;

    console.log("dataNow", dataNow);
    
    //dataNow has an array of objects with tvl, volume, and pool data

    const poolsData = dataNow.map((poolData) => {
      return {
        address: poolData.id,
        token0: poolData.token0,
        token1: poolData.token1,
        feeTier: poolData.feeTier,
        volumeUSD1d: poolData.volumeUSD
      }
    })

    //queries onchain balance for the pools

    const balanceCalls = [];
    const infoCalls = []
    const bunniLensCalls = [];
    for (const pool of poolsData) {
      balanceCalls.push({
        target: pool.token0.id,
        params: pool.address,
      });
      balanceCalls.push({
        target: pool.token1.id,
        params: pool.address,
      });
      infoCalls.push({
        target: pool.address,
        params: []
      })
      bunniLensCalls.push({
        target: bunniLensAddress,
        params: pool.address
      })
    }

    const tokenBalances = await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: balanceCalls,
      chain: chainString,
      permitFailure: true,
    });

    const corePoolData = await sdk.api.abi.multiCall({
      abi: v3abi.find((m) => m.name === 'slot0'),
      calls: infoCalls,
      chain: chainString,
      permitFailure: true
    });

    const bunniVaultData = await sdk.api.abi.multiCall({
      abi: bunniLensV2Abi.find((m) => m.name === 'getBunniVaults'),
      calls: bunniLensCalls,
      chain: chainString,
      permitFailure: true
    })

    poolsData.map((poolData, index) => {
      return {
        ...poolData,
        liquidity: corePoolData[index].liquidity,
        feeProtocol: corePoolData[index].feeProtocol,
      } 
    })

    
    //bunniVaultData is an array of [pool][[bunniKeys][bunniTokens]]
    //now we need to query specific info about each bunni pool

    const bunniInfoCalls = [];
    for (const pool of bunniVaultData) {
      for(const key of pool) {
        bunniInfoCalls.push({
          target: bunniLensAddress,
          params: key,
        });
      }
    }

    const vaultDetails = await sdk.api.abi.multiCall({
      abi: bunniLensV2Abi.find((m) => m.name === 'pricePerShare'),
      calls: bunniInfoCalls,
      chain: chainString,
      permitFailure: true
    })

    const bunniTotalSupplyCalls = [];
    const bunniBalanceCalls = [];
    for (const pool of bunniVaultData) {
      for(const token of pool) {
        bunniTotalSupplyCalls.push({
          target: token,
          params: [],
        });
        bunniBalanceCalls.push({
          target: token,
          params: masterChefAddress,
        });
      }
    }

    const tokenSupplies = await sdk.api.abi.multiCall({
      abi: 'erc20:totalSupply',
      calls: bunniTotalSupplyCalls,
      chain: chainString,
      permitFailure: true,
    });

    const bunniStakedBalances = await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: bunniBalanceCalls,
      chain: chainString,
      permitFailure: true,
    });


    let totalCounter = 0;
    //assigns bunni vault objects to poolsData
    bunniVaultData.forEach((bunniVaults, index) => {
      
      poolsData[index].bunni = bunniVaults[0].map((vault, j) => {

        const result = {
          ...vault, //key info
          token: bunniVaults[1][j],
          totalSupply: tokenSupplies[totalCounter],
          stakedBalance: bunniStakedBalances[totalCounter],
          liquidity: vaultDetails[totalCounter].liquidity,
          amount0: vaultDetails[totalCounter].amount0,
          amount1: vaultDetails[totalCounter].amount1,
        }
        totalCounter++;
      });
    })

    console.log("poolData", poolData)

    dataNow = dataNow.map((p) => {
      const x = tokenBalances.output.filter((i) => i.input.params[0] === p.id);
      return {
        ...p,
        reserve0:
          x.find((i) => i.input.target === p.token0.id).output /
          `1e${p.token0.decimals}`,
        reserve1:
          x.find((i) => i.input.target === p.token1.id).output /
          `1e${p.token1.decimals}`,
      };
    });

    // pull 24h offset data to calculate fees from swap volume
    let queryPriorC = queryPrior;
    let dataPrior = await request(
      url,
      queryPriorC.replace('<PLACEHOLDER>', blockPrior)
    );
    dataPrior = dataPrior.pools;

    // calculate tvl
    dataNow = await utils.tvl(dataNow, chainString);

    
    // we have total pool tvl now
    // now we need to query onchain:
    // liquidity from V3 - check
    // bunniVaults for this pool - check
    // pricePerShare from bunniLens + totalSupply of bunniTokens -> get tvl of bunni - check
    // bunniTokens staked in MC - check
    // V3 protocol fee for these pools - check

    //for each bunni vault we need to get tvl, share of fees and alb apr
    //tvl we get by multiplying amount0 and 1 by its dollar values and bunni token total supply

    //calculate total fee amount
    //we assume that defillama takes care of the averaging of daily volumes and fees

    poolsData.map((poolData) => { 
      return {
        fees: getFeeFromVolume(poolData.volumeUSD1d, poolData.feeTier, poolData.protocolFee),
        ...poolData,
       }
    })

    

    

    // to reduce the nb of subgraph calls for tick range, we apply the lb db filter in here
    dataNow = dataNow.filter(
      (p) => p.totalValueLockedUSD >= boundaries.tvlUsdDB.lb
    );
    // add the symbol for the stablecoin (we need to distinguish btw stable and non stable pools
    // so we apply the correct tick range)
    dataNow = dataNow.map((p) => {
      const symbol = utils.formatSymbol(
        `${p.token0.symbol}-${p.token1.symbol}`
      );
      const stablecoin = checkStablecoin({ ...p, symbol }, stablecoins);
      return {
        ...p,
        symbol,
        stablecoin,
      };
    });

    // for new v3 apy calc
    const dataPrior7d = (
      await request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
    ).pools;

    // calc apy (note: old way of using 24h fees * 365 / tvl. keeping this for now) and will store the
    // new apy calc as a separate field
    dataNow = dataNow.map((el) =>
      utils.apy(el, dataPrior, dataPrior7d, version)
    );

    dataNow = dataNow.map((p) => ({
      ...p,
      token1_in_token0: p.price1 / p.price0,
    }));

    // split up subgraph tick calls into n-batches
    // (tick response can be in the thousands per pool)
    const skip = 20;
    let start = 0;
    let stop = skip;
    const pages = Math.floor(dataNow.length / skip);

    // tick range
    const pct = 0.3;
    const pctStablePool = 0.001;

    // assume an investment of 1e5 USD
    const investmentAmount = 1e5;
    let X = [];
    for (let i = 0; i <= pages; i++) {
      console.log(i);
      let promises = dataNow.slice(start, stop).map((p) => {
        const delta = p.stablecoin ? pctStablePool : pct;

        const priceAssumption = p.stablecoin ? 1 : p.token1_in_token0;

        return EstimatedFees(
          p.id,
          priceAssumption,
          [p.token1_in_token0 * (1 - delta), p.token1_in_token0 * (1 + delta)],
          p.price1,
          p.price0,
          investmentAmount,
          p.token0.decimals,
          p.token1.decimals,
          p.feeTier,
          url,
          p.volumeUSD7d,
          p.feeProtocol
        );
      });
      X.push(await Promise.all(promises));
      start += skip;
      stop += skip;
    }
    const d = {};
    X.flat().forEach((p) => {
      d[p.poolAddress] = p.estimatedFee;
    });

    dataNow = dataNow.map((p) => ({
      ...p,
      apy7d: ((d[p.id] * 52) / investmentAmount) * 100,
    }));


    return dataNow.map((p) => {
      const poolMeta = `${p.feeTier / 1e4}%`;
      const underlyingTokens = [p.token0.id, p.token1.id];
      const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
      const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
      const chain = chainString === 'ethereum' ? 'eth' : chainString;

      const feeTier = Number(poolMeta.replace('%', '')) * 10000;
      const url = `https://pancakeswap.finance/add/${token0}/${token1}/${feeTier}?chain=${chain}`;

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

//return [Pool, Pool, ...]
// interface Pool {
//   pool: string;
//   chain: string;
//   project: string;
//   symbol: string;
//   tvlUsd: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
//   apyBase?: number;
//   apyReward?: number;
//   rewardTokens?: Array<string>;
//   underlyingTokens?: Array<string>;
//   poolMeta?: string;
//   url?: string;
// }

// pool -> some kind of generalized fetcher
// but it needs to fetch bunni pools and keys, so i need to make a viewer smart contract of sorts
// chain -> const
// project -> const
// symbol -> fetched from pools/mapped from const
// tvlUsd -> bunniLens call with bunniToken.balanceOf(BDV2)
// apyBase -> same bunniLens call but with timewarp to 1 week back to get average
// apyReward -> standard albPerSec * allocPoint/totalAllocPoint * priceOfAlb + same thing for complexRewarders if any
// rewardTokens -> ALB + complexRewarder tokens
// underlyingTokens -> fetched from pool
// poolMeta -> bunniKey/params
// url -> addLiquidity url


const main = async (timestamp = null) => {
  const stablecoins = (
    await superagent.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).body.peggedAssets.map((s) => s.symbol.toLowerCase());
  if (!stablecoins.includes('eur')) stablecoins.push('eur');
  if (!stablecoins.includes('3crv')) stablecoins.push('3crv');

  const data = [];
  let cakeAPRsByChain = {};
  for (const [chain, url] of Object.entries(chains)) {
    cakeAPRsByChain[utils.formatChain(chain)] = await getCakeAprs(chain);
    console.log(chain);
    console.log('URL', url);
    console.log('query', query);
    console.log('timestamp', timestamp);
    data.push(
      await topLvl(chain, url, query, queryPrior, 'v3', timestamp, stablecoins)
    );
  }

  return data
    .flat()
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
            CAKE[p.chain] ?? '0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898',
          ],
        };
      }
      return p;
    });
};

module.exports = {
  timetravel: false,
  apy: main,
};
