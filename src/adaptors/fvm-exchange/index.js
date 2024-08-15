const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const abiPairFactory = require('./abis/PairFactory.json');
const abiGauge = require('./abis/Gauge.json');
const abiPair = require('./abis/Pair.json');
const abiVoter = require('./abis/Voter.json');
const abiOption = require('./abis/Option.json');

const pairFactory = '0x472f3C3c9608fe0aE8d702f3f8A2d12c410C881A';
const voter = '0xc9Ea7A2337f27935Cd3ccFB2f725B0428e731FBF';

const chain = 'fantom';

const oFVM = '0xF9EDdca6B1e548B0EC8cDDEc131464F462b8310D';
const FVM = '0x07BB65fAaC502d4996532F834A1B7ba5dC32Ff96';

// option to buy underlying token at a discount
// we'll need to update this if more options are added as there's no way to get the list of options from the contracts
const optionTokenToGovToken = {
  [oFVM.toLowerCase()]: FVM.toLowerCase(), // oFVM - fvm
  ['0xC5d4E462b96cC73283EB452B15147c17Af413313'.toLowerCase()]:
    '0x2A5E4c77F791c0174a717B644A53fc21A29790Cd'.toLowerCase(), // oBLOTR - blotr
  ['0x269557D887EaA9C1a756B2129740B3FC2821fD91'.toLowerCase()]:
    '0xE5a4c0af6F5f7Ab5d6C1D38254bCf4Cc26d688ed'.toLowerCase(), // oBAY - bay
};

const getApy = async () => {
  const allPairsLength = (
    await sdk.api.abi.call({
      target: pairFactory,
      abi: abiPairFactory.find((m) => m.name === 'allPairsLength'),
      chain,
    })
  ).output;

  const allPairs = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: pairFactory,
        params: [i],
      })),
      abi: abiPairFactory.find((m) => m.name === 'allPairs'),
      chain,
    })
  ).output.map((o) => o.output);

  const metaData = (
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

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'symbol'),
      chain,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const gauges = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: voter,
        params: [i],
      })),
      abi: abiVoter.find((m) => m.name === 'gauges'),
      chain,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const rewardsListLengthForGauges = (
    await sdk.api.abi.multiCall({
      abi: abiGauge.find((m) => m.name === 'rewardsListLength'),
      calls: gauges.map((i) => ({
        target: i,
      })),
      chain,
      permitFailure: true,
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
          permitFailure: true,
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
            permitFailure: true,
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
          if (rewardToken === FVM.toLowerCase()) {
            // FVM reward will be converted to oFVM when claiming
            return [oFVM, rate];
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

    const rewardTokens = rewardTokensAndRates[i]
      .filter(([token, rate]) => rate !== '0')
      .map(([token]) => token.toLowerCase());
    return {
      pool: p,
      chain: utils.formatChain(chain),
      project: 'fvm-exchange',
      symbol: utils.formatSymbol(s.split('-')[1]),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [...new Set(rewardTokens)] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
      url: `https://www.fvm.exchange/liquidity/${p}`,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};
module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://www.fvm.exchange/liquidity',
};
