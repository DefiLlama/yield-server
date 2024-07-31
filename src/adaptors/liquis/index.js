const sdk = require('@defillama/sdk');
const utils = require('../utils');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');

const hub = '0xb5087f95643a9a4069471a28d32c569d9bd57fe4';
const lens = '0xb73f303472c4fd4ff3b9f59ce0f9b13e47fbfd19';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const bal = '0xba100000625a3754423978a60c9317c58a424e3D';

const rewardPool = {
  ethereum: '0x7Ea6930a9487ce8d039f7cC89432435E6D5AcB23',
};

const lit80weth20 = {
  ethereum: '0x9232a548DD9E81BaC65500b5e0d918F8Ba93675C',
};

const voterProxy = {
  ethereum: '0x37aeB332D6E57112f1BFE36923a7ee670Ee9278b',
};

const viewHelper = {
  ethereum: '0xD58dd6deF2d0e8E16ffc537c7f269719e19b9fE4',
};

const booster = {
  ethereum: '0x631e58246A88c3957763e1469cb52f93BC1dDCF2',
};

const admin = {
  ethereum: '0x4cc39af0d46b0f66fd33778c6629a696bdc310a0',
};

const controller = {
  ethereum: '0x901c8aa6a61f74ac95e7f397e22a0ac7c1242218',
};

const lit = {
  ethereum: '0xfd0205066521550D7d7AB19DA8F72bb004b4C341',
};

const liq = {
  ethereum: '0xD82fd4D6D62f89A1E50b1db69AD19932314aa408',
};

const veLit = {
  ethereum: '0xf17d23136B4FeAd139f54fB766c8795faae09660',
};

const liqLIT = {
  ethereum: '0x03C6F0Ca0363652398abfb08d154F114e61c4Ad8',
};

const olit = {
  ethereum: '0x627fee87d0d9d2c55098a06ac805db8f98b158aa',
};

const oracle = {
  ethereum: '0x9d43ccb1ad7e0081cc8a8f1fd54d16e54a637e30',
};

const balVirtualPool = {
  ethereum: '0x85C0DB72927cf20896ED1332a14C4e2818C1ebA9',
};

const wethVirtualPool = {
  ethereum: '0x271B96395f53fb14cDD41C654ef15e83DE57dEDf',
};

const litLiqStaker = {
  ethereum: '0x7Ea6930a9487ce8d039f7cC89432435E6D5AcB23',
};

const hubABI = require('./abis/BunniHub.json');
const lensABI = require('./abis/BunniLens.json');
const adminABI = require('./abis/TokenAdmin.json');
const gaugeABI = require('./abis/LiquidityGauge.json');
const controllerABI = require('./abis/GaugeController.json');
const oracleABI = require('./abis/OptionsOracle.json');
const boosterABI = require('./abis/Booster.json');
const viewHelperABI = require('./abis/ViewHelper.json');
const virtualPoolABI = require('./abis/VirtualPool.json');
const balancerTokenABI = require('./abis/BalancerToken.json');
const vaultABI = require('./abis/Vault.json');
const { default: bunni } = require('../bunni');

const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    'HH4HFj4rFnm5qnkb8MbEdP2V5eD9rZnLJE921YQAs7AV'
  ),
};

const query = gql`
    {
        bunniTokens(first: 1000, block: {number: <PLACEHOLDER>}) {
            address
            liquidity
            pool {
                fee
                tick
                liquidity
                totalFeesToken0
                totalFeesToken1
                totalVolumeToken0
                totalVolumeToken1
            }
        }
    }
`;

const queryPrior = gql`
    {
        pools(first: 1000, block: {number: <PLACEHOLDER>}) {
            address
            totalFeesToken0
            totalFeesToken1
            totalVolumeToken0
            totalVolumeToken1
        }
    }
`;

const apy = (apr, num_periods) => {
  const periodic_rate = apr / num_periods / 100;
  const apy = Math.pow(1 + periodic_rate, num_periods) - 1;
  return apy * 100;
};

