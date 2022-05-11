const Web3 = require('web3');
const sdk = require("@defillama/sdk");
const { default: BigNumber } = require("bignumber.js");
const utils = require('../utils');
const abi = require('./abis/abi.json');
const AladdinConvexVaultABI = require('./abis/AladdinConvexVault.json')
const AladdinCRVABI = require('./abis/AladdinCRV.json')
const curvePools = require('./pools.js');


const convexVault = '0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8';
const convexVaultAcrv = '0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884';
const cvxcrvAddress = '0x62b9c7356a2dc64a1969e19c23e4f579f9810aa7';


const crvAddress = '0xD533a949740bb3306d119CC777fa900bA034cd52';
const cvxAddress = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';

const replacements = [
  "0x99d1Fa417f94dcD62BfE781a1213c092a47041Bc",
  "0x9777d7E2b60bB01759D0E2f8be2095df444cb07E",
  "0x1bE5d71F2dA660BFdee8012dDc58D024448A0A59",
  "0x16de59092dAE5CcF4A1E6439D611fd0653f0Bd01",
  "0xd6aD7a6750A7593E092a9B218d66C0A814a3436e",
  "0x83f798e925BcD4017Eb265844FDDAbb448f1707D",
  "0x73a052500105205d34Daf004eAb301916DA8190f"
]
const replacePrice = [
  { address: '0x0000000000000000000000000000000000000000', token: 'ethereum' },
  { address: '0xFEEf77d3f69374f66429C91d732A244f074bdf74', token: 'frax-share' }
]
// const web3 = new Web3("https://eth-mainnet.alchemyapi.io/v2/NYoZTYs7oGkwlUItqoSHJeqpjqtlRT6m");

// const boosterBoosterContract = new web3.eth.Contract(
//   BoosterABI,
//   convexVault
// );

// const convexVaultContract = new web3.eth.Contract(
//   AladdinConvexVaultABI,
//   convexVault
// );

// const convexVaultAcrvContract = new web3.eth.Contract(
//   AladdinCRVABI,
//   convexVaultAcrv
// );

const getAllPools = async () => {
  // const poolStatsCrv = await curve.curvePoolStats();
  // console.log('poolStatsCrv---', poolStatsCrv)
  let dataApy = await utils.getData(
    'http://concentrator-api.aladdin.club/apy/'
  );


  // console.log('dataApy---', dataApy)
  const poolLength = (await sdk.api.abi.call({
    target: convexVault,
    abi: abi.poolLength
  })).output;
  // console.log("poolLength---", poolLength)


  return await Promise.all([...Array(Number(poolLength)).keys()].map(async i => {
    // console.log("poolInfo---1", poolInfo, poolInfo["stash"]);

    const poolInfo = await sdk.api.abi.call({
      target: convexVault,
      abi: AladdinConvexVaultABI.poolInfo,
      params: [i]
    });

    // console.log("poolInfo.output.lpToken----", poolInfo.output.lpToken)

    // console.log("pricesUSD1---1", pricesUSD1);

    // console.log("poolInfo---1", poolInfo, poolInfo["stash"]);
    const lpTokenSupply = await sdk.api.erc20.totalSupply({
      target: poolInfo.output.lpToken
    })

    // console.log("poolData---2", lpTokenSupply);

    const poolData = curvePools.find(crvPool => crvPool.addresses.lpToken.toLowerCase() === poolInfo.output.lpToken.toLowerCase())
    // console.log("poolData---2", poolData);
    const swapAddress = poolData.addresses.swap

    const coinCalls = [...Array(Number(poolData.coins.length)).keys()].map(num => {
      return {
        target: swapAddress,
        params: [num]
      }
    });

    const coinsUint = sdk.api.abi.multiCall({
      abi: abi.coinsUint,
      calls: coinCalls,
    })

    const coinsInt = sdk.api.abi.multiCall({
      abi: abi.coinsInt,
      calls: coinCalls,
    })

    let coins = await coinsUint
    if (!coins.output[0].success) {
      coins = await coinsInt
    }
    // console.log('coins--', coins)

    const coinBalances = await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: coins.output.map(coin => ({
        target: coin.output,
        params: [swapAddress]
      }))
    })

    const resolvedLPSupply = lpTokenSupply.output;
    // console.log("coinBalances---", coinBalances)
    // let lpTvl = BigNumber(0);
    const lpTvl = await getLpTvl(poolInfo, resolvedLPSupply, coinBalances, poolData, coins)

    const lpApy = await getLpApy(poolData, dataApy)
    return {
      lpTvl: lpTvl.toString(10),
      lpApy: lpApy.toString(10),
      poolData
    }
  }))
}

