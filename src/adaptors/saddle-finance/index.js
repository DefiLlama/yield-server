const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abi = require('./abi');
const gaugeAbi = require('./gaugeAbi');
const gaugeControllerAbi = require('./gaugeControllerAbi');
const gaugeMinterAbi = require('./gaugeMinterAbi');

const gaugeController = '0x99Cb6c36816dE2131eF2626bb5dEF7E5cc8b9B14';
const gaugeMinter = '0x358fE82370a1B9aDaE2E3ad69D6cF9e503c96018';

const sdl = '0xf1dc500fde233a4055e25e5bbf516372bc4f6871';

const subgraph = sdk.graph.modifyEndpoint('79UL5SaLLsbXqC8Ks6v3fwWHR1FRs636FFRHn55o5SWq');

const apy = async () => {
  const n_gauges = (
    await sdk.api.abi.call({
      target: gaugeController,
      abi: gaugeControllerAbi.find((m) => m.name === 'n_gauges'),
      chain: 'ethereum',
      permitFailure: true,
    })
  ).output;

  // includes LiqV5 and root gauges (which are used together with child gauges on arbitrum)
  const gauges = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(n_gauges)).keys()].map((i) => ({
        target: gaugeController,
        params: [i],
      })),
      abi: gaugeControllerAbi.find((m) => m.name === 'gauges'),
      chain: 'ethereum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const gaugeRelativeWeight = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((gauge) => ({
        target: gaugeController,
        params: [gauge],
      })),
      abi: gaugeControllerAbi.find((m) => m.name === 'gauge_relative_weight'),
      chain: 'ethereum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const inflationRate = (
    await sdk.api.abi.call({
      target: gaugeMinter,
      abi: gaugeMinterAbi.find((m) => m.name === 'rate'),
      chain: 'ethereum',
      permitFailure: true,
    })
  ).output;

  const lpToken = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((gauge) => ({
        target: gauge,
      })),
      abi: gaugeAbi.find((m) => m.name === 'lp_token'),
      chain: 'ethereum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: lpToken.map((lp) => ({
        target: lp,
      })),
      abi: 'erc20:totalSupply',
      chain: 'ethereum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const balanceOf = (
    await sdk.api.abi.multiCall({
      calls: lpToken.map((lp, i) => ({
        target: lp,
        params: gauges[i],
      })),
      abi: 'erc20:balanceOf',
      chain: 'ethereum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const lpTokenRelWeightMap = {};
  for (const [i, weight] of gaugeRelativeWeight.entries()) {
    if (lpToken[i]) {
      lpTokenRelWeightMap[lpToken[i].toLowerCase()] = {
        gaugeWeight: weight,
        gaugeShare: balanceOf[i] / totalSupply[i],
      };
    }
  }

  const q = gql`
    query MyQuery {
      dailyVolumes(orderBy: timestamp, orderDirection: desc) {
        id
        timestamp
        volume
        swap {
          id
          lpToken
          swapFee
          virtualPrice
          withdrawFee
          tokens {
            symbol
            address
            decimals
          }
        }
      }
    }
  `;
  const dailyVolume = (await request(subgraph, q)).dailyVolumes;
  // filter to most recent values per pool
  let pools = dailyVolume.filter(
    (obj, index, self) =>
      index === self.findIndex((t) => t.swap.id === obj.swap.id)
  );

  // get prices
  const uniqueTokens = [
    ...new Set(
      pools.map((p) => p.swap.tokens.map((t) => t.address.toLowerCase())).flat()
    ),
  ]
    .concat(sdl)
    .map((t) => `ethereum:${t}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${uniqueTokens}`)
  ).data.coins;

  const finalPools = await Promise.all(
    pools.map(async (p, i) => {
      const tokenAddresses = (
        await sdk.api.abi.multiCall({
          calls: p.swap.tokens.map((_, j) => ({
            target: p.swap.id,
            params: [j],
          })),
          chain: 'ethereum',
          abi: abi.find((m) => m.name === 'getToken'),
          permitFailure: true,
        })
      ).output.map((o) => o.output);

      const tokenBalances = (
        await sdk.api.abi.multiCall({
          calls: p.swap.tokens.map((_, j) => ({
            target: p.swap.id,
            params: [j],
          })),
          chain: 'ethereum',
          abi: abi.find((m) => m.name === 'getTokenBalance'),
          permitFailure: true,
        })
      ).output.map((o) => o.output);

      const tvlUsd = tokenAddresses.reduce((acc, t, i) => {
        const tokenPrice = prices[`ethereum:${t.toLowerCase()}`]?.price;
        const tokenDecimals = p.swap.tokens.find(
          (token) => token.address.toLowerCase() === t.toLowerCase()
        )?.decimals;
        return acc + (tokenPrice * tokenBalances[i]) / 10 ** tokenDecimals;
      }, 0);

      // swap apr
      const apr = ((365 * p.volume * (p.swap.swapFee / 1e10)) / tvlUsd) * 100;

      // sdl apr
      const gaugeWeight =
        lpTokenRelWeightMap[p.swap.lpToken.toLowerCase()]?.gaugeWeight / 1e18;
      const rate = inflationRate / 1e18; // sdl per second
      const gaugeShare =
        lpTokenRelWeightMap[p.swap.lpToken.toLowerCase()]?.gaugeShare;
      const gaugeTvl = gaugeShare * tvlUsd;
      const apyReward =
        ((rate * 86400 * 365 * prices[`ethereum:${sdl}`]?.price * gaugeWeight) /
          gaugeTvl) *
        100 *
        0.4; // lower bound

      return {
        pool: p.swap.id,
        symbol: p.swap.tokens.map((t) => t.symbol).join('-'),
        chain: 'Ethereum',
        project: 'saddle-finance',
        tvlUsd,
        apyBase: utils.aprToApy(apr),
        apyReward,
        rewardTokens: apyReward > 0 ? [sdl] : null,
        underlyingTokens: p.swap.tokens.map((t) => t.address),
      };
    })
  );

  return finalPools.filter(
    (p) =>
      utils.keepFinite(p) &&
      p.pool !== '0x4f6a43ad7cba042606decaca730d4ce0a57ac62e' // ren pool
  );
};

module.exports = {
  apy,
  url: 'https://saddle.exchange/#/pools',
};
