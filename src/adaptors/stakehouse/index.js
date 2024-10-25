const sdk = require('@defillama/sdk');
const utils = require('../utils');

const axios = require('axios');

const { ethers } = require('ethers');
const { request, gql } = require('graphql-request');

const getTvlPerLSD = async (response, ticker) => {
  let savETHPool = response[ticker][0].savETHPool,
    tvl = ethers.BigNumber.from('0');

  const protectedDeposits = response[`${ticker}_protectedDeposits`];
  const feesAndMevDeposits = response[`${ticker}_feesAndMevDeposits`];
  const nodeRunners = response[`${ticker}_nodeRunners`];

  if (protectedDeposits.length != 0 || feesAndMevDeposits.length != 0) {
    for (let i = 0; i < protectedDeposits.length; ++i) {
      tvl = tvl.add(ethers.BigNumber.from(protectedDeposits[i].totalDeposit));
    }
    for (let i = 0; i < feesAndMevDeposits.length; ++i) {
      tvl = tvl.add(ethers.BigNumber.from(feesAndMevDeposits[i].totalDeposit));
    }
    let nodeOperatorDeposit = ethers.BigNumber.from('0');
    for (let i = 0; i < nodeRunners.length; ++i) {
      for (let j = 0; j < nodeRunners[i].validators.length; ++j) {
        nodeOperatorDeposit = nodeOperatorDeposit.add(
          ethers.BigNumber.from('4000000000000000000')
        );
      }
    }
    tvl = tvl.add(nodeOperatorDeposit);
  }

  return { savETHPool, tvl };
};

const topLvl = async (chainString, url, underlying) => {
  const aprData = (await axios.get(url)).data;
  const tickers = Object.keys(aprData).map((index) => aprData[index].Ticker);

  const query = gql`
    query getDepositAmounts {
      ${tickers
        .map(
          (ticker) => `
        ${ticker}: liquidStakingNetworks(where: { ticker: "${ticker}" }) {
          savETHPool
          id
        }
        ${ticker}_protectedDeposits: protectedDeposits(
          where: {
            liquidStakingNetwork_: { ticker: "${ticker}" }
            validator_: { status_not_in: ["BANNED", "WITHDRAWN"] }
          }
        ) {
          totalDeposit
          liquidStakingNetwork {
            savETHPool
          }
        }
        ${ticker}_feesAndMevDeposits: feesAndMevDeposits(
          where: {
            liquidStakingNetwork_: { ticker: "${ticker}" }
            validator_: { status_not_in: ["BANNED", "WITHDRAWN"] }
          }
        ) {
          totalDeposit
          liquidStakingNetwork {
            savETHPool
          }
        }
        ${ticker}_nodeRunners: nodeRunners(
          where: {
            liquidStakingNetworks_: { ticker: "${ticker}" }
            validators_: { status_not_in: ["BANNED", "WITHDRAWN"] }
          }
        ) {
          validators(where: { status_not: "BANNED" }) {
            id
          }
        }
      `
        )
        .join('\n')}
    }
  `;

  const response = await request(
    sdk.graph.modifyEndpoint('8hFX42Mcd6JMXLz7gnP5zenpoWkr6bye89n1zCWKBXoz'),
    query
  );

  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethUSDPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  let apyList = [],
    tvlUsd;
  let totalApy = 0,
    noOfActiveLSDs = 0;
  let totalTvl = 0;

  for (let i = 0; i < tickers.length; ++i) {
    const ticker = tickers[i];
    const result = await getTvlPerLSD(response, ticker);
    tvlUsd = ethers.utils.formatEther(result.tvl.toString()) * ethUSDPrice;

    if (tvlUsd > 0) {
      apyList.push({
        pool: `${result.savETHPool}-${chainString}`.toLowerCase(),
        chain: utils.formatChain(chainString),
        project: 'stakehouse',
        symbol: utils.formatSymbol(Object.values(aprData)[i].Ticker),
        tvlUsd: tvlUsd,
        apyBase: Number(Object.values(aprData)[i].APR),
        underlyingTokens: [underlying],
      });

      totalTvl += tvlUsd;
      if (Number(Object.values(aprData)[i].APR) > 0) {
        totalApy += Number(Object.values(aprData)[i].APR);
        noOfActiveLSDs += 1;
      }
    }
  }

  // The average APY for all LSDs
  apyList.push({
    pool: `0x3d1E5Cf16077F349e999d6b21A4f646e83Cd90c5-${chainString}`.toLowerCase(),
    chain: utils.formatChain(chainString),
    project: 'stakehouse',
    symbol: 'dETH',
    tvlUsd: totalTvl,
    apyBase: totalApy / noOfActiveLSDs,
    underlyingTokens: [underlying],
  });

  return apyList;
};

const main = async () => {
  const data = await topLvl(
    'ethereum',
    'https://etl.joinstakehouse.com/lsdWisePerformance',
    '0x0000000000000000000000000000000000000000'
  );

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://joinstakehouse.com/',
};