const liqLitPool = async (chain, olitprice, liqprice) => {
  const keys = [weth, bal, lit[chain]]
    .map((token) => `${chain}:${token}`)
    .join(',');
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${keys}`)
  ).body.coins;
  const balPrice = prices[`${chain}:${bal}`]?.price;
  const wethPrice = prices[`${chain}:${weth}`]?.price;

  // Compute tvl
  let tvlUsd = 0;
  const { output: veBalance } = await sdk.api.erc20.totalSupply({
    target: rewardPool[chain],
  });
  const balancerToken = lit80weth20[chain];
  const owner = veLit[chain];
  const lpSupply = (
    await sdk.api.abi.call({ abi: 'erc20:totalSupply', target: balancerToken })
  )?.output;
  const lpTokens = (
    await sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: balancerToken,
      params: owner,
    })
  )?.output;
  const poolId = (
    await sdk.api.abi.call({
      abi: balancerTokenABI.find((n) => n.name == 'getPoolId'),
      target: balancerToken,
    })
  )?.output;
  const vault = (
    await sdk.api.abi.call({
      abi: balancerTokenABI.find((n) => n.name == 'getVault'),
      target: balancerToken,
    })
  )?.output;
  const pools = (
    await sdk.api.abi.call({
      abi: vaultABI.find((n) => n.name == 'getPoolTokens'),
      target: vault,
      params: poolId,
    })
  )?.output;
  pools.tokens.forEach((v, i) => {
    tvlUsd +=
      (pools.balances[i] / lpSupply) *
      (veBalance / 1e18) *
      prices[`${chain}:${v}`]?.price;
  });

  const balRate = (
    await sdk.api.abi.call({
      target: balVirtualPool[chain],
      abi: virtualPoolABI.find((n) => n.name === 'rewardRate'),
      chain: chain,
    })
  )?.output;
  const wethRate = (
    await sdk.api.abi.call({
      target: wethVirtualPool[chain],
      abi: virtualPoolABI.find((n) => n.name === 'rewardRate'),
      chain: chain,
    })
  )?.output;
  const olitRate = (
    await sdk.api.abi.call({
      target: litLiqStaker[chain],
      abi: virtualPoolABI.find((n) => n.name === 'rewardRate'),
      chain: chain,
    })
  )?.output;
  const liqrate = (
    await sdk.api.abi.call({
      target: viewHelper[chain],
      abi: viewHelperABI.find((n) => n.name === 'convertLitToLiq'),
      params: [olitRate],
      chain: chain,
    })
  )?.output;

  const balAmount = (balRate / 1e18) * 60 * 60 * 24 * 365;
  const wethAmount = (wethRate / 1e18) * 60 * 60 * 24 * 365;
  const olitAmount = (olitRate / 1e18) * 60 * 60 * 24 * 365;
  const liqAmount = (liqrate / 1e18) * 60 * 60 * 24 * 365;

  const balUsd = balAmount * balPrice;
  const wethUsd = wethAmount * wethPrice;
  const olitUsd = olitAmount * olitprice;
  const liqUsd = liqAmount * liqprice;

  const apyBase = (balUsd / tvlUsd + wethUsd / tvlUsd) * 100;
  const apyReward = (liqUsd / tvlUsd + olitUsd / tvlUsd) * 100;

  return {
    pool: liqLIT[chain],
    chain: utils.formatChain(chain),
    project: 'liquis',
    symbol: 'LIQLIT',
    tvlUsd,
    apyBase,
    apyReward,
    rewardTokens: [liq[chain], lit[chain]],
    underlyingTokens: [lit[chain], weth],
    url: `https://www.liquis.app/liqlit`,
  };
};

