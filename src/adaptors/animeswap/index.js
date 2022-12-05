const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const DEPLOYER_ADDRESS = '0x16fe2df00ea7dde4a63409201f7f4e536bde7bb7335526a35d05111e68aa322c';
const STAKING_ADDRESS = '0x8615f5671592532631e56c76ca09d332fae1cd03d463bc379eec1007973966ef';
const POOL_ADDRESS = '0x796900ebe1a1a54ff9e932f19c548f5c1af5c6e7d34965857ac2f7b1d1ab2cbf';
const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const COINS_LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/';
const DECIMALS = 1e8;

const aptosCoinName = 'coingecko:aptos';
const aptCoinName = '0x1::aptos_coin::AptosCoin';
const aniCoinName = `${DEPLOYER_ADDRESS}::AnimeCoin::ANI`;

async function main() {
  const [aptPrice, coinInfo, swapPool, aniPoolInfo, mcData] = await Promise.all([
    utils.getData(`${COINS_LLAMA_PRICE_URL}${aptosCoinName}`),
    utils.getData(`${NODE_URL}/accounts/${POOL_ADDRESS}/resource/0x1::coin::CoinInfo<${POOL_ADDRESS}::LPCoinV1::LPCoin<${aptCoinName},${aniCoinName}>>`),
    utils.getData(`${NODE_URL}/accounts/${POOL_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeSwapPoolV1::LiquidityPool<${aptCoinName},${aniCoinName}>`),
    utils.getData(`${NODE_URL}/accounts/${STAKING_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeMasterChefV1::PoolInfo<${aniCoinName}>`),
    utils.getData(`${NODE_URL}/accounts/${STAKING_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeMasterChefV1::MasterChefData`),
  ]);

  const YEAR_S = 365 * 86400;

  const lpSupply = coinInfo.data.supply.vec[0].integer.vec[0].value;
  const stakedANI = aniPoolInfo.data.coin_reserve.value;
  const interestANI = BigNumber(mcData.data.per_second_ANI)
    .multipliedBy(aniPoolInfo.data.alloc_point)
    .div(mcData.data.total_alloc_point)
    .multipliedBy(BigNumber(100).minus(mcData.data.dao_percent))
    .div(100)
    .multipliedBy(YEAR_S);
  const apr = interestANI
    .div(stakedANI)
    .multipliedBy(100)
    .toNumber();
  const apy = utils.aprToApy(apr);

  const tvlUsd = BigNumber(stakedANI)
    .multipliedBy(swapPool.data.coin_x_reserve.value)
    .div(swapPool.data.coin_y_reserve.value)
    .multipliedBy(aptPrice.coins[aptosCoinName].price)
    .div(DECIMALS)
    .toNumber();

  return [
    {
      pool: `${STAKING_ADDRESS}-aptos`,
      chain: utils.formatChain('Aptos'),
      project: 'animeswap',
      symbol: utils.formatSymbol('ANI'),
      tvlUsd: tvlUsd,
      apy: apy,
    },
  ];
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.animeswap.org/#/pool?chain=aptos',
};
