const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const axios = require('axios');

const cadabraConfig = [
  {
    chain: 'bsc',
    abra: '0xcA1c644704feBf4ab81f85daca488d1623C28e63',
    lens: '0x2A479CFf64574Ed192f42509a205e3eb94Dc258C',
    wrappersLens: '0x08639AE6D35105820fE708770158C482e4257d85',
  },
  {
    chain: 'arbitrum',
    abra: '0x65114046C6e73AF794308547124aD5C8dcE3be6F',
    wrappersLens: '0xAb8185196B53118468765E8AEB526A20770ae329',
  },
  {
    chain: 'sonic',
    abra: '0xcA1c644704feBf4ab81f85daca488d1623C28e63',
    wrappersLens: '0x0385aD4E3CA6a770165AeA4693421Dd4D9bCCb4e',
  },
]

const networkMapping = {
  1: 'ethereum',
  10: 'optimism',
  25: 'cronos',
  56: 'bsc',
  100: 'gnosis',
  122: 'fuse',
  128: 'heco',
  137: 'polygon',
  146: 'sonic',
  169: 'manta',
  250: 'fantom',
  252: 'fraxtal',
  324: 'zksync',
  1088: 'metis',
  1101: 'polygon_zkevm',
  1284: 'moonbeam',
  1285: 'moonriver',
  2222: 'kava',
  5000: 'mantle',
  7700: 'canto',
  8453: 'base',
  34443: 'mode',
  42161: 'arbitrum',
  42220: 'celo',
  42262: 'oasis',
  43114: 'avalanche',
  59144: 'linea',
  1313161554: 'aurora',
  1666600000: 'harmony',
};

const main = async () => {
  let allTokens = new Set();
  let wrapperInfoByChain = new Map();

  for (const config of cadabraConfig) {
    let wrappers = await collectWrappers(config.wrappersLens, config.chain)
    const result = (
      await sdk.api.abi.multiCall({
        abi: 'function reserves() view returns(address[] memory, uint256[] memory)',
        calls: wrappers.map((w) => ({target:w})),
        chain: config.chain
      })
    ).output

    result.forEach((out )=> {
        let tokens = out.output[0].map((t) => chainToken(config.chain, t))
        tokens.forEach(t => allTokens.add(t))
        wrapperInfoByChain[chainToken(config.chain, out.input.target)] = {
          tokens: tokens,
          amounts: out.output[1],
        }
    })

    if (typeof config.lens !== 'undefined') {
      let token0 = (await sdk.api.abi.call({
        abi: 'function token0() view returns(address)',
        target: config.lens,
        chain: config.chain
      })).output
      token0 =  chainToken(config.chain, token0)
      let token1 = (await sdk.api.abi.call({
        abi: 'function token1() view returns(address)',
        target: config.lens,
        chain: config.chain
      })).output
      token1 =  chainToken(config.chain, token1)
      const frp = (await sdk.api.abi.call({
        abi: 'function fullRangePair() view returns(address)',
        target: config.lens,
        chain: config.chain
      })).output;

      const [frpReserve0, frpReserve1] = (await sdk.api.abi.call({
        abi: 'function fullRangePairReserves()\n' +
          '    view\n' +
          '    returns (uint256 reserve0, uint256 reserve1)',
        target: config.lens,
        chain: config.chain
      })).output;

      allTokens.add(token0)
      allTokens.add(token1)

      wrapperInfoByChain[chainToken(config.chain, frp)] = {
        tokens: [token0, token1],
        amounts: [frpReserve0, frpReserve1],
      }
    }
  }

  let prices = await getPrices(Array.from(allTokens));
  return await collectFinalInfo(wrapperInfoByChain, prices)
};

async function collectFinalInfo(wrapperInfoByChain, prices){
  const strategies = await utils.getData(
    'https://app.cadabra.finance/api/system/strategies'
  );

  const abraByChain = new Map()
  cadabraConfig.forEach(config => abraByChain[config.chain] = config.abra)

  return Object.values(strategies).filter(pool => !pool.isTestStrategy).map((pool) => {
    const apyReward = Number(pool.apr) * 100;
    const chain = networkMapping[pool.chainId]

    const tokens = pool.tokens.map(p => p.address)
    const tokensSymbol = pool.tokens.map(p => p.symbol)

    return {
      pool: `cadabra-${pool.id}-${chain}`.toLowerCase(),
      chain: chain,
      project: 'cadabra-finance',
      symbol: tokensSymbol.join('-'),
      tvlUsd: calculateTvl(chain, pool.adapters, wrapperInfoByChain, prices),
      apyReward,
      url: `https://app.cadabra.finance/strategies/${pool.id.toLowerCase()}/${pool.chainId}`,
      rewardTokens: [abraByChain[chain]],
      underlyingTokens: tokens,
    };
  });
}

function calculateTvl(chain, adapters, wrapperInfoByChain, prices) {
  let totalTvl = 0

  for (let adapter of adapters) {
    let address = chainToken(chain, adapter.address);
    let info = wrapperInfoByChain[address]

    for (let i = 0; i < info.tokens.length; i++) {
      let token = info.tokens[i]
      let amount = info.amounts[i]
      let price = prices[token]

      totalTvl += amount / 10 ** price.decimals * price.price
    }
  }

  return totalTvl
}

async function getPrices(allTokens){
  let results = {};
  if (allTokens.length > 0) {
    for (let i = 0; i < allTokens.length; i += 100) {
      const {
        data: { coins },
      } = await axios.get(
        `https://coins.llama.fi/prices/current/${allTokens.slice(i, i + 100)}`
      );
      for (const key of Object.keys(coins)) {
        results[key] = coins[key];
      }
    }
  }
  return results;
}

function chainToken(chain, token) {
  return (chain + ':' + token).toLowerCase()
}

async function collectWrappers(wrappersLens, chain) {
  return (await sdk.api.abi.call({
    abi: 'function wrappers() view returns(address[] memory)',
    target: wrappersLens,
    chain: chain
  })).output;
}

module.exports = {
  timetravel: false,
  apy: main,
};