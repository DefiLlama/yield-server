// to calculate chain TVL
// 1. Loop through each pool in each chain under ./config/vault
// 2. get LP prices from e.g. https://magikfarm.herokuapp.com/lps?_=27662323
// where _= is getApiCacheBuster()
// 3. Get earned Token address and bind the vaultabi. Use balance() function
// 4. Multiply the balance with the price from the LP Price to get the TVL
// to get chain apy
// 1. get apy e.g. https://magikfarm.herokuapp.com/apy/breakdown?_=27662468
// where _= is getApiCacheBuster()
// 2.  look at total apy field

const utils = require('../utils');
// make sure that the pool files under ./config/vault are up to date
const magikConfig = require('./config');

const protocolSlug = 'magik-finance';
const urlApy = 'https://magikfarm.herokuapp.com/apy/breakdown';
const urlLpPrices = 'https://magikfarm.herokuapp.com/lps';
const MultiCall = require('eth-multicall');
const Web3 = require('web3');
const networkMapping = {
  10: {
    name: 'optimism',
    rpcUrls: ['https://mainnet.optimism.io'],
    pools: magikConfig.arbitrumPools,
    multiCallContractAddress: '',
  },
  43114: {
    name: 'avalanche',
    rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
    pools: magikConfig.avalanchePools,
    multiCallContractAddress: '0x6FfF95AC47b586bDDEea244b3c2fe9c4B07b9F76',
  },
  1666600000: {
    name: 'harmony',
    rpcUrls: ['https://api.s0.t.hmny.io/'],
    pools: magikConfig.harmonyPools,
    multiCallContractAddress: '0xBa5041B1c06e8c9cFb5dDB4b82BdC52E41EA5FC5',
  },
  42220: {
    name: 'celo',
    rpcUrls: ['https://forno.celo.org'],
    pools: magikConfig.celoPools,
    multiCallContractAddress: '0xa9E6E271b27b20F65394914f8784B3B860dBd259',
  },
  42161: {
    name: 'arbitrum',
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    pools: magikConfig.arbitrumPools,
    multiCallContractAddress: '0x13aD51a6664973EbD0749a7c84939d973F247921',
  },
  1285: {
    name: 'moonriver',
    rpcUrls: ['https://rpc.moonriver.moonbeam.network'],
    pools: magikConfig.moonriverPools,
    multiCallContractAddress: '0x7f6fE34C51d5352A0CF375C0Fbe03bD19eCD8460',
  },
  1088: {
    name: 'metis',
    rpcUrls: [],
    pools: [],
    multiCallContractAddress: '',
  },
  250: {
    name: 'fantom',
    rpcUrls: ['https://rpc.ftm.tools'],
    pools: magikConfig.fantomPools,
    multiCallContractAddress: '0xC9F6b1B53E056fd04bE5a197ce4B2423d456B982',
  },
  137: {
    name: 'polygon',
    rpcUrls: ['https://polygon-rpc.com'],
    pools: magikConfig.polygonPools,
    multiCallContractAddress: '0xC3821F0b56FA4F4794d5d760f94B812DE261361B',
  },
  128: {
    name: 'heco',
    rpcUrls: ['https://http-mainnet.hecochain.com'],
    pools: magikConfig.hecoPools,
    multiCallContractAddress: '0x2776CF9B6E2Fa7B33A37139C3CB1ee362Ff0356e',
  },
  122: {
    name: 'fuse',
    rpcUrls: [],
    pools: [],
    multiCallContractAddress: '',
  },
  56: {
    name: 'binance',
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    pools: magikConfig.bscPools,
    multiCallContractAddress: '0xB94858b0bB5437498F5453A16039337e5Fdc269C',
  },
  25: {
    name: 'cronos',
    rpcUrls: ['https://evm-cronos.crypto.org'],
    pools: magikConfig.cronosPools,
    multiCallContractAddress: '0x13aD51a6664973EbD0749a7c84939d973F247921',
  },
  1313161554: {
    name: 'aurora',
    rpcUrls: ['https://mainnet.aurora.dev/'],
    pools: magikConfig.auroraPools,
    multiCallContractAddress: '0x55f46144bC62e9Af4bAdB71842B62162e2194E90',
  },
};

// Time-based cache buster
const getApiCacheBuster = () => {
  return Math.trunc(Date.now() / (1000 * 60));
};

const apy = async (dataLpPrices, dataApy, networkMapping) => {
  let data = [];
  const vaultABI = magikConfig.vaultABI;
  for (const chainId of Object.keys(networkMapping)) {
    chain = networkMapping[chainId];
    // toDO: add failover logic in the future as util function
    const rpcUrl =
      chain.rpcUrls && chain.rpcUrls.length > 0 ? chain.rpcUrls[0] : null;
    const pools = chain.pools && chain.pools.length > 0 ? chain.pools : 0;
    const multiCallAddress = chain.multiCallContractAddress;
    if (rpcUrl != '' && pools.length > 0 && multiCallAddress != '') {
      const web3 = new Web3(rpcUrl);
      const multicall = new MultiCall.MultiCall(web3, multiCallAddress);
      const vaultCalls = pools.map((pool) => {
        const vault = new web3.eth.Contract(vaultABI, pool.earnedTokenAddress);
        return {
          balance: vault.methods.balance(),
        };
      });
      const result = await multicall.all([vaultCalls]);
      const vaultResult = result[0];
      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        const poolPrice = dataLpPrices[pool.id];
        const poolApy = dataApy[pool.id];
        const poolToken =
          pool.assets.length > 1
            ? `${pool.assets[0]}-${pool.assets[1]}`
            : `${pool.assets[0]}`;
        const tokenDecimals = pool.tokenDecimals;
        const balance = vaultResult[i].balance;
        if (!isNaN(poolPrice) && !isNaN(tokenDecimals) && !isNaN(balance)) {
          let poolData = {
            pool: `${pool.id}`,
            chain: utils.formatChain(chain.name),
            project: protocolSlug,
            symbol: utils.formatSymbol(poolToken),
            tvlUsd: (balance / Math.pow(10, tokenDecimals)) * poolPrice,
            apy: !isNaN(poolApy.totalApy) ? poolApy.totalApy * 100 : null,
          };
          data.push(poolData);
        }
      }
    }
  }
  return data;
};

const main = async () => {
  // pull data
  const queryParams = `_=${getApiCacheBuster()}`;
  const dataApy = await utils.getData(`${urlApy}?${queryParams}`);
  const dataLpPrices = await utils.getData(`${urlLpPrices}?${queryParams}`);
  // calculate apy and tvl
  let data = await apy(dataLpPrices, dataApy, networkMapping);
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
