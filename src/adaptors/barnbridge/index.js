const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const abi = require('./abi.js');
const utils = require('../utils');

const URL = 'https://api.thegraph.com/subgraphs/name/barnbridge/bb-sy-graph';

const SMART_YIELD = '0xa0b3d2AF5a37CDcEdA1af38b58897eCB30Feaa1A';

const termsQuery = () => {
  const now = Math.floor(Date.now() / 1000);

  return gql`
    {
      terms(where: { start_lte: ${now}, end_gt: ${now} }) {
        id
        assetName
        assetSymbol
        assetDecimals
        underlying
        underlyingName
        underlyingSymbol
        underlyingDecimals
        active
        start
        end
        feeRate
        realizedYield
        depositedAmount
        nextTerm {
          id
        }
      }
    }
  `;
};

const LIQUIDITY_QUERY = gql`
  {
    contracts(where: { id: "SmartYield" }) {
      id
      liquidity
    }
  }
`;

const getAssetUsdPrice = async (asset) => {
  const key = `ethereum:${asset}`;
  const assetPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;

  return assetPriceUSD;
};

const earnedYield = async (terms, termId) => {
  const nextTerm = terms.find(
    (t) => t.nextTerm && t.nextTerm.id.toLowerCase() === termId.toLowerCase()
  );

  if (nextTerm) {
    const currentRealizedYield = (
      await sdk.api.abi.call({
        target: SMART_YIELD,
        abi: abi.find((i) => i.name === '_currentRealizedYield'),
        chain: 'ethereum',
      })
    ).output;

    const _earnedYield =
      Number(currentRealizedYield) / `1e${terms[0].assetDecimals}`;

    return _earnedYield;
  }

  return 0;
};

const apyBase = (term, earnedYield) => {
  const userDeposits = Number(term.depositedAmount) / `1e${term.assetDecimals}`;

  const timeDifference = +term.end - +term.start;
  const timeInYear = 60 * 60 * 24 * 365;
  const fee = Number(term.feeRate) / 10000;

  const numberOfPeriods = timeDifference / timeInYear;

  const totalFee = (fee / numberOfPeriods) * 100;

  const totalRealizedYield = yieldToBeDistributed(term, earnedYield);
  const apy =
    Number(userDeposits) === 0
      ? 0
      : (Number(totalRealizedYield) / Number(userDeposits) / timeDifference) *
        timeInYear *
        100;

  return apy - totalFee;
};

const yieldToBeDistributed = (term, earnedYield) => {
  const realizedYield = Number(term.realizedYield) / `1e${term.assetDecimals}`;

  return realizedYield + earnedYield;
};

const apy = async () => {
  const { terms } = await request(URL, termsQuery());
  const { contracts } = await request(URL, LIQUIDITY_QUERY);

  const assets = [...new Set(terms.map((term) => term.underlying))];

  const assetAndUsdPrices = await Promise.all(
    assets.map(async (asset) => [asset, await getAssetUsdPrice(asset)])
  );

  const assetUsdPrices = Object.fromEntries(assetAndUsdPrices);

  const pools = await Promise.all(
    terms.map(async (term) => {
      const tvlUsd =
        (term.depositedAmount * assetUsdPrices[term.underlying]) /
          `1e${term.underlyingDecimals}` +
        (contracts[0].liquidity * assetUsdPrices[term.underlying]) /
          `1e${term.underlyingDecimals}`;

      const _earnedYield = await earnedYield(terms, term.id);

      return {
        pool: `${term.id}`.toLowerCase(),
        chain: 'ethereum',
        project: 'barnbridge',
        symbol: 'DAI',
        poolMeta: term.assetName,
        tvlUsd,
        apyBase: apyBase(term, _earnedYield),
        underlyingTokens: [term.underlying],
        url: `https://app.barnbridge.com/fixed-yield/pools/${term.id}/`,
      };
    })
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.barnbridge.com/fixed-yield/pools/',
};
