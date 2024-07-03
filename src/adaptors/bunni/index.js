const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');
const { request, gql } = require('graphql-request');

const hub = '0xb5087f95643a9a4069471a28d32c569d9bd57fe4';
const lens = '0xb73f303472c4fd4ff3b9f59ce0f9b13e47fbfd19';
const zeroAddress = '0x0000000000000000000000000000000000000000';

const admin = {
  ethereum: '0x4cc39af0d46b0f66fd33778c6629a696bdc310a0',
  polygon: '',
  arbitrum: '',
  optimism: '',
};

const controller = {
  ethereum: '0x901c8aa6a61f74ac95e7f397e22a0ac7c1242218',
  polygon: '',
  arbitrum: '',
  optimism: '',
};

const lit = {
  ethereum: '0xfd0205066521550d7d7ab19da8f72bb004b4c341',
  polygon: '',
  arbitrum: '',
  optimism: '',
};

const olit = {
  ethereum: '0x627fee87d0d9d2c55098a06ac805db8f98b158aa',
  polygon: '',
  arbitrum: '0x0ffB33812FA5cd8bCE181Db3FD76E11935105B12',
  optimism: '',
};

const oracle = {
  ethereum: '0x9d43ccb1ad7e0081cc8a8f1fd54d16e54a637e30',
  polygon: '',
  arbitrum: '',
  optimism: '',
};

const hubABI = require('./abis/BunniHub.json');
const lensABI = require('./abis/BunniLens.json');
const adminABI = require('./abis/TokenAdmin.json');
const gaugeABI = require('./abis/LiquidityGauge.json');
const childGaugeABI = require('./abis/ChildGauge.json');
const controllerABI = require('./abis/GaugeController.json');
const oracleABI = require('./abis/OptionsOracle.json');

const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    'HH4HFj4rFnm5qnkb8MbEdP2V5eD9rZnLJE921YQAs7AV'
  ),
  polygon: sdk.graph.modifyEndpoint(
    '7WkeneDon7GY3CdcZW3rsPi4pRfDthwe1nWGKX21dRgC'
  ),
};

const query = gql`
    {
        bunniTokens(first: 1000, block: {number: <PLACEHOLDER>}) {
            id
            address
            liquidity
            tickLower
            tickUpper
            pool {
                id
                fee
                tick
                token0
                token1
                liquidity
                totalFeesToken0
                totalFeesToken1
            }
            gauge {
                address
            }
        }
    }
`;

const queryPrior = gql`
    {
        pools(first: 1000, block: {number: <PLACEHOLDER>}) {
            id
            totalFeesToken0
            totalFeesToken1
        }
    }
`;

const apy = (apr, num_periods) => {
  const periodic_rate = apr / num_periods / 100;
  const apy = Math.pow(1 + periodic_rate, num_periods) - 1;
  return apy * 100;
};