const getLpTvl = async (poolInfo, resolvedLPSupply, coinBalances, poolData, coins) => {
  let lpTvl = BigNumber(0);
  await Promise.all(coinBalances.output.map(async (coinBalance, index) => {
    let coinAddress = coins.output[index].output
    if (replacements.includes(coinAddress)) {
      coinAddress = "0x6b175474e89094c44da98b954eedeac495271d0f" // dai
    }
    if (coinBalance.input.target === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
      coinBalance = await sdk.api.eth.getBalance({
        target: coinBalance.input.params[0]
      })
      coinAddress = '0x0000000000000000000000000000000000000000'
    }
    // console.log("poolInfo.totalUnderlying--", poolInfo.output.totalUnderlying)
    // console.log("coinBalance.output--", coinBalance.output)
    // console.log("lpTokenSupply.output--", lpTokenSupply.output)
    const coinDecimals = poolData.coinDecimals[index]
    // console.log('coinDecimals---', coinDecimals)

    const isReplace = replacePrice.find(item => item.address.toLocaleLowerCase() == coinAddress.toLocaleLowerCase())
    let pricesUSD1 = 0;
    // console.log('isReplace--', isReplace)
    if (isReplace && isReplace.token) {
      pricesUSD1 = await utils.getCGpriceData(
        isReplace.token,
        true
      );
      pricesUSD1 = pricesUSD1[isReplace.token].usd
    } else {
      pricesUSD1 = await utils.getCGpriceData(
        coinAddress,
        false,
        'ethereum'
      );
      // console.log('pricesUSD1--', pricesUSD1, coinAddress)
      pricesUSD1 = pricesUSD1[coinAddress.toLocaleLowerCase()].usd
    }
    // console.log("price----", coinAddress, pricesUSD1)
    const balance = BigNumber(poolInfo.output.totalUnderlying).times(coinBalance.output).div(resolvedLPSupply);
    let balancePrice = BigNumber(0)
    if (!balance.isZero()) {
      // console.log("pricesUSD1,balance,coinAddress,coinDecimals---", pricesUSD1, balance.toString(10), coinAddress, coinDecimals)
      balancePrice = balance.times(pricesUSD1).div(10 ** coinDecimals)
      lpTvl = lpTvl.plus(balancePrice)
      // console.log("balancePrice----", balancePrice.toString(10))
      // sdk.util.sumSingleBalance(balances, coinAddress, balance.toFixed(0))      
    }
    return balancePrice;
  }))
  // console.log("lpToken,tvl---", poolInfo.output.lpToken, lpTvl.toString(10))
  return lpTvl
}

const getLpApy = async (poolData, dataApy) => {
  // console.log('poolData.name--', poolData.name)
  const convexApy = getConvexInfo('CRV', dataApy) ? getConvexInfo('CRV', dataApy).apy.project : 0
  const convexInfo = getConvexInfo(poolData.name, dataApy)
  const baseApy = convexInfo ? convexInfo.apy.current : 0

  const acrvApy = BigNumber(parseFloat(convexApy))
    .dividedBy(100)
    .dividedBy(52)
    .plus(1)
    .pow(52)
    .minus(1)
    .shiftedBy(2)

  const compoundApy = acrvApy.multipliedBy(parseFloat(baseApy)).dividedBy(100)
  // console.log(item.name, baseApy, parseInt(baseApy), convexApy, acrvApy.toFixed(2), compoundApy.toFixed(2))
  let apy = compoundApy.plus(BigNumber(parseFloat(baseApy)))
  let ethApy = BigNumber(1)
    .plus(BigNumber(parseFloat(baseApy)).div(100))
    .plus(BigNumber(compoundApy).div(100))
    .times(BigNumber(0.045 * 0.85))
    .times(100)
  if (poolData.isShowEthApy) {
    // console.log("ethApy---", compoundApy.toString(10), parseFloat(baseApy).toString(10), ethApy.toString(10))
    apy = apy.plus(BigNumber(ethApy))
  }
  // console.log("poolData.name---", poolData.name, apy.toString(10))
  return apy
}

const getConvexInfo = (tokenName, dataApy) => {
  let data = dataApy
  try {
    const info =
      data.find(item => item.name === tokenName.toLocaleLowerCase() || item.name === tokenName) ||
      converWebsiteInfo.find(item => item.name === tokenName)

    if (BigNumber(parseFloat(info.apy.current)).isNaN()) {
      return converWebsiteInfo.find(item => item.name === tokenName.toLocaleLowerCase())
    }
    return info
  } catch (error) {
    return null
  }
}

const getAcrvPoolData = async () => {
  let dataApy = await utils.getData(
    'http://concentrator-api.aladdin.club/apy/'
  );
  let crvPrice = await utils.getCGpriceData(
    'convex-crv',
    true
  );
  crvPrice = crvPrice["convex-crv"].usd
  const acrvTotalUnderlying = (await sdk.api.abi.call({
    target: convexVaultAcrv,
    abi: AladdinCRVABI.totalUnderlying,
    params: []
  })).output;

  const acrvTotalSupply = (await sdk.api.abi.call({
    target: convexVaultAcrv,
    abi: AladdinCRVABI.totalSupply,
    params: []
  })).output;

  const rate = acrvTotalSupply * 1 ? BigNumber(acrvTotalUnderlying).div(acrvTotalSupply) : 1

  const cvxcrvBalance = BigNumber(acrvTotalUnderlying).multipliedBy(rate).times(crvPrice).div(10 ** 18).toString(10)

  const convexApy = getConvexInfo('CRV', dataApy)?.apy?.project || 0

  console.log('cvxcrvBalance,convexApy', cvxcrvBalance.toString(10), convexApy.toString(10))

  const apy = BigNumber(parseFloat(convexApy))
    .dividedBy(100)
    .dividedBy(365)
    .plus(1)
    .pow(365)
    .minus(1)
    .shiftedBy(2)

  const newObj = {
    pool: '0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884',
    chain: utils.formatChain('ethereum'),
    project: 'convex-finance',
    symbol: 'aCRV',
    tvlUsd: cvxcrvBalance,
    apy: apy.toString(10),
  };
  return newObj
}

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: entry.poolData.addresses.lpToken,
    chain: utils.formatChain(chainString),
    project: 'convex-finance',
    symbol: utils.formatSymbol(entry.poolData.symbol),
    tvlUsd: entry.lpTvl,
    apy: entry.lpApy,
  };
  return newObj;
};

const main = async () => {
  const dataInfo = await getAllPools()
  const acrvData = await getAcrvPoolData()
  const data = dataInfo.map((el) => buildPool(el, 'ethereum'));
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
