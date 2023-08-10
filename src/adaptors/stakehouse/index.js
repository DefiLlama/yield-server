const utils = require('../utils');

const axios = require('axios');

const { ethers } = require('ethers');
const { request, gql } = require('graphql-request');

const getTvlPerLSD = async (ticker) => {

    const query = gql`
    query getDepositAmount($ticker:String!) {
      liquidStakingNetworks(where:{ticker:$ticker}){
        savETHPool
        id
      }
      protectedDeposits(where:{liquidStakingNetwork_:{ticker:$ticker},validator_:{status_not_in:["BANNED","WITHDRAWN"]}}){
        totalDeposit
        liquidStakingNetwork{
          savETHPool
        }
      }
      feesAndMevDeposits(where:{liquidStakingNetwork_:{ticker:$ticker},validator_:{status_not_in:["BANNED","WITHDRAWN"]}}){
        totalDeposit
        liquidStakingNetwork{
          savETHPool
        }
      }
      nodeRunners(where:{liquidStakingNetworks_:{ticker:$ticker},validators_:{status_not_in:["BANNED","WITHDRAWN"]}}){
        validators(where:{status_not:"BANNED"}){
          id
        }
      }
    }
  `
  
  const response = await request(
    "https://api.thegraph.com/subgraphs/name/stakehouse-dev/lsd",
    query,
    {
      ticker: ticker
    }
  )

  let savETHPool = response.liquidStakingNetworks[0].savETHPool, tvl = ethers.BigNumber.from("0");
  if (response.protectedDeposits.length != 0 || response.feesAndMevDeposits.length != 0){
    for (let i=0; i<response.protectedDeposits.length; ++i) {
      tvl = tvl.add(ethers.BigNumber.from(response.protectedDeposits[i].totalDeposit));
    }
    let feesAndMevtotalDeposit = ethers.BigNumber.from("0");
    for (let i=0; i<response.feesAndMevDeposits.length; ++i) {
      tvl = tvl.add(ethers.BigNumber.from(response.feesAndMevDeposits[i].totalDeposit));
      feesAndMevtotalDeposit = feesAndMevtotalDeposit.add(ethers.BigNumber.from(response.feesAndMevDeposits[i].totalDeposit));
    }
    let nodeOperatorDeposit = ethers.BigNumber.from("0");
    for (let i=0; i<response.nodeRunners.length; ++i) {
      for (let j=0; j<response.nodeRunners[i].validators.length; ++j) {
        nodeOperatorDeposit = nodeOperatorDeposit.add(ethers.BigNumber.from("4000000000000000000"));
      }
    }
    tvl = tvl.add(nodeOperatorDeposit);
  }

  return {savETHPool, tvl};
}

const topLvl = async (chainString, url, underlying) => {

  const aprData = (await axios.get(url)).data;
  let promiseArray = [];
  for (let i=0; i<Object.keys(aprData).length; ++i) {
    let index = Object.keys(aprData)[i];
    promiseArray.push(getTvlPerLSD(aprData[index].Ticker))
  }

  const ethUSDPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/ethereum:0x0000000000000000000000000000000000000000`)
  ).data;

  ethUsd = ethUSDPrice.coins['ethereum:0x0000000000000000000000000000000000000000'].price;

  let apyList = [], tvlUsd;
  await Promise.allSettled(promiseArray).then(
    async (result) => {
      for (let i=0; i<result.length; ++i) {
        tvlUsd = ethers.utils.formatEther((result[i].value.tvl).toString())*ethUsd

        if (result[i].status == 'fulfilled') {
          tvlUsd = ethers.utils.formatEther((result[i].value.tvl).toString())*ethUsd
          apyList.push({
            pool: `${result[i].value.savETHPool}-${chainString}`.toLowerCase(),
            chain: utils.formatChain(chainString),
            project: 'stakehouse',
            symbol: utils.formatSymbol(Object.values(aprData)[i].Ticker),
            tvlUsd: tvlUsd,
            apyBase: Number(Object.values(aprData)[i].APR),
            underlyingTokens: [underlying],
          })
        }
        else {
          apyList.push({
            pool: "",
            chain: utils.formatChain(chainString),
            project: 'stakehouse',
            symbol: utils.formatSymbol(Object.values(aprData)[i].Ticker),
            tvlUsd: ethers.BigNumber.from("0"),
            apyBase: Number(Object.values(aprData)[i].APR),
            underlyingTokens: [underlying],
          })
        }
      }
    }
  )
  return apyList;
};

const main = async () => {
  const data = await topLvl (
    'ethereum',
    "https://etl.joinstakehouse.com/lsdWisePerformance",
    '0x0000000000000000000000000000000000000000'
  )

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://joinstakehouse.com/',
};
