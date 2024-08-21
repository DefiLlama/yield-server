// to calculate chain TVL
// 1. Loop through each pool in each chain under ./config/vault
// 2a. get LP prices from e.g. https://magikfarm.herokuapp.com/lps?_=27662323
// 2b. get token price from e.g. https://magikfarm.herokuapp.com/prices?_=27662323
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

const protocolSlug = 'magik-farm';
const urlApy = 'https://magikfarm.herokuapp.com/apy/breakdown';
const urlLpPrices = 'https://magikfarm.herokuapp.com/lps';
const urlTokenPrices = 'https://magikfarm.herokuapp.com/prices';
const sdk = require('@defillama/sdk');
const { Web3 } = require('web3');
const networkMapping = {
  10: {
    name: 'optimism',
    multiCallChainName: 'optimism',
    rpcUrls: ['https://mainnet.optimism.io'],
    pools: magikConfig.arbitrumPools,
  },
  43114: {
    name: 'avalanche',
    multiCallChainName: 'avax',
    rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
    pools: magikConfig.avalanchePools,
  },
  1666600000: {
    name: 'harmony',
    multiCallChainName: 'harmony',
    rpcUrls: ['https://api.s0.t.hmny.io/'],
    pools: magikConfig.harmonyPools,
  },
  42220: {
    name: 'celo',
    multiCallChainName: 'celo',
    rpcUrls: ['https://forno.celo.org'],
    pools: magikConfig.celoPools,
  },
  42161: {
    name: 'arbitrum',
    multiCallChainName: 'arbitrum',
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    pools: magikConfig.arbitrumPools,
  },
  1285: {
    name: 'moonriver',
    multiCallChainName: 'moonriver',
    rpcUrls: ['https://rpc.moonriver.moonbeam.network'],
    pools: magikConfig.moonriverPools,
  },
  1088: {
    name: 'metis',
    multiCallChainName: 'metis',
    rpcUrls: [],
    pools: [],
  },
  250: {
    name: 'fantom',
    multiCallChainName: 'fantom',
    rpcUrls: ['https://rpc.ftm.tools'],
    pools: magikConfig.fantomPools,
  },
  137: {
    name: 'polygon',
    multiCallChainName: 'polygon',
    rpcUrls: ['https://polygon-rpc.com'],
    pools: magikConfig.polygonPools,
  },
  128: {
    name: 'heco',
    multiCallChainName: 'heco',
    rpcUrls: ['https://http-mainnet.hecochain.com'],
    pools: magikConfig.hecoPools,
  },
  122: {
    name: 'fuse',
    multiCallChainName: 'fuse',
    rpcUrls: [],
    pools: [],
  },
  56: {
    name: 'binance',
    multiCallChainName: 'bsc',
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    pools: magikConfig.bscPools,
  },
  25: {
    name: 'cronos',
    multiCallChainName: 'cronos',
    rpcUrls: ['https://evm-cronos.crypto.org'],
    pools: magikConfig.cronosPools,
  },
  1313161554: {
    name: 'aurora',
    multiCallChainName: 'aurora',
    rpcUrls: ['https://mainnet.aurora.dev/'],
    pools: magikConfig.auroraPools,
  },
};

const balanceAbi = {
  constant: true,
  inputs: [],
  name: 'balance',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};

// Time-based cache buster
const getApiCacheBuster = () => {
  return Math.trunc(Date.now() / (1000 * 60));
};

const apy = async (dataLpPrices, dataTokenPrices, dataApy, networkMapping) => {
  let data = [];
  for (const chainId of Object.keys(networkMapping)) {
    chain = networkMapping[chainId];
    // toDO: add failover logic in the future as util function
    const rpcUrl =
      chain.rpcUrls && chain.rpcUrls.length > 0 ? chain.rpcUrls[0] : null;
    const pools = chain.pools && chain.pools.length > 0 ? chain.pools : 0;
    if (rpcUrl != '' && pools.length > 0) {
      const web3 = new Web3(rpcUrl);
      const vaultCalls = pools.map((pool) => {
        return {
          target: pool.earnedTokenAddress,
        };
      });
      const vaultResult = await sdk.api.abi.multiCall({
        abi: balanceAbi,
        calls: vaultCalls,
        chain: chain.multiCallChainName.toLowerCase(),
      });
      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        let price = null;
        switch (pool.stratType) {
          case 'StratLP':
            price = dataLpPrices[pool.oracleId];
            break;
          case 'SingleStake':
            price = dataTokenPrices[pool.oracleId];
        }
        const poolApy = dataApy[pool.id];
        const poolToken =
          pool.assets.length > 1
            ? `${pool.assets[0]}-${pool.assets[1]}`
            : `${pool.assets[0]}`;
        const tokenDecimals = pool.tokenDecimals;
        const balance = Number(vaultResult.output[i].output);
        if (!isNaN(price) && !isNaN(tokenDecimals) && !isNaN(balance)) {
          let poolData = {
            pool: `${pool.id}`,
            chain: utils.formatChain(chain.name),
            project: protocolSlug,
            symbol: utils.formatSymbol(poolToken),
            tvlUsd: (balance / Math.pow(10, tokenDecimals)) * price,
            apy: !isNaN(poolApy?.totalApy) ? poolApy.totalApy * 100 : null,
          };
          data.push(poolData);
        }
      }
    }
  }
  return data.filter((p) => utils.keepFinite(p));
};

const main = async () => {
  // pull data
  const queryParams = `_=${getApiCacheBuster()}`;
  const dataApy = await utils.getData(`${urlApy}?${queryParams}`);
  const dataLpPrices = await utils.getData(`${urlLpPrices}?${queryParams}`);
  const dataTokenPrices = await utils.getData(
    `${urlTokenPrices}?${queryParams}`
  );
  // calculate apy and tvl
  let data = await apy(dataLpPrices, dataTokenPrices, dataApy, networkMapping);
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://magik.farm/#/fantom',
};
