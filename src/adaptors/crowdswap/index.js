const utils = require('../utils');
const data = require('./farms');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const BigNumber = require('bignumber.js');

const abi = [{
  "inputs": [
    {
      "internalType": "address",
      "name": "account",
      "type": "address"
    }
  ],
  "name": "balanceOf",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
},
{
  "inputs": [],
  "name": "rewardRate",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
},
];

async function getTvl(pair,liquidity, baseTokenPrice ,tokenB, chainString){
  const totalSupply = (await sdk.api.erc20.totalSupply({ target: pair, chain: chainString })).output;
  const balance = (await sdk.api.erc20.balanceOf({
    target: tokenB.address,
    owner: pair,
    chain: chainString
  })).output;
  const baseTokenAmount = BigNumber(liquidity).times(balance).div(totalSupply).div(10 ** tokenB.decimals);
  return baseTokenAmount * baseTokenPrice * 2;   
}

function getApy(rewardRate, rewardPrice,tvl,multiplier) {
  const dailyReward = (+rewardRate / 10 ** 18 / 10 ** multiplier) * 24 * 3600;
  const apr =  ((dailyReward * rewardPrice)  / (tvl / 100)) * 365;
  return utils.aprToApy(apr);
}

const main = async () => {
    let poolList;

    for(const item of Object.values(data.Farms)){      
        const balanceOfAbi = abi.find((abi) => abi.name === 'balanceOf');
        const farmLiquidity = (await sdk.api.abi.multiCall({
            abi:balanceOfAbi,
            calls:item.map(a=>{return {target: a.pairAddress, params :  a.farmAddress}}),
            chain:item[0].chainString,
          })).output;

          const baseTokenPrices = await utils.getPrices(item.map(a=>{return a.tokenB.address}),item[0].chainString);

          const promises = [];

          for (let i = 0; i < farmLiquidity.length; i++) {
            const promise = getTvl(item[i].pairAddress,farmLiquidity[i].output,baseTokenPrices.pricesByAddress[item[i].tokenB.address.toLowerCase()],item[i].tokenB,item[0].chainString)
              .then(response => response);
            promises.push(promise);
          }
          
          await Promise.all(promises).then(results => {
            poolList = results.map(item=>{ return {tvlUsd:item}})
          });

          const rewardTokenPrices = await utils.getPrices(item.map(a=>{return a.rewardToken.address}),item[0].chainString);


          const rewardRateAbi = abi.find((abi) => abi.name === 'rewardRate');
          const rewardRate = (await sdk.api.abi.multiCall({
            abi:rewardRateAbi,
            calls:item.map(a=>{return {target: a.farmAddress}}),
            chain:item[0].chainString,
          })).output;

          for (let i = 0; i < rewardRate.length; i++) {
            poolList[i]['apyReward'] = getApy(rewardRate[i].output,rewardTokenPrices.pricesByAddress[item[i].rewardToken.address.toLowerCase()],poolList[i].tvlUsd,item[i].multiplier);
            poolList[i]['symbol'] = item[i].assets;
            poolList[i]['chain'] = item[i].chainString;
            poolList[i]['project'] = 'crowdswap';
            poolList[i]['pool'] = item[i].farmAddress;
            poolList[i]['rewardTokens'] = [item[i].rewardToken.address];
          }
    }
    return poolList;
  };

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://app.crowdswap.org/opportunity'
  };