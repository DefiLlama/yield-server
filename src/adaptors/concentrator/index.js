const superagent = require('superagent');
const Web3 = require('web3');
const sdk = require("@defillama/sdk");
const utils = require('../utils');
const curve = require('../curve/index');
const abi = require('./abis/abi1.json');
const BoosterABI = require('./abis/abi.json');
const AladdinConvexVaultABI = require('./abis/AladdinConvexVault.json')
const AladdinCRVABI = require('./abis/AladdinCRV.json')
const curvePools = require('./pools-crv.js');

// https://etherscan.io/address/0xF403C135812408BFbE8713b5A23a04b3D48AAE31#readContract
// check poolInfo method (input are the below id's)
// the swap contract address can be found here: https://curve.fi/contracts
const pools = require('./pools.json');


const convexVault = '0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8';
const convexVaultAcrv = '0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884';
const cvxcrvAddress = '0x62b9c7356a2dc64a1969e19c23e4f579f9810aa7';



const ETHERSCAN_KEY = process.env.ETHERSCAN;

const crvAddress = '0xD533a949740bb3306d119CC777fa900bA034cd52';
const cvxAddress = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';

const cliffSize = 100000; // * 1e18; //new cliff every 100,000 tokens
const cliffCount = 1000; // 1,000 cliffs
const maxSupply = 100000000; // * 1e18; //100 mil max supply

const getKeyByValue = (object, value) => {
  return Object.keys(object).find((key) => object[key] === value);
};
const web3 = new Web3("https://eth-mainnet.alchemyapi.io/v2/NYoZTYs7oGkwlUItqoSHJeqpjqtlRT6m");
// price data

const boosterBoosterContract = new web3.eth.Contract(
  BoosterABI,
  convexVault
);



const convexVaultContract = new web3.eth.Contract(
  AladdinConvexVaultABI,
  convexVault
);

const convexVaultAcrvContract = new web3.eth.Contract(
  AladdinCRVABI,
  convexVaultAcrv
);

const getAllPools = async () => {
  // const poolStatsCrv = await curve.curvePoolStats();
  // console.log('poolStatsCrv---', poolStatsCrv)
  const poolLength = await boosterBoosterContract.methods.poolLength().call();
  console.log("poolLength---", poolLength)

  const pricesUSD = await utils.getCGpriceData(
    'curve-dao-token,convex-crv,frax-share,ethereum,staked-ether,frax,lp-3pool-curve,usd-coin,bitcoin,convex-finance,wrapped-steth,rocket-pool-eth,terrausd-wormhole,convex-crv,renbtc,wrapped-bitcoin',
    true
  );
  console.log("pricesUSD---", pricesUSD);

  await Promise.all([...Array(Number(poolLength)).keys()].map(async i => {
    const poolInfo = await boosterBoosterContract.methods.poolInfo(i).call();
    console.log("poolInfo---1", poolInfo, poolInfo["stash"]);
    const poolData = curvePools.find(crvPool => crvPool.addresses.lpToken.toLowerCase() === poolInfo["stash"].toLowerCase())
    console.log("poolData---2", poolData);
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
      block
    })

    const coinsInt = sdk.api.abi.multiCall({
      abi: abi.coinsInt,
      calls: coinCalls,
      block
    })

    let coins = await coinsUint
    if (!coins.output[0].success) {
      coins = await coinsInt
    }

    console.log('coins--', coins)

  }))
}


const buildPool = (entry, chainString) => {
  const newObj = {
    pool: entry.lptoken,
    chain: utils.formatChain(chainString),
    project: 'convex-finance',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: entry.tvl_usd,
    apy: entry.apySum,
  };
  return newObj;
};

const topLvl = async (chainString) => {
  // pull data
  // let data = await getPoolStatsCvx();

  // // build pool objects
  // data = data.map((el) => buildPool(el, chainString));

  // return data;
};

