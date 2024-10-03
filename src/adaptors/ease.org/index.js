const utils = require('../utils');
const { Web3 } = require('web3');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
require('dotenv').config({ path: './config.env' });
const bribePotAbi = require('./bribePotAbi.json');
const web3 = new Web3('https://rpc.ankr.com/eth');

const bribePotAddress = '0xEA5EdeF17C9be57228389962ba50b98397f1E28C';
const easeTokenAddress = '0xEa5eDef1287AfDF9Eb8A46f9773AbFc10820c61c';

const gvEase = async () => {
  const bribePotContract = new web3.eth.Contract(bribePotAbi, bribePotAddress);

  const totalSupply = await bribePotContract.methods.totalSupply().call();

  const genesis = await bribePotContract.methods.genesis().call();
  const currentTimeStamp = (await web3.eth.getBlock('latest')).timestamp;
  const currentWeek = Math.floor(
    (currentTimeStamp - genesis) / (60 * 60 * 24 * 7)
  );
  const nextWeek = currentWeek + 1;

  // 212 is the slot for the bribeRates mapping
  const mappingKey = web3.utils.soliditySha3(
    { type: 'uint256', value: nextWeek },
    { type: 'uint256', value: 212 }
  );
  const bribeRates = await web3.eth.getStorageAt(bribePotAddress, mappingKey);
  // splice StartAmt and ExpireAmt from bribeRates response
  const rateStartAmtHex = web3.utils.padLeft(bribeRates.slice(0, 34), 64);
  const rateStartAmt = web3.eth.abi.decodeParameter('uint256', rateStartAmtHex);
  const rateExpireAmtHex = web3.utils.padLeft(
    '0x' + bribeRates.slice(34, 67),
    64
  );
  const rateExpireAmt = web3.eth.abi.decodeParameter(
    'uint256',
    rateExpireAmtHex
  );

  // calc how many bribes will be distributed next week
  const bribePerCurrWeek = await bribePotContract.methods.bribePerWeek().call();
  let bribePerNextWeek = parseInt(bribePerCurrWeek);
  bribePerNextWeek = bribePerNextWeek - parseInt(rateStartAmt);
  bribePerNextWeek = bribePerNextWeek + parseInt(rateExpireAmt);

  const weeklyYield = bribePerNextWeek / totalSupply;
  const x = 1 + weeklyYield;
  const estApy = (Math.pow(x, 52) - 1) * 100;

  const defillamaPooldata = [];

  // calc tvl of gvEase lease
  const priceKey = 'coingecko:ease';
  const easePrice = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).body.coins[priceKey]?.price;

  // This is an approximation. Currently, tvlUsd represents the lowest possible TVL with the given gvEase stake.
  const leaseTvlUsd = (web3.utils.fromWei(totalSupply) / 2) * easePrice;
  const bribeTvl = web3.utils.fromWei(
    (
      await sdk.api.erc20.balanceOf({
        target: easeTokenAddress,
        owner: bribePotAddress,
      })
    ).output
  );
  const bribeTvlUsd = bribeTvl * easePrice;
  const tvlUsd = leaseTvlUsd + bribeTvlUsd;

  defillamaPooldata.push({
    pool: (bribePotAddress + '-ethereum').toLowerCase(),
    chain: 'Ethereum',
    project: 'ease.org',
    symbol: 'gvEase',
    tvlUsd,
    apyBase: estApy,
    apyReward: 0,
    rewardTokens: ['0xEa5eDef1287AfDF9Eb8A46f9773AbFc10820c61c'],
    underlyingTokens: ['0xEa5eDef1287AfDF9Eb8A46f9773AbFc10820c61c'],
  });
  return defillamaPooldata;
};

module.exports = {
  timetravel: false,
  apy: gvEase,
  url: 'https://app.ease.org/gv-dashboard',
};
