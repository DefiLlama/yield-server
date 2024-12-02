const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const abiPairFactory = require('./abis/PairFactory.json');
const abiGauge = require('./abis/Gauge.json');
const abiPair = require('./abis/Pair.json');
const abiVoter = require('./abis/Voter.json');
const abiOption = require('./abis/Option.json');

const pairFactory = '0xe21Aac7F113Bd5DC2389e4d8a8db854a87fD6951';
const voter = '0xab9B68c9e53c94D7c0949FB909E80e4a29F9134A';

const chain = 'base';

const oBVM = '0x762eb51d2e779eeec9b239ffb0b2ec8262848f3e';
const BVM = '0xd386a121991E51Eab5e3433Bf5B1cF4C8884b47a';

// option to buy underlying token at a discount
// we'll need to update this if more options are added as there's no way to get the list of options from the contracts
const optionTokenToGovToken = {
  [oBVM.toLowerCase()]: BVM.toLowerCase(),
  ['0x6c743ee9ef26b445d80f19cc783e89b43dcffa07'.toLowerCase()]:
    '0x356BDb09C6D095464a3B009C64920a8BDa629060'.toLowerCase(), // oSmooth smooth
};

const getApy = async () => {
  const allPairsLength = (
    await sdk.api.abi.call({
      target: pairFactory,
      abi: abiPairFactory.find((m) => m.name === 'allPairsLength'),
      chain,
    })
  ).output;

  let allPairs = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: pairFactory,
        params: [i],
      })),
      abi: abiPairFactory.find((m) => m.name === 'allPairs'),
      chain,
    })
  ).output.map((o) => o.output);

  let metaData = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'metadata'),
      chain,
    })
  ).output.map((o) => o.output);

  const tokens = [...new Set(metaData.map((m) => [m.t0, m.t1]).flat())].map(
    (t) => t.toLowerCase()
  );

  const priceKeys = tokens.map((i) => `${chain}:${i}`).join(',');

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const optionTokens = Object.keys(optionTokenToGovToken);
  // get discount for redeeming option token to liquidity token
  const discounts = (
    await sdk.api.abi.multiCall({
      calls: optionTokens.map((optionToken) => ({
        target: optionToken,
      })),
      abi: abiOption.find((m) => m.name === 'discount'),
      chain,
    })
  ).output
    .map((o) => 100 - parseFloat(o.output))
    .map((discount, index) => ({
      [optionTokens[index]]: discount,
    }));

  // calculate profit from option token
  // oTokenPrice = (underlyingTokenPrice * discount) / 100
  /**
   * @type {Object.<string, number>}
   */
  const optionTokenPrices = optionTokens
    .map((optionToken, index) => {
      const underlyingToken = optionTokenToGovToken[optionToken];
      const underlyingTokenPrice =
        prices[`${chain}:${underlyingToken.toLowerCase()}`]?.price;

      const discount = discounts[index][optionToken];
      return (underlyingTokenPrice * discount) / 100;
    })
    .reduce((acc, cur, index) => {
      acc[optionTokens[index]] = isNaN(cur) ? 0 : cur;
      return acc;
    }, {});

  let symbols = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'symbol'),
      chain,
    })
  ).output.map((o) => o.output);

  let gauges = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: voter,
        params: [i],
      })),
      abi: abiVoter.find((m) => m.name === 'gauges'),
      chain,
    })
  ).output.map((o) => o.output);

  // we have some gauges set to null address 0x0000000000000000000000000000000000000000
  // and they're not supported in sdk4 as target value
  // thus we need to filter them out
  const nullAddress = '0x0000000000000000000000000000000000000000';
  allPairs = allPairs.filter((pair, index) => gauges[index] != nullAddress);
  metaData = metaData.filter((meta, index) => gauges[index] != nullAddress);
  symbols = symbols.filter((symbol, index) => gauges[index] != nullAddress);
  gauges = gauges.filter((gauge) => gauge != nullAddress);

  const rewardsListLengthForGauges = (
    await sdk.api.abi.multiCall({
      abi: abiGauge.find((m) => m.name === 'rewardsListLength'),
      calls: gauges.map((i) => ({
        target: i,
      })),
      chain,
    })
  ).output.map((o) => o.output);

  // one gauge might have multiple reward tokens
  const rewardTokensAndRates = await Promise.all(
    // get all reward tokens for each gauge
    rewardsListLengthForGauges.map(async (i, index) => {
      const gauge = gauges[index];
      return (
        await sdk.api.abi.multiCall({
          abi: abiGauge.find((m) => m.name === 'rewards'),
          calls: [...Array(Number(i ?? 0)).keys()].map((j) => ({
            target: gauge,
            params: [j],
          })),
          chain,
        })
      ).output.map((o) => o.output);
    })
  ).then(async (rewardTokensForGauges) => {
    // get reward rate of each reward token
    return await Promise.all(
      rewardTokensForGauges.map(async (rewardTokensOfGauge, index) => {
        const rates = (
          await sdk.api.abi.multiCall({
            abi: abiGauge.find((m) => m.name === 'rewardRate'),
            calls: rewardTokensOfGauge.map((rewardToken) => ({
              target: gauges[index],
              params: [rewardToken],
            })),
            chain,
          })
        ).output.map((o) => o.output);

        const left = (
          await sdk.api.abi.multiCall({
            abi: abiGauge.find((m) => m.name === 'left'),
            calls: rewardTokensOfGauge.map((rewardToken) => ({
              target: gauges[index],
              params: [rewardToken],
            })),
            chain,
          })
        ).output.map((o) => o.output);

        return rates.map((rate, index) => {
          // if left is 0, the reward rate will be 0
          if (left[index] === '0') {
            return '0';
          }
          return rate;
        });
      })
    ).then((rewardRatesForGauges) => {
      return rewardRatesForGauges.map((rewardRatesOfGauge, index) => {
        const rewardTokensOfGauge = rewardTokensForGauges[index];
        return rewardRatesOfGauge.map((rate, index) => {
          const rewardToken = rewardTokensOfGauge[index].toLowerCase();
          if (rewardToken === BVM.toLowerCase()) {
            // FVM reward will be converted to oFVM when claiming
            return [oBVM, rate];
          }
          return [rewardToken, rate];
        });
      });
    });
  });

  const pools = allPairs.map((p, i) => {
    const poolMeta = metaData[i];
    const r0 = poolMeta.r0 / poolMeta.dec0;
    const r1 = poolMeta.r1 / poolMeta.dec1;

    const p0 = prices[`${chain}:${poolMeta.t0.toLowerCase()}`]?.price;
    const p1 = prices[`${chain}:${poolMeta.t1.toLowerCase()}`]?.price;

    const tvlUsd = r0 * p0 + r1 * p1;

    const s = symbols[i];

    const totalRewardPerDay = rewardTokensAndRates[i].reduce(
      (acc, [rewardToken, rewardRate]) => {
        let tokenPrice = 0;
        if (optionTokenPrices[rewardToken.toLowerCase()]) {
          tokenPrice = optionTokenPrices[rewardToken.toLowerCase()];
        } else if (prices[`${chain}:${rewardToken.toLowerCase()}`]) {
          tokenPrice = prices[`${chain}:${rewardToken.toLowerCase()}`]?.price;
        }

        const reward = ((rewardRate * 60 * 60 * 24) / 1e18) * tokenPrice;

        return acc + reward;
      },
      0
    );

    // tvlUsd is used here instead of stakedUsd
    const apyReward = ((totalRewardPerDay * 365) / tvlUsd) * 100;

    const rewardTokens = rewardTokensAndRates[i].map(([token]) =>
      token.toLowerCase()
    );

    return {
      pool: p,
      chain: utils.formatChain(chain),
      project: 'velocimeter-v2',
      symbol: utils.formatSymbol(s.split('-')[1]),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [...new Set(rewardTokens)] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
      url: `https://base.velocimeter.xyz/liquidity/${p}`,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};
module.exports = {
  timetravel: false,
  apy: getApy,
};