const main = async () => {
  await getAllPools()
  // const data = await Promise.all([topLvl('ethereum')]);
  // return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};





// const getCvxTvl = async (poolStatsCrv) => {
//   // main deposit contract
//   const convexBoosterAddress = '0xF403C135812408BFbE8713b5A23a04b3D48AAE31';

//   const web3 = new Web3(process.env.INFURA_CONNECTION);
//   const convexBoosterContract = new web3.eth.Contract(
//     abi.Booster,
//     convexBoosterAddress
//   );

//   const liquidityData = [];
//   // this is the part we need to loop (there are 39 pools) pass this in as an arg
//   const tokenIds = pools.map((el) => el.id);

//   // price data
//   const pricesUSD = await utils.getCGpriceData(
//     'ethereum,bitcoin,chainlink,stasis-eurs,tether-eurt',
//     true
//   );

  // for (const i of tokenIds) {
  //   const result = await convexBoosterContract.methods.poolInfo(i).call();
  //   // this is the lp token we receive by depositing the curve lp token into convex
  //   const tokenAddress = result.token;

  //   // now we take that info, and go to that token contract,
  //   // from which we call the totalSupply method
  //   const tokenContract = new web3.eth.Contract(abi.Pool, tokenAddress);
  //   const decimals = await tokenContract.methods.decimals().call();
  //   let name = await tokenContract.methods.name().call();

  //   // I change the names so they match what I have in the mapping
  //   const crv3 = 'DAI-USDC-USDT';
  //   // first case is tricrypto
  //   if (name.includes('USD-BTC-ETH')) {
  //     name = 'USDT-wBTC-WETH';
  //   } else if (name.includes('TrueUSD')) {
  //     name = curve.tokenMapping['tusd'];
  //   } else if (name.includes('Frax')) {
  //     name = curve.tokenMapping['frax'];
  //   } else if (name.includes('Liquity')) {
  //     name = curve.tokenMapping['lusd'];
  //   } else if (name.includes('Alchemix')) {
  //     name = curve.tokenMapping['alusd'];
  //   } else if (name.includes('PAX')) {
  //     name = curve.tokenMapping['pax'];
  //   } else if (name.includes('renBTC-wBTC-sBTC')) {
  //     name = curve.tokenMapping['rens'];
  //   } else if (name.includes('hBTC')) {
  //     name = curve.tokenMapping['hbtc'];
  //   } else if (name.includes('bBTC')) {
  //     name = curve.tokenMapping['bbtc'];
  //   } else if (name.includes('aETH')) {
  //     name = curve.tokenMapping['ankreth'];
  //   } else if (name.includes('Binance')) {
  //     name = curve.tokenMapping['busdv2'];
  //   } else if (name.includes('MUSD')) {
  //     name = curve.tokenMapping['musd'];
  //   } else if (name.includes('pBTC')) {
  //     name = curve.tokenMapping['pbtc'];
  //   } else if (name.includes('oBTC')) {
  //     name = curve.tokenMapping['obtc'];
  //   } else if (name.includes('EURS/sEUR')) {
  //     name = curve.tokenMapping['eurs'];
  //   } else if (name.includes('Magic Internet Money')) {
  //     name = curve.tokenMapping['mim'];
  //   } else if (name.includes('RAI3CRV')) {
  //     name = curve.tokenMapping['rai'];
  //   } else if (name.includes('XAUT-3Crv')) {
  //     name = curve.tokenMapping['xautusd'];
  //   } else if (name.includes('Euro Tether')) {
  //     name = curve.tokenMapping['eurt'];
  //   } else if (name.includes('EURS-USDC')) {
  //     name = curve.tokenMapping['eursusd'];
  //   } else if (name.includes('EURT-3Crv')) {
  //     name = curve.tokenMapping['eurtusd'];
  //   } else {
  //     name = name.split(' ')[1].split('/').join('-');
  //   }
  //   name = name.replace('3Crv', crv3);

//     // for tricrypto we check the full symbol
//     // and set the price to 1, which wont modify the total supply
//     // we will do this in a sep func
//     let price = 1;
//     if (name === 'USDT-wBTC-WETH') {
//       if (i === 37) {
//         pos = poolStatsCrv.find((el) => el.pool === 'tricrypto');
//       } else if (i === 38) {
//         pos = poolStatsCrv.find((el) => el.pool === 'tricrypto2');
//       }
//       price = pos.tvl / pos.totalSupply;
//     } else if (name.includes('SPELL-ETH')) {
//       pos = poolStatsCrv.find((el) => el.pool === 'spelleth');
//       price = pos.tvl / pos.totalSupply;
//     } else if (name.includes('CVX-ETH')) {
//       pos = poolStatsCrv.find((el) => el.pool === 'cvxeth');
//       price = pos.tvl / pos.totalSupply;
//     } else if (name.includes('CRV-ETH')) {
//       pos = poolStatsCrv.find((el) => el.pool === 'crveth');
//       price = pos.tvl / pos.totalSupply;
//     } else if (name.includes('XAU')) {
//       pos = poolStatsCrv.find((el) => el.pool === 'xautusd');
//       price = pos.tvl / pos.totalSupply;
//     } else if (name.includes('T-ETH')) {
//       pos = poolStatsCrv.find((el) => el.pool === 'teth');
//       price = pos.tvl / pos.totalSupply;
//     } else if (name.includes('EURs-USDC')) {
//       pos = poolStatsCrv.find((el) => el.pool === 'eursusd');
//       price = pos.tvl / pos.totalSupply;
//     } else if (name.includes('EURT-DAI')) {
//       pos = poolStatsCrv.find((el) => el.pool === 'eurtusd');
//       price = pos.tvl / pos.totalSupply;
//     } else if (name.includes('EURT-sEUR')) {
//       pos = poolStatsCrv.find((el) => el.pool === 'eurt');
//       price = pos.tvl / pos.totalSupply;
//     } else if (name.includes('ETH')) {
//       price = pricesUSD.ethereum.usd;
//     } else if (name.includes('BTC')) {
//       price = pricesUSD.bitcoin.usd;
//     } else if (name.includes('LINK')) {
//       price = pricesUSD.chainlink.usd;
//     } else if (name.includes('EUR')) {
//       price = pricesUSD['stasis-eurs'].usd;
//     }

//     let totalSupply = await tokenContract.methods.totalSupply().call();
//     totalSupply = (price * totalSupply) / 10 ** decimals;

//     let pool = getKeyByValue(curve.tokenMapping, name);
//     const o = {
//       idx: i,
//       pool: i === 38 ? 'tricrypto2' : pool,
//       symbol: name,
//       tvl_usd: totalSupply,
//     };
//     liquidityData.push(o);
//   }
//   return liquidityData;
// };

// const getPoolStatsCvx = async () => {
//   // calculate convex apr/apy values (based on the hardcoded pools info on the btm)
//   const currentApys = await getCurrentApys();

//   // this is the curve apy data (based on the convex api)
//   let dataApy = await utils.getData(
//     'https://www.convexfinance.com/api/curve-apys'
//   );

//   // this is the curve stuff before buildPool
//   const poolStatsCrv = await curve.curvePoolStats();

//   // this is convex tvl stuff
//   const poolStatsCvx = await getCvxTvl(poolStatsCrv);

//   let poolStats = [];
//   const pools = poolStatsCrv.map((el) => el.pool);
//   for (const pool of pools) {
//     // i remove some of the pools (such as tricrypto 1 and eurt (as it has 0 apy))
//     if (pool === 'eurt' || pool === 'tricrypto') continue;
//     // unfort these two endpoints have different keys for some pools
//     searchKey = pool;
//     if (pool === 'y') {
//       searchKey = 'iearn';
//     } else if (pool === 'susd') {
//       searchKey = 'susdv2';
//     } else if (pool === 'ren2') {
//       searchKey = 'ren';
//     }

//     // calc virtual tvl
//     const virtual_price = poolStatsCrv.find(
//       (el) => el.pool === pool
//     ).virtual_price;
//     const tvl_usd =
//       poolStatsCvx.find((el) => el.pool === pool)?.tvl_usd * virtual_price;

//     // fee is already deducted
//     const apyBase = Number(dataApy.apys[searchKey].baseApy);

//     const apySum =
//       apyBase + currentApys.find((el) => el.pool === pool)?.aprCurrentExBase;

//     poolStats.push({
//       lptoken: currentApys.find((el) => el.pool === pool).lptoken,
//       pool,
//       symbol: curve.tokenMapping[pool],
//       apySum,
//       tvl_usd,
//     });
//   }

//   return poolStats;
// };

// const buildPool = (entry, chainString) => {
//   const newObj = {
//     pool: entry.lptoken,
//     chain: utils.formatChain(chainString),
//     project: 'concentrator-finance',
//     symbol: utils.formatSymbol(entry.symbol),
//     tvlUsd: entry.tvl_usd,
//     apy: entry.apySum,
//   };
//   return newObj;
// };

// const getCurrentApys = async () => {
//   const res = [];

//   // calc cvx and crv token price in supplied currencies from pools.json
//   const uniqueCurrencies = [...new Set(pools.map((p) => p.currency))];
//   const cvxPrices = {};
//   const crvPrices = {};
//   for (c of uniqueCurrencies) {
//     cvxPrices[c] = await getPrice(cvxAddress, c);
//     crvPrices[c] = await getPrice(crvAddress, c);
//   }

//   for (const pool of pools) {
//     console.log(pool.name);
//     let apr = await getCurrentApy(pool.name, cvxPrices, crvPrices);
//     res.push({
//       pool: pool.name,
//       aprCurrentExBase: apr,
//       lptoken: pool.lptoken,
//     });
//   }
//   return res;
// };

// // the below is from here
// // https://github.com/convex-eth/utilities/blob/main/sheetScripts/convex.gs
// const getCurrentApy = async (poolName, cvxPrices, crvPrices) => {
//   // this is quite confusing,
//   // the value it returns is the total current apy excluding the base APR (as seen under the projected tab)
//   // so we will have to add that back
//   const pool = pools.find((pool) => pool.name == poolName);
//   const curveSwap = pool.swap;

//   // get reward rate
//   const rate = await rewardRate(pool.crvRewards);

//   // get supply
//   let supply = await supplyOf(pool.crvRewards);

//   // get virtual price
//   let virtualPrice = 1;
//   if (pool.isV2 == undefined || pool.isV2 == false) {
//     virtualPrice = await curveLpValue(1, curveSwap);
//   } else {
//     virtualPrice = await curveV2LpValue(pool, pool.currency);
//   }

//   // virtual supply
//   supply = supply * virtualPrice;

//   // crv per underlying per second
//   const crvPerUnderlying = rate / supply;

//   // crv per year
//   const crvPerYear = crvPerUnderlying * 86400 * 365;
//   const cvxPerYear = await getCVXMintAmount(crvPerYear);

//   const cvxPrice = cvxPrices[pool.currency];
//   const crvPrice = crvPrices[pool.currency];

//   let apr = crvPerYear * crvPrice;
//   apr += cvxPerYear * cvxPrice;
//   if (pool.extras != undefined && pool.extras.length > 0) {
//     for (const i in pool.extras) {
//       const ex = pool.extras[i];
//       const exrate = await rewardRate(ex.contract);
//       const perUnderlying = exrate / supply;
//       const perYear = perUnderlying * 86400 * 365;
//       const price = await getPrice(ex.token, pool.currency);
//       apr += perYear * price;
//     }
//   }

//   // scale to pct
//   apr *= 100;

//   return apr;
// };

// const getCVXMintAmount = async (crvEarned) => {
//   // first get total supply
//   const cvxSupply = await supplyOf(cvxAddress);
//   // get current cliff
//   const currentCliff = cvxSupply / cliffSize;
//   // if current cliff is under the max
//   if (currentCliff < cliffCount) {
//     // get remaining cliffs
//     const remaining = cliffCount - currentCliff;

//     // multiply ratio of remaining cliffs to total cliffs against amount CRV received
//     const cvxEarned = (crvEarned * remaining) / cliffCount;

//     // double check we have not gone over the max supply
//     const amountTillMax = maxSupply - cvxSupply;
//     if (cvxEarned > amountTillMax) {
//       cvxEarned = amountTillMax;
//     }
//     return cvxEarned;
//   }
//   return 0;
// };

// const supplyOf = async (contract) => {
//   const totalSupply = '18160ddd';
//   const url =
//     'https://api.etherscan.io/api?module=proxy&action=eth_call&to=' +
//     contract +
//     '&data=0x' +
//     totalSupply +
//     '&tag=latest&apikey=' +
//     ETHERSCAN_KEY;
//   const response = await superagent.get(url);

//   const hexValue = response.body.result;
//   const decimal = Math.pow(10, 18);
//   const supply = parseInt(hexValue, 16) / decimal;
//   return supply;
// };

// const curveLpValue = async (amount, swapAddress) => {
//   const virtualPriceHash = 'bb7b8b80';

//   const swapurl =
//     'https://api.etherscan.io/api?module=proxy&action=eth_call&to=' +
//     swapAddress +
//     '&data=0x' +
//     virtualPriceHash +
//     '&tag=latest&apikey=' +
//     ETHERSCAN_KEY;
//   const response = await superagent(swapurl);
//   const data = response.body;
//   const hexValue = data.result.slice(0, 66);
//   const priceDecimal = Math.pow(10, 18);
//   const pricePerShare = parseInt(hexValue, 16) / priceDecimal;

//   return amount * pricePerShare;
// };

// const curveV2LpValue = async (pool, currencyType) => {
//   // get amount of tokens
//   const supply = await supplyOf(pool.lptoken);
//   let total = 0;
//   for (let i = 0; i < pool.coins.length; i++) {
//     if (pool.cryptoPool === true) {
//       bal = await balances(pool.swap, i, pool.coinDecimals[i]);
//     } else {
//       bal = await balanceOf(pool.swap, pool.coins[i], pool.coinDecimals[i]);
//     }
//     const price = await getPrice(pool.coins[i], currencyType);
//     total += bal * price;
//   }
//   const value = total / supply;
//   return value;
// };

// const rewardRate = async (contract) => {
//   const rewardRate = '7b0a47ee';
//   const url =
//     'https://api.etherscan.io/api?module=proxy&action=eth_call&to=' +
//     contract +
//     '&data=0x' +
//     rewardRate +
//     '&tag=latest&apikey=' +
//     ETHERSCAN_KEY;
//   const response = await superagent.get(url);
//   const data = response.body;
//   const hexValue = data.result;
//   const decimal = Math.pow(10, 18);
//   const rate = parseInt(hexValue, 16) / decimal;
//   return rate;
// };

// const balanceOf = async (address, contract, decimals) => {
//   const balanceOfHex = '70a08231';
//   address = padHex(address);
//   const url =
//     'https://api.etherscan.io/api?module=proxy&action=eth_call&to=' +
//     contract +
//     '&data=0x' +
//     balanceOfHex +
//     address +
//     '&tag=latest&apikey=' +
//     ETHERSCAN_KEY;
//   const response = await superagent.get(url);
//   const data = response.body;
//   const balance = Number(data.result) / Math.pow(10, decimals);

//   return balance;
// };

// // I had to add this cause for the newer v2 crypto pools such as
// // cvxeth the swap address has weth in the coins balance
// // at index 0, even though it has actual eth in there
// const balances = async (contract, idx, decimals) => {
//   const balancesHex = '4903b0d1';
//   idx = padHex(String(idx));
//   const url =
//     'https://api.etherscan.io/api?module=proxy&action=eth_call&to=' +
//     contract +
//     '&data=0x' +
//     balancesHex +
//     idx +
//     '&tag=latest&apikey=' +
//     ETHERSCAN_KEY;
//   const response = await superagent.get(url);
//   const data = response.body;
//   const balance = Number(data.result) / Math.pow(10, decimals);

//   return balance;
// };

// const getPrice = async (contract_address, vsCoin) => {
//   const url =
//     'https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=' +
//     contract_address +
//     '&vs_currencies=' +
//     vsCoin;

//   const response = await superagent.get(url);
//   const data = response.body;
//   return data[contract_address.toLowerCase()][vsCoin.toLowerCase()];
// };

// const padHex = (hexstring, intSize = 256) => {
//   hexstring = hexstring.replace('0x', '');

//   const length = intSize / 4 - hexstring.length;
//   for (let i = 0; i < length; i++) {
//     hexstring = '0' + hexstring;
//   }
//   return hexstring;
// };

// const topLvl = async (chainString) => {
//   // pull data
//   let data = await getPoolStatsCvx();

//   // build pool objects
//   data = data.map((el) => buildPool(el, chainString));

//   return data;
// };

// const main = async () => {
//   const data = await Promise.all([topLvl('ethereum')]);
//   return data.flat();
// };

// module.exports = {
//   timetravel: false,
//   apy: main,
// };