const topLvl = async (chainString, url, query, queryPrior, timestamp) => {
  try {
    const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
      url,
    ]);

    let [
      dataNow,
      dataPrior,
      { output: protocolFee },
      { output: inflationRate },
      { output: multiplier },
    ] = await Promise.all([
      request(url, query.replace('<PLACEHOLDER>', block)),
      request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior)),
      sdk.api.abi.call({
        target: hub,
        abi: hubABI.find((n) => n.name === 'protocolFee'),
        chain: chainString,
      }),

      admin['ethereum'] &&
        sdk.api.abi.call({
          target: admin['ethereum'],
          abi: adminABI.find((n) => n.name === 'rate'),
          chain: 'ethereum',
        }),
      oracle['ethereum'] &&
        sdk.api.abi.call({
          target: oracle['ethereum'],
          abi: oracleABI.find((n) => n.name === 'multiplier'),
          chain: 'ethereum',
        }),
    ]);

    dataNow = dataNow.bunniTokens;
    dataPrior = dataPrior.pools;
    protocolFee = protocolFee / 1e18;
    inflationRate = inflationRate ? inflationRate / 1e18 : null;
    multiplier = multiplier ? multiplier / 10000 : null;

    // create a list of unique tokens
    let tokens = dataNow.reduce((tokens, b) => {
      if (!tokens.includes(b.pool.token0)) tokens.push(b.pool.token0);
      if (!tokens.includes(b.pool.token1)) tokens.push(b.pool.token1);
      return tokens;
    }, []);

    // add LIT to the token list (used for calculating oLIT price)
    if (lit[chainString] && !tokens.includes(lit[chainString]))
      tokens.push(lit[chainString]);

    // create of list of gauges
    const gauges = dataNow.reduce((gauges, b) => {
      if (b.gauge) gauges.push(b.gauge?.address);
      return gauges;
    }, []);

    const week = 604800 * 1000;
    const this_period_timestamp = (Math.floor(Date.now() / week) * week) / 1000;

    const [
      { output: tokenSymbols },
      { output: tokenDecimals },
      { output: reserves },
      { output: shares },
      { output: gaugesWorkingSupply },
      { output: gaugesTokenlessProduction },
      { output: gaugesIsKilled },
      { output: gaugesRelativeWeight },
      { output: gaugesExists },
      { output: gaugesInflationRate },
    ] = await Promise.all([
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
        abi: lensABI.find((n) => n.name === 'getReserves'),
        target: lens,
        calls: dataNow.map((b) => ({
          params: [
            { pool: b.pool.id, tickLower: b.tickLower, tickUpper: b.tickUpper },
          ],
        })),
        chain: chainString,
      }),
      sdk.api.abi.multiCall({
        abi: lensABI.find((n) => n.name === 'pricePerFullShare'),
        target: lens,
        calls: dataNow.map((b) => ({
          params: [
            { pool: b.pool.id, tickLower: b.tickLower, tickUpper: b.tickUpper },
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
      chainString == 'ethereum' &&
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
          target: controller['ethereum'],
          calls: gauges.map((gauge) => ({ params: [gauge] })),
          chain: 'ethereum',
        }),
      chainString != 'ethereum' &&
        gauges.length &&
        sdk.api.abi.multiCall({
          abi: childGaugeABI.find((n) => n.name === 'inflation_rate'),
          calls: gauges.map((gauge) => ({
            target: gauge,
            params: [Math.floor(this_period_timestamp / 604800)],
          })),
          chain: chainString,
        }),
    ]);

    // fetch token prices
    let keys = tokens.map((token) => `${chainString}:${token}`).join(',');
    if (chainString != 'ethereum')
      keys = keys.concat(`,ethereum:${lit['ethereum']}`);
    const prices = (
      await axios.get(`https://coins.llama.fi/prices/current/${keys}`)
    ).data.coins;

    // calculate the price of oLIT
    let optionPrice = 0;
    if (lit['ethereum']) {
      const litPrice = prices[`ethereum:${lit['ethereum']}`]
        ? prices[`ethereum:${lit['ethereum']}`].price
        : 0;
      optionPrice = litPrice * multiplier;
    }

    let poolData = dataNow.map((b) => {
      // reserve info
      const reserve = reserves.find(
        (r) =>
          r.input.params[0].pool == b.pool.id &&
          r.input.params[0].tickLower == b.tickLower &&
          r.input.params[0].tickUpper == b.tickUpper
      ).output;

      // share info
      const share = shares.find(
        (s) =>
          s.input.params[0].pool == b.pool.id &&
          s.input.params[0].tickLower == b.tickLower &&
          s.input.params[0].tickUpper == b.tickUpper
      ).output;

      // token0 info
      const token0Decimals = tokenDecimals.find(
        (d) => d.input.target == b.pool.token0
      ).output;
      const token0Price = prices[`${chainString}:${b.pool.token0}`]
        ? prices[`${chainString}:${b.pool.token0}`].price
        : 0;
      const token0Redeem = share.amount0 / Math.pow(10, token0Decimals);
      const token0Reserve = reserve.reserve0 / Math.pow(10, token0Decimals);
      const token0Symbol = tokenSymbols.find(
        (s) => s.input.target == b.pool.token0
      ).output;

      // token1 info
      const token1Decimals = tokenDecimals.find(
        (d) => d.input.target == b.pool.token1
      ).output;
      const token1Price = prices[`${chainString}:${b.pool.token1}`]
        ? prices[`${chainString}:${b.pool.token1}`].price
        : 0;
      const token1Redeem = share.amount1 / Math.pow(10, token1Decimals);
      const token1Reserve = reserve.reserve1 / Math.pow(10, token1Decimals);
      const token1Symbol = tokenSymbols.find(
        (s) => s.input.target == b.pool.token1
      ).output;

      // calculate swap fee apr
      let baseApr = 0;

      const tick = parseInt(b.pool.tick);
      const tickLower = parseInt(b.tickLower);
      const tickUpper = parseInt(b.tickUpper);
      const tvl = token0Reserve * token0Price + token1Reserve * token1Price;

      if (
        tvl > 0 &&
        parseInt(b.pool.liquidity) > 0 &&
        tickLower <= tick &&
        tick <= tickUpper
      ) {
        const prior = dataPrior.find((d) => d.id === b.pool.id);

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
            ((fee * parseInt(b.liquidity)) / parseInt(b.pool.liquidity) / tvl) *
            (1 - protocolFee) *
            100;
        }
      }

      // calculate reward apr
      let rewardApr = null;
      let rewardTokens = null;

      if (b.gauge) {
        const exists = gaugesExists.find(
          (g) => g.input.params[0] == b.gauge?.address
        )?.output;
        const killed = gaugesIsKilled.find(
          (g) => g.input.target == b.gauge?.address
        )?.output;

        // we only care about gauges that have been whitelisted and have not been killed
        if (exists && !killed) {
          const relativeWeight = gaugesRelativeWeight
            ? gaugesRelativeWeight.find(
                (g) => g.input.target == b.gauge?.address
              ).output / 1e18
            : 0;
          const tokenlessProduction = gaugesTokenlessProduction.find(
            (g) => g.input.target == b.gauge?.address
          )?.output;
          const workingSupply =
            gaugesWorkingSupply.find((g) => g.input.target == b.gauge?.address)
              ?.output / 1e18;

          const gaugeInflationRate =
            gaugesInflationRate &&
            gaugesInflationRate.find((g) => g.input.target == b.gauge?.address)
              ?.output / 1e18;
          const relativeInflation = gaugeInflationRate
            ? gaugeInflationRate
            : inflationRate * relativeWeight;

          // we only care about gauges that receive rewards (ie those that receive votes)
          if (relativeInflation > 0) {
            const bunniPrice =
              token0Redeem * token0Price + token1Redeem * token1Price;
            const annualRewardUSD =
              relativeInflation * optionPrice * 86400 * 365;

            // if nothing has been staked, calculate what rewardApr would be if 1 wei was staked
            const workingSupplyUSD =
              (workingSupply > 0 ? workingSupply : 1e-18) * bunniPrice;

            if (workingSupplyUSD > 0) {
              rewardApr =
                (annualRewardUSD * tokenlessProduction) / workingSupplyUSD;
              rewardTokens = [olit[chainString]];
            }
          }
        }
      }

      return {
        pool: b.address,
        chain: utils.formatChain(chainString),
        project: 'bunni',
        symbol: `${token0Symbol}-${token1Symbol}`,
        tvlUsd: token0Reserve * token0Price + token1Reserve * token1Price,
        apyBase: apy(baseApr, 365),
        ...(rewardApr && { apyReward: apy(rewardApr, 365) }),
        ...(rewardTokens && { rewardTokens: rewardTokens }),
        underlyingTokens: [b.pool.token0, b.pool.token1],
        poolMeta: `${parseInt(b.pool.fee) / 10000}%, tickLower: ${
          b.tickLower
        }, tickUpper: ${b.tickUpper}`,
        url: `https://bunni.pro/pools/${chainString}/${b.pool.id}/${b.address}`,
      };
    });

    return poolData;
  } catch (e) {
    console.log(e);
    return [];
  }
};

const main = async (timestamp = null) => {
  const data = [];
  for (const [chain, url] of Object.entries(chains)) {
    console.log(chain);
    data.push(await topLvl(chain, url, query, queryPrior, timestamp));
  }
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: `https://bunni.pro/pools`,
};
