const sdk = require('@defillama/sdk');
const StakingABI = require('./staking_abi.json');
const BrcABI = require('./brc_abi.json');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const Web3 = require('web3');
const web3 = new Web3(process.env.ALCHEMY_CONNECTION_ARBITRUM);

const STAKING_CONTRACT = '0x9A28f7Ab9aEb4f14Fc4c580938F8F5E89ce98084';
const BRC = '0xB5de3f06aF62D8428a8BF7b4400Ea42aD2E0bc53';

const getPoolWeight = (stakePool) => { 
  switch (stakePool) {
    case 0:
      return 3;
    case 1:
      return 5;
    case 2:
      return 10;
    case 3:
      return 10;
    case 4:
      return 40;
    case 5:
      return 500;
    default:
      return 568;
  }
};

const BLOCKS_PER_MONTH = 199384;
const PoolNames = ['BRC_30Days', 'BRC_90Days', 'BRC_180Days', 'BRC_gBRC_30Days', 'BRC_gBRC_90Days', 'BRC_gBRC_180Days'];

const getAPR = async (pool) => {
  const stakingContract = new web3.eth.Contract(StakingABI, STAKING_CONTRACT);
  const brcContract = new web3.eth.Contract(BrcABI, BRC);

  const stakingBRCSupply = await brcContract.methods.balanceOf(STAKING_CONTRACT).call();
  const govBrincPerBlock = await stakingContract.methods.getGovBrincPerBlock().call();
  const brcStake = new BigNumber(await stakingContract.methods.getPoolSupply(pool).call());
  
  const govBrincPerMonth = new BigNumber(govBrincPerBlock).times(BLOCKS_PER_MONTH);
  const totalRewards = new BigNumber(govBrincPerMonth).times(getPoolWeight(pool)).div(getPoolWeight(100));
  return ((((totalRewards.div(brcStake).times(brcStake.div(stakingBRCSupply))).div(30)).times(365)).times(100)).times(1.8255);
}

const getAPY = async (pool) => {
  const apr = await getAPR(pool);
  switch (pool) {
    case 0:
      return (((new BigNumber(1).plus(new BigNumber(apr).div(100)).pow(12)).minus(1)).times(100));
    case 1:
      return (((new BigNumber(1).plus(new BigNumber(apr).div(100).times(3)).pow(4)).minus(1)).times(100));
    case 2:
      return (((new BigNumber(1).plus(new BigNumber(apr).div(100).times(6)).pow(2)).minus(1)).times(100));
    case 3:
      return (((new BigNumber(1).plus(new BigNumber(apr).div(100)).pow(12)).minus(1)).times(100));
    case 4:
      return (((new BigNumber(1).plus(new BigNumber(apr).div(100).times(3)).pow(4)).minus(1)).times(100));
    case 5:
      return (((new BigNumber(1).plus(new BigNumber(apr).div(100).times(6)).pow(2)).minus(1)).times(100));
    default:
      return 0;
  }
}


const getPools = async () => {
  let apys = [];

  for (let stakePool = 0; stakePool < 6; stakePool++) {
    const apy = await getAPY(stakePool);
    apys.push({
      tvl: 0,
      apy: apy.toString(),
      symbol: PoolNames[stakePool],
      poolId: 'Pool'+stakePool
    })
  }
  return apys;
} 

const buildPool = (entry) => {
  const newObj = {
    pool: entry.poolId,
    chain: 'arbitrum',
    project: 'brinc-finance',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: parseInt(entry.tvl, 10),
    apy: parseFloat(entry.apy),
  };
  return newObj;
};

async function main() {
    const pools = await getPools();
    console.log('pools', pools)
    const data = pools.map((pool) => buildPool(pool));
    return data;
}

module.exports = {
    timetravel: false,
    apy: main,
};
  