const topLvl = async (chainString, url, timestamp) => {
  try {
    const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
      url,
    ]);

    let [
      dataNowSubgraph,
      dataNow,
      dataPriorSubgraph,
      dataPrior,
      { output: protocolFee },
      { output: inflationRate },
      { output: multiplier },
    ] = await Promise.all([
      request(url, query.replace('<PLACEHOLDER>', block)),
      sdk.api.abi.call({
        target: viewHelper[chainString],
        abi: viewHelperABI.find((n) => n.name === 'getPools'),
        params: [booster[chainString]],
        chain: chainString,
        block,
      }),
      request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior)),
      sdk.api.abi.call({
        target: viewHelper[chainString],
        abi: viewHelperABI.find((n) => n.name === 'getPools'),
        params: [booster[chainString]],
        chain: chainString,
        block: blockPrior,
      }),
      sdk.api.abi.call({
        target: hub,
        abi: hubABI.find((n) => n.name === 'protocolFee'),
        chain: chainString,
      }),

      admin[chainString] &&
        sdk.api.abi.call({
          target: admin[chainString],
          abi: adminABI.find((n) => n.name === 'rate'),
          chain: chainString,
        }),
      oracle[chainString] &&
        sdk.api.abi.call({
          target: oracle[chainString],
          abi: oracleABI.find((n) => n.name === 'multiplier'),
          chain: chainString,
        }),
    ]);

    dataNow = dataNow.output.map((b) => ({
      ...b,
      ...dataNowSubgraph.bunniTokens.find(
        (t) => t.address.toLowerCase() === b.lptoken.toLowerCase()
      ),
    }));
    dataPrior = dataPrior.output.map((b) => ({
      ...b,
      ...dataPriorSubgraph.pools.find(
        (p) => p.address.toLowerCase() === b.uniV3Pool.toLowerCase()
      ),
    }));

    dataNow = dataNow
      .filter((b) => !b.shutdown)
      .filter((b) => b.token != liqLIT[chainString]);
    dataPrior = dataPrior
      .filter((b) => !b.shutdown)
      .filter((b) => b.token != liqLIT[chainString]);

    protocolFee = protocolFee / 1e18;
    inflationRate = inflationRate ? inflationRate / 1e18 : null;
    multiplier = multiplier ? multiplier / 10000 : null;

    // create a list of unique tokens
    let tokens = dataNow.reduce((tokens, b) => {
      if (!tokens.includes(b.poolTokens[0])) tokens.push(b.poolTokens[0]);
      if (!tokens.includes(b.poolTokens[1])) tokens.push(b.poolTokens[1]);
      return tokens;
    }, []);

    // add LIT to the token list (used for calculating oLIT price)
    if (lit[chainString] && !tokens.includes(lit[chainString]))
      tokens.push(lit[chainString]);

    // add LIQ to the token list
    if (liq[chainString] && !tokens.includes(liq[chainString]))
      tokens.push(liq[chainString]);

    // create of list of gauges
    const gauges = dataNow.reduce((gauges, b) => {
      if (b.gauge) gauges.push(b.gauge);
      return gauges;
    }, []);

    const week = 604800 * 1000;
    const this_period_timestamp = (Math.floor(Date.now() / week) * week) / 1000;

    const [
      { output: veLITBalance },
      { output: veLITotalSupply },
      { output: tokenSymbols },
      { output: tokenDecimals },
      { output: poolTotalSupplies },
      { output: reserves },
      { output: shares },
      { output: gaugesWorkingSupply },
      { output: gaugesTotalSupply },
      { output: gaugesWorkingBalance },
      { output: gaugesUserLiquidity },
      { output: gaugesTokenlessProduction },
      { output: gaugesIsKilled },
      { output: gaugesRelativeWeight },
      { output: gaugesExists },
    ] = await Promise.all([
      sdk.api.abi.call({
        target: veLit[chainString],
        abi: 'erc20:balanceOf',
        params: [voterProxy[chainString]],
        chain: chainString,
      }),
      sdk.api.abi.call({
        target: veLit[chainString],
        abi: 'erc20:totalSupply',
        chain: chainString,
      }),
      sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        calls: tokens.map((token) => ({ target: token })),
        chain: chainString,
      }),
      sdk.api.abi.multiCall({
        abi: 'erc20:decimals',
        calls: tokens.map((token) => ({ target: token })),
        chain: chainString,
      }),
      sdk.api.abi.multiCall({
        abi: 'erc20:totalSupply',
        calls: dataNow.map((token) => ({ target: token.lptoken })),
        chain: chainString,
      }),
      sdk.api.abi.multiCall({
        abi: lensABI.find((n) => n.name === 'getReserves'),
        target: lens,
        calls: dataNow.map((b) => ({
          params: [
            { pool: b.uniV3Pool, tickLower: b.ticks[0], tickUpper: b.ticks[1] },
          ],
        })),
        chain: chainString,
      }),
      sdk.api.abi.multiCall({
        abi: lensABI.find((n) => n.name === 'pricePerFullShare'),
        target: lens,
        calls: dataNow.map((b) => ({
          params: [
            { pool: b.uniV3Pool, tickLower: b.ticks[0], tickUpper: b.ticks[1] },
          ],
        })),
        chain: chainString,
      }),
      gauges.length &&
        sdk.api.abi.multiCall({
          abi: gaugeABI.find((n) => n.name === 'working_supply'),
          calls: gauges.map((gauge) => ({ target: gauge })),
          chain: chainString,
        }),
      gauges.length &&
        sdk.api.abi.multiCall({
          abi: gaugeABI.find((n) => n.name === 'totalSupply'),
          calls: gauges.map((gauge) => ({ target: gauge })),
          chain: chainString,
        }),
      gauges.length &&
        sdk.api.abi.multiCall({
          abi: gaugeABI.find((n) => n.name === 'working_balances'),
          calls: gauges.map((gauge) => ({
            target: gauge,
            params: [voterProxy[chainString]],
          })),
          chain: chainString,
        }),
      gauges.length &&
        sdk.api.abi.multiCall({
          abi: gaugeABI.find((n) => n.name === 'balanceOf'),
          calls: gauges.map((gauge) => ({
            target: gauge,
            params: [voterProxy[chainString]],
          })),
          chain: chainString,
        }),
      gauges.length &&
        sdk.api.abi.multiCall({
          abi: gaugeABI.find((n) => n.name === 'tokenless_production'),
          calls: gauges.map((gauge) => ({ target: gauge })),
          chain: chainString,
        }),
      gauges.length &&
        sdk.api.abi.multiCall({
          abi: gaugeABI.find((n) => n.name === 'is_killed'),
          calls: gauges.map((gauge) => ({ target: gauge })),
          chain: chainString,
        }),
      gauges.length &&
        sdk.api.abi.multiCall({
          abi: gaugeABI.find((n) => n.name === 'getCappedRelativeWeight'),
          calls: gauges.map((gauge) => ({
            target: gauge,
            params: [this_period_timestamp],
          })),
          chain: chainString,
        }),
      gauges.length &&
        sdk.api.abi.multiCall({
          abi: controllerABI.find((n) => n.name === 'gauge_exists'),
          target: controller[chainString],
          calls: gauges.map((gauge) => ({ params: [gauge] })),
          chain: chainString,
        }),
    ]);

    // fetch token prices
    const keys = tokens.map((token) => `${chainString}:${token}`).join(',');
    const prices = (
      await superagent.get(`https://coins.llama.fi/prices/current/${keys}`)
    ).body.coins;

    // calculate the price of oLIT
    let optionPrice = 0;
    if (lit[chainString]) {
      const litPrice = prices[`${chainString}:${lit[chainString]}`]
        ? prices[`${chainString}:${lit[chainString]}`]?.price
        : 0;
      optionPrice = litPrice * multiplier;
    }

    const liqPrice = prices[`${chainString}:${liq[chainString]}`]
      ? prices[`${chainString}:${liq[chainString]}`]?.price
      : 0;

    let poolData = [];
    poolData.push(liqLitPool(chainString, optionPrice, liqPrice));
    poolData = poolData.concat(
      dataNow.map(async (b) => {
        // reserve info
        const reserve = reserves.find(
          (r) =>
            r.input.params[0].pool == b.uniV3Pool &&
            r.input.params[0].tickLower == b.ticks[0] &&
            r.input.params[0].tickUpper == b.ticks[1]
        ).output;

        // share info
        const share = shares.find(
          (s) =>
            s.input.params[0].pool == b.uniV3Pool &&
            s.input.params[0].tickLower == b.ticks[0] &&
            s.input.params[0].tickUpper == b.ticks[1]
        ).output;

        // token0 info
        const token0Decimals = tokenDecimals.find(
          (d) => d.input.target == b.poolTokens[0]
        ).output;
        const token0Price = prices[`${chainString}:${b.poolTokens[0]}`]
          ? prices[`${chainString}:${b.poolTokens[0]}`]?.price
          : 0;
        const token0Redeem = share.amount0 / Math.pow(10, token0Decimals);
        const token0Reserve = reserve.reserve0 / Math.pow(10, token0Decimals);
        const token0Symbol = tokenSymbols.find(
          (s) => s.input.target == b.poolTokens[0]
        ).output;

        // token1 info
        const token1Decimals = tokenDecimals.find(
          (d) => d.input.target == b.poolTokens[1]
        ).output;
        const token1Price = prices[`${chainString}:${b.poolTokens[1]}`]
          ? prices[`${chainString}:${b.poolTokens[1]}`]?.price
          : 0;
        const token1Redeem = share.amount1 / Math.pow(10, token1Decimals);
        const token1Reserve = reserve.reserve1 / Math.pow(10, token1Decimals);
        const token1Symbol = tokenSymbols.find(
          (s) => s.input.target == b.poolTokens[1]
        ).output;

        // calculate swap fee apr
        let baseApr = 0;

        const tickLower = parseInt(b.ticks[0]);
        const tickUpper = parseInt(b.ticks[1]);
        const tick = parseInt(b.pool.tick);
        const poolTotalSupply = poolTotalSupplies.find(
          (t) => t.input.target == b.lptoken
        ).output;
        let tvl =
          poolTotalSupply == 0
            ? 0
            : (token0Reserve * token0Price + token1Reserve * token1Price) *
              (b.totalSupply / b.liquidity);

        if (b.pool.liquidity > 0 && tickLower <= tick && tick <= tickUpper) {
          const prior = dataPrior.find(
            (d) => d.address.toLowerCase() === b.uniV3Pool.toLowerCase()
          );

          if (prior) {
            const fee0 =
              ((b.pool.totalFeesToken0 - prior.totalFeesToken0) /
                Math.pow(10, token0Decimals)) *
              token0Price;
            const fee1 =
              ((b.pool.totalFeesToken1 - prior.totalFeesToken1) /
                Math.pow(10, token1Decimals)) *
              token1Price;
            const fee = Math.min(fee0, fee1) * 365;

            baseApr =
              ((fee * parseInt(b.liquidity)) /
                parseInt(b.pool.liquidity) /
                (token0Reserve * token0Price + token1Reserve * token1Price)) *
              (1 - protocolFee) *
              100;
          }
        }

        // calculate reward apr
        let rewardApr = null;
        let rewardTokens = null;

        if (b.gauge) {
          const exists = gaugesExists.find(
            (g) => g.input.params[0].toLowerCase() == b.gauge.toLowerCase()
          )?.output;
          const killed = gaugesIsKilled.find(
            (g) => g.input.target.toLowerCase() == b.gauge.toLowerCase()
          )?.output;

          // we only care about gauges that have been whitelisted and have not been killed
          if (exists && !killed) {
            const relativeWeight =
              gaugesRelativeWeight.find(
                (g) => g.input.target.toLowerCase() == b.gauge.toLowerCase()
              )?.output / 1e18;
            const tokenlessProduction =
              gaugesTokenlessProduction.find(
                (g) => g.input.target.toLowerCase() == b.gauge.toLowerCase()
              )?.output / 1e18;
            const workingSupply =
              gaugesWorkingSupply.find(
                (g) => g.input.target.toLowerCase() == b.gauge.toLowerCase()
              )?.output / 1e18;
            const workingBalance =
              gaugesWorkingBalance.find(
                (g) => g.input.target.toLowerCase() == b.gauge.toLowerCase()
              )?.output / 1e18;
            const totalSupply =
              gaugesTotalSupply.find(
                (g) => g.input.target.toLowerCase() == b.gauge.toLowerCase()
              )?.output / 1e18;
            const userLiquidity =
              gaugesUserLiquidity.find(
                (g) => g.input.target.toLowerCase() == b.gauge.toLowerCase()
              )?.output / 1e18;
            const veLitBalance = veLITBalance / 1e18;
            const veLitTotalSupply = veLITotalSupply / 1e18;
            const relativeInflation = inflationRate * relativeWeight;

            // we only care about gauges that receive rewards (ie those that receive votes)
            if (relativeInflation > 0 && workingBalance > 0) {
              const t = tokenlessProduction / 100;
              const T = 1 - t;
              const l = userLiquidity;
              const L =
                (b.liquidity / 1e18) * (veLitBalance / veLitTotalSupply);
              const working_balance = Math.min(t * l + T * L, l);

              // calculate the working supply
              const working_ratio = workingSupply / totalSupply;
              const new_total_liquidity = b.liquidity / 1e18 - totalSupply;
              const new_working_supply = working_ratio * new_total_liquidity;

              const working_supply =
                workingSupply +
                new_working_supply -
                workingBalance +
                working_balance;
              if (working_supply > 0) {
                const bunniPrice =
                  token0Redeem * token0Price + token1Redeem * token1Price;

                const userSupplyUsd = userLiquidity * bunniPrice;
                const userAnnualReward =
                  ((relativeInflation * 86400 * 365) / working_supply) *
                  working_balance;
                const userAnnualRewardUSD = userAnnualReward * optionPrice;

                const userAnnualLiqReward = (
                  await sdk.api.abi.call({
                    target: viewHelper[chainString],
                    abi: viewHelperABI.find(
                      (n) => n.name === 'convertLitToLiq'
                    ),
                    params: [(userAnnualReward * 0.75).toFixed(0)],
                    chain: chainString,
                  })
                )?.output;
                const userAnnualLiqRewardUSD = userAnnualLiqReward * liqPrice;

                rewardApr =
                  (userAnnualRewardUSD / userSupplyUsd) * 100 * 0.75 +
                  (userAnnualLiqRewardUSD / userSupplyUsd) * 100;
                rewardTokens = [lit[chainString], liq[chainString]];
              }
            }
          }
        }

        return {
          pool: b.token,
          chain: utils.formatChain(chainString),
          project: 'liquis',
          symbol: `${token0Symbol}-${token1Symbol}`,
          tvlUsd: tvl,
          apyBase: apy(baseApr, 365),
          ...(rewardApr && { apyReward: rewardApr }),
          ...(rewardTokens && { rewardTokens: rewardTokens }),
          underlyingTokens: [b.poolTokens[0], b.poolTokens[1]],
          poolMeta: `${parseInt(b.pool.fee) / 10000}%, tickLower: ${
            b.ticks[0]
          }, tickUpper: ${b.ticks[1]}`,
          url: `https://www.liquis.app/stake/${b.crvRewards}`,
        };
      })
    );

    poolData = await Promise.all(poolData);
    return poolData;
  } catch (e) {
    console.log(e);
    return [];
  }
};

const main = async (timestamp = null) => {
  const data = [];
  for (const [chain, url] of Object.entries(chains)) {
    data.push(await topLvl(chain, url, timestamp));
  }
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: `https://www.liquis.app/stake`,
};
