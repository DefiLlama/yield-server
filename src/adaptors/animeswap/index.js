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
const zusdcCoinName = '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC';

async function getPricePerLPCoin(coinX, coinY, ledgerVersion) {
  const [lp, lpCoinInfo] = await Promise.all([
    utils.getData(`${NODE_URL}/accounts/${POOL_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeSwapPoolV1::LiquidityPool<${coinX},${coinY}>?ledger_version=${ledgerVersion}`),
    utils.getData(`${NODE_URL}/accounts/${POOL_ADDRESS}/resource/0x1::coin::CoinInfo<${POOL_ADDRESS}::LPCoinV1::LPCoin<${coinX},${coinY}>>?ledger_version=${ledgerVersion}`),
  ])

  const lpSupply = lpCoinInfo.data.supply.vec[0].integer.vec[0].value // lp total supply
  return BigNumber(lp.data.coin_x_reserve.value)
    .multipliedBy(lp.data.coin_y_reserve.value)
    .sqrt()
    .div(lpSupply)
}

async function main() {
  const [aptPrice, coinInfo, coinInfoAPTzUDSC, swapPool, swapPoolAPTzUDSC, aniPoolInfo, lpPoolInfo, lpPoolInfoAPTzUDSC, mcData, ledgerInfo] = await Promise.all([
    utils.getData(`${COINS_LLAMA_PRICE_URL}${aptosCoinName}`),
    utils.getData(`${NODE_URL}/accounts/${POOL_ADDRESS}/resource/0x1::coin::CoinInfo<${POOL_ADDRESS}::LPCoinV1::LPCoin<${aptCoinName},${aniCoinName}>>`),
    utils.getData(`${NODE_URL}/accounts/${POOL_ADDRESS}/resource/0x1::coin::CoinInfo<${POOL_ADDRESS}::LPCoinV1::LPCoin<${aptCoinName},${zusdcCoinName}>>`),
    utils.getData(`${NODE_URL}/accounts/${POOL_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeSwapPoolV1::LiquidityPool<${aptCoinName},${aniCoinName}>`),
    utils.getData(`${NODE_URL}/accounts/${POOL_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeSwapPoolV1::LiquidityPool<${aptCoinName},${zusdcCoinName}>`),
    utils.getData(`${NODE_URL}/accounts/${STAKING_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeMasterChefV1::PoolInfo<${aniCoinName}>`),
    utils.getData(`${NODE_URL}/accounts/${STAKING_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeMasterChefV1::PoolInfo<${POOL_ADDRESS}::LPCoinV1::LPCoin<${aptCoinName},${aniCoinName}>>`),
    utils.getData(`${NODE_URL}/accounts/${STAKING_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeMasterChefV1::PoolInfo<${POOL_ADDRESS}::LPCoinV1::LPCoin<${aptCoinName},${zusdcCoinName}>>`),
    utils.getData(`${NODE_URL}/accounts/${STAKING_ADDRESS}/resource/${DEPLOYER_ADDRESS}::AnimeMasterChefV1::MasterChefData`),
    utils.getData(`${NODE_URL}/`),
  ]);

  const YEAR_S = 365 * 86400;

  // calculate ANI staking
  // ANI
  const stakedANI = aniPoolInfo.data.coin_reserve.value;
  const interestANI = BigNumber(mcData.data.per_second_ANI)
    .multipliedBy(aniPoolInfo.data.alloc_point)
    .div(mcData.data.total_alloc_point)
    .multipliedBy(BigNumber(100).minus(mcData.data.dao_percent))
    .div(100)
    .multipliedBy(YEAR_S);
  const aprANIReward = interestANI
    .div(stakedANI)
    .multipliedBy(100)
    .toNumber();

  const tvlUsdStakeAni = BigNumber(stakedANI)
    .multipliedBy(swapPool.data.coin_x_reserve.value)
    .div(swapPool.data.coin_y_reserve.value)
    .multipliedBy(aptPrice.coins[aptosCoinName].price)
    .div(DECIMALS)
    .toNumber();

  // APT-ANI
  const lpSupply = coinInfo.data.supply.vec[0].integer.vec[0].value;
  const stakedLP = lpPoolInfo.data.coin_reserve.value;
  const interestANI2 = BigNumber(mcData.data.per_second_ANI)
    .multipliedBy(lpPoolInfo.data.alloc_point)
    .div(mcData.data.total_alloc_point)
    .multipliedBy(BigNumber(100).minus(mcData.data.dao_percent))
    .div(100)
    .multipliedBy(YEAR_S);
  const lpCoinValue2ANI = BigNumber(stakedLP)
    .div(lpSupply)
    .multipliedBy(swapPool.data.coin_y_reserve.value)
    .multipliedBy(2);
  const aprLPCoinReward = interestANI2
    .div(lpCoinValue2ANI)
    .multipliedBy(100)
    .toNumber();

  const tvlUsdLPCoin = lpCoinValue2ANI
    .multipliedBy(swapPool.data.coin_x_reserve.value)
    .div(swapPool.data.coin_y_reserve.value)
    .multipliedBy(aptPrice.coins[aptosCoinName].price)
    .div(DECIMALS)
    .toNumber();

  // APT-zUSDC
  const lpSupplyAPTzUDSC = coinInfoAPTzUDSC.data.supply.vec[0].integer.vec[0].value;
  const stakedLPAPTzUDSC = lpPoolInfoAPTzUDSC.data.coin_reserve.value;
  const interestANI3 = BigNumber(mcData.data.per_second_ANI)
    .multipliedBy(lpPoolInfoAPTzUDSC.data.alloc_point)
    .div(mcData.data.total_alloc_point)
    .multipliedBy(BigNumber(100).minus(mcData.data.dao_percent))
    .div(100)
    .multipliedBy(YEAR_S);
  const lpCoinAPTzUDSCValue2ANI = BigNumber(stakedLPAPTzUDSC)
    .div(lpSupplyAPTzUDSC)
    .multipliedBy(swapPoolAPTzUDSC.data.coin_x_reserve.value)
    .multipliedBy(swapPool.data.coin_y_reserve.value)
    .div(swapPool.data.coin_x_reserve.value)
    .multipliedBy(2);
  const aprLPCoinAPTzUDSCReward = interestANI3
    .div(lpCoinAPTzUDSCValue2ANI)
    .multipliedBy(100)
    .toNumber();

  const tvlAPTzUDSCUsdLPCoin = lpCoinAPTzUDSCValue2ANI
    .multipliedBy(swapPool.data.coin_x_reserve.value)
    .div(swapPool.data.coin_y_reserve.value)
    .multipliedBy(aptPrice.coins[aptosCoinName].price)
    .div(DECIMALS)
    .toNumber();

  // calculate pool apy base
  const currentLedgerVersion = BigNumber(ledgerInfo.ledger_version);
  const queryLedgerVersion = currentLedgerVersion.minus(1e6);
  const currentTimestamp = ledgerInfo.ledger_timestamp;
  const [currentPricePerLPCoin, queryPricePerLPCoin, currentPricePerLPCoinAPTzUDSC, queryPricePerLPCoinAPTzUDSC, queryTx] = await Promise.all([
    getPricePerLPCoin(aptCoinName, aniCoinName, currentLedgerVersion),
    getPricePerLPCoin(aptCoinName, aniCoinName, queryLedgerVersion),
    getPricePerLPCoin(aptCoinName, zusdcCoinName, currentLedgerVersion),
    getPricePerLPCoin(aptCoinName, zusdcCoinName, queryLedgerVersion),
    utils.getData(`${NODE_URL}/transactions/by_version/${queryLedgerVersion}`),
  ]);
  const deltaTimestamp = BigNumber(currentTimestamp)
    .minus(queryTx.timestamp)
    .div(1e6);
  const apyLPCoinBase = currentPricePerLPCoin
    .minus(queryPricePerLPCoin)
    .div(queryPricePerLPCoin)
    .multipliedBy(YEAR_S)
    .div(deltaTimestamp)
    .multipliedBy(100)
    .toNumber();
  const apyLPCoinAPTzUDSCBase = currentPricePerLPCoinAPTzUDSC
    .minus(queryPricePerLPCoinAPTzUDSC)
    .div(queryPricePerLPCoinAPTzUDSC)
    .multipliedBy(YEAR_S)
    .div(deltaTimestamp)
    .multipliedBy(100)
    .toNumber();

  return [
    {
      pool: `${STAKING_ADDRESS}-StakeANI-aptos`,
      chain: utils.formatChain('Aptos'),
      project: 'animeswap',
      symbol: utils.formatSymbol('ANI'),
      tvlUsd: tvlUsdStakeAni,
      apyReward: aprANIReward,
      rewardTokens: [aniCoinName],
      poolMeta: 'Stake ANI',
    },
    {
      pool: `${STAKING_ADDRESS}-APT-ANI-aptos`,
      chain: utils.formatChain('Aptos'),
      project: 'animeswap',
      symbol: utils.formatSymbol('APT-ANI'),
      tvlUsd: tvlUsdLPCoin,
      apyBase: apyLPCoinBase,
      apyReward: aprLPCoinReward,
      rewardTokens: [aniCoinName],
    },
    {
      pool: `${STAKING_ADDRESS}-APT-zUSDC-aptos`,
      chain: utils.formatChain('Aptos'),
      project: 'animeswap',
      symbol: utils.formatSymbol('APT-zUSDC'),
      tvlUsd: tvlAPTzUDSCUsdLPCoin,
      apyBase: apyLPCoinAPTzUDSCBase,
      apyReward: aprLPCoinAPTzUDSCReward,
      rewardTokens: [aniCoinName],
    },
  ];
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.animeswap.org/#/pool?chain=aptos',
};
