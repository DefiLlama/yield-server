// documentation:
// https://wiki.sovryn.com/en/technical-documents/amm/AMM-FAQ
// https://wiki.sovryn.com/en/sovryn-dapp/lending

const utils = require('../utils');
const { tokensPool, tokensLending } = require('./address');
const { request, gql } = require('graphql-request');
const subgraphUrl = 'https://subgraph.sovryn.app/subgraphs/name/DistributedCollective/sovryn-subgraph';
const tokenPriceQuery = gql`
  query getTokenRates {
    tokens {
      id
      symbol
      lastPriceBtc
      lastPriceUsd
    }
  }
  `;

const getApy = async () => {
  const dataPool = [];
  const amm_pools_data = await utils.getData(`https://amm-apy.sovryn.app/amm`); // see https://github.com/DistributedCollective/sovryn-amm-apy
  const { tvlAmm, tvlLending } = await utils.getData('https://graph-wrapper.sovryn.app/cmc/tvl'); //see https://github.com/DistributedCollective/Sovryn-graph-wrapper
  const token_prices = await request(subgraphUrl, tokenPriceQuery, {});
  const data = await Promise.all(
    Object.keys(tokensPool).map(async (k) => {
      var symbol = String(tokensPool[k]);
      var pool_id = String(k.toLowerCase());
      var tvlUsd = await getTvl(tvlAmm, 1, pool_id);
      var apyData = amm_pools_data[k].data;
      var apyDataArray = apyData[Object.keys(apyData)[0]];
      var apy = apyDataArray[apyDataArray.length - 1];
      dataPool.push({
        pool: pool_id,
        chain: utils.formatChain('Rootstock'),
        project: 'sovryn-dex',
        tvlUsd: tvlUsd,
        symbol: symbol,
        apyBase: Number(apy.APY_fees_pc),
        apyReward: Number(apy.APY_rewards_pc),
        url: 'https://alpha.sovryn.app/yield-farm',
        rewardTokens: ['0xefc78fc7d48b64958315949279ba181c2114abbd'],
      });
    })
  );

  const dataLend = await Promise.all(
    Object.keys(tokensLending).map(async (k) => {
      var symbol = String(tokensLending[k]);
      var id = String(k.toLowerCase());
      var { tvlUsd, asset } = await getTvl(tvlLending, 0, id);
      var asset_price = await getTokenPrice(token_prices, asset);
      var apyData = await utils.getData(`https://graph-wrapper.sovryn.app/lendingApy/` + id);//see https://github.com/DistributedCollective/Sovryn-graph-wrapper
      var apyDataArray = apyData[Object.keys(apyData)[0]];
      var apy = apyData[apyData.length - 1];
      var totalSupplyUsd = Number(apy.supply) * asset_price;
      var totalBorrowUsd = totalSupplyUsd - tvlUsd;
      dataPool.push({
        pool: id,
        chain: utils.formatChain('Rootstock'),
        project: 'sovryn-dex',
        tvlUsd: tvlUsd,
        symbol: symbol,
        apyBase: Number(apy.supply_apr),
        apyBaseBorrow: Number(apy.borrow_apr),
        totalSupplyUsd: totalSupplyUsd,
        totalBorrowUsd: totalBorrowUsd,
        url: 'https://alpha.sovryn.app/lend',
      });
    })
  );

  return dataPool;
};

const getTokenPrice = async (object, asset) => {
  const price = [];
  await Promise.all(
    Object.entries(object.tokens).map(async (k) => {
      if (k[1].id == asset) {
        price.push(k[1].lastPriceUsd);
      }
    })
  );
  const priceUsd = Number(price[0]);
  return priceUsd;



}

const getTvl = async (tvl, type, id) => {
  const tvlData = [];
  const assets = [];
  if (type == 1) {
    await Promise.all(
      Object.entries(tvl).map(async (k) => {
        if (k[1].contract == id) {
          tvlData.push(k[1].balanceUsd);
        }
      })
    );
    const tvlPoolUsd = Number(tvlData[0]) + Number(tvlData[1]);
    return tvlPoolUsd;
  }
  else {
    await Promise.all(
      Object.entries(tvl).map(async (k) => {
        if (k[1].contract == id) {
          tvlData.push(k[1].balanceUsd);
          assets.push(k[1].asset);

        }

      })
    );
    const tvlUsd = Number(tvlData[0]);
    const asset = (assets[0]);
    return { tvlUsd, asset };

  }
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://alpha.sovryn.app',
};
