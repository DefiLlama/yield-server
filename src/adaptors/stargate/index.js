const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');
const abi = require('./abis.json');

//optimism uses (OP) token for rewards and kava uses (WKAVA), all else use (STG) token
const CONFIG = {
  ethereum: {
    LP_STAKING: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
    REWARD_TOKEN: '0xaf5191b0de278c7286d6c7cc6ab6bb8a73ba2cd6',
    ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
    LLAMA_NAME: 'Ethereum',
  },
  bsc: {
    LP_STAKING: '0x3052A0F6ab15b4AE1df39962d5DdEFacA86DaB47',
    REWARD_TOKEN: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
    LLAMA_NAME: 'Binance',
  },
  avax: {
    LP_STAKING: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
    REWARD_TOKEN: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    LLAMA_NAME: 'Avalanche',
  },
  base: {
    LP_STAKING: '0x06Eb48763f117c7Be887296CDcdfad2E4092739C',
    ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
    REWARD_TOKEN: '0xE3B53AF74a4BF62Ae5511055290838050bf764Df',
    LLAMA_NAME: 'Base',
  },
  polygon: {
    LP_STAKING: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
    REWARD_TOKEN: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    LLAMA_NAME: 'Polygon',
  },
  arbitrum: {
    LP_STAKING: '0xeA8DfEE1898a7e0a59f7527F076106d7e44c2176',
    ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
    REWARD_TOKEN: '0x6694340fc020c5e6b96567843da2df01b2ce1eb6',
    LLAMA_NAME: 'Arbitrum',
  },
  optimism: {
    LP_STAKING: '0x4DeA9e918c6289a52cd469cAC652727B7b412Cd2',
    ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
    REWARD_TOKEN: '0x4200000000000000000000000000000000000042',
    LLAMA_NAME: 'Optimism',
  },
  fantom: {
    LP_STAKING: '0x224D8Fd7aB6AD4c6eb4611Ce56EF35Dec2277F03',
    REWARD_TOKEN: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    LLAMA_NAME: 'Fantom',
  },
  kava: {
    LP_STAKING: '0x35F78Adf283Fe87732AbC9747d9f6630dF33276C',
    REWARD_TOKEN: '0xc86c7c0efbd6a49b35e8714c5f59d99de09a225b',
    LLAMA_NAME: 'Kava',
  },
  linea: {
    LP_STAKING: '0x4a364f8c717cAAD9A442737Eb7b8A55cc6cf18D8',
    ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
    REWARD_TOKEN: '0x808d7c71ad2ba3FA531b068a2417C63106BC0949',
    LLAMA_NAME: 'Linea',
  },
  mantle: {
    LP_STAKING: '0x352d8275AAE3e0c2404d9f68f6cEE084B5bEB3DD',
    ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
    REWARD_TOKEN: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
    LLAMA_NAME: 'Mantle',
  },
};

const CHAIN_MAP = {
  fantom: 'ftm',
  polygon: 'matic',
  arbitrum: 'arbitrum',
  base: 'base',
  optimism: 'optimism',
  ethereum: 'eth',
  bsc: 'bnb',
  avax: 'avax',
  kava: 'kava',
  linea: 'linea',
  mantle: 'mantle',
};

const pools = async (poolIndex, chain) => {
  // info for tvl / apy calculations
  const poolInfo = (
    await sdk.api.abi.call({
      abi: abi.poolInfo,
      target: CONFIG[chain].LP_STAKING,
      chain: chain,
      params: poolIndex,
    })
  ).output;
  const lpToken = poolInfo.lpToken;
  const lpTokenSymbol = (
    await sdk.api.abi.call({ abi: abi.symbol, target: lpToken, chain: chain })
  ).output;
  const underlyingLpToken = (
    await sdk.api.abi.call({ abi: abi.token, target: lpToken, chain: chain })
  ).output;
  const lpTokenDecimals = (
    await sdk.api.abi.call({ abi: abi.decimals, target: lpToken, chain: chain })
  ).output;
  const allocPoint = await poolInfo.allocPoint;
  const totalAllocPoint = (
    await sdk.api.abi.call({
      abi: abi.totalAllocPoint,
      target: CONFIG[chain].LP_STAKING,
      chain: chain,
    })
  ).output;
  const reserve =
    (
      await sdk.api.abi.call({
        abi: abi.lpBalances,
        target: CONFIG[chain].LP_STAKING,
        chain: chain,
        params: [poolIndex],
      })
    ).output /
    (1 * 10 ** lpTokenDecimals);

  let rewardPerBlock;
  // reward (STG) per block
  if (!['optimism', 'base', 'kava', 'linea', 'mantle'].includes(chain)) {
    const STGPerBlock = (
      await sdk.api.abi.call({
        abi: abi.stargatePerBlock,
        target: CONFIG[chain].LP_STAKING,
        chain: chain,
      })
    ).output;
    rewardPerBlock = STGPerBlock;
  } else {
    const eTokenPerBlock = (
      await sdk.api.abi.call({
        abi: abi.eTokenPerSecond,
        target: CONFIG[chain].LP_STAKING,
        chain: chain,
      })
    ).output;
    rewardPerBlock = eTokenPerBlock;
  }

  return {
    lpToken,
    lpTokenSymbol,
    underlyingLpToken,
    allocPoint,
    totalAllocPoint,
    reserve,
    rewardPerBlock,
  };
};

const getPrices = async (chain, addresses) => {
  const uri = `${addresses.map((address) => `${chain}:${address}`)}`;
  const prices = (
    await superagent.get('https://coins.llama.fi/prices/current/' + uri)
  ).body.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

const tvl = async (chain, symbol, underlyingLpToken, reserve) => {
  // total number of coins in pool * coin price
  let token = underlyingLpToken;
  if (symbol === 'S*SGETH') {
    token = CONFIG[chain].ETHER_TOKEN;
  }
  const price = (await getPrices(chain, [token]))[token.toLowerCase()];
  const reserveUSD = reserve * price;

  return reserveUSD;
};

const calcApy = async (
  chain,
  allocPoint,
  totalAllocPoint,
  reward,
  rewardPrice,
  reserve
) => {
  // pool rewards per year in usd
  // blocks per year * reward * wieght * price

  // BLOCK_TIME is number of seconds for 1 block to settle
  let BLOCK_TIME;
  switch (chain) {
    // these have dynamic block times, but reward = rewardPerSecond (so can just use BLOCK_TIME =1)
    case 'optimism':
    case 'base':
    case 'kava':
    case 'linea':
    case 'mantle':
      BLOCK_TIME = 1;
      break;
    // the others have rewardPerBlock
    case 'polygon':
      BLOCK_TIME = 2.11;
      break;
    case 'avax':
      BLOCK_TIME = 2.03;
      break;
    case 'bsc':
      BLOCK_TIME = 3;
      break;
    // dynamic blocks for fantom
    // we calculate BLOCK_TIME based on nb of blocks in offset period
    case 'fantom':
      // 1 week
      const offset = 7;
      const dateNow = Math.floor(Date.now() / 1000);
      const date7daysPrior = dateNow - 86400 * offset;

      const blocks = (
        await Promise.all(
          [dateNow, date7daysPrior].map((d) =>
            superagent.get(`https://coins.llama.fi/block/${chain}/${d}`)
          )
        )
      )
        .flat()
        .map((i) => i.body?.height);

      const nbBlocksInOffset = blocks[0] - blocks[1];
      const secondsPerOffset = 86400 * offset;
      BLOCK_TIME = secondsPerOffset / nbBlocksInOffset;
      break;
    default:
      BLOCK_TIME = 12;
      break;
  }

  const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
  const BLOCKS_PER_YEAR = SECONDS_PER_YEAR / BLOCK_TIME;

  const weight = allocPoint / totalAllocPoint;
  const rewardPerBlock = reward * weight;

  const rewardPerYear = (rewardPerBlock / 1e18) * BLOCKS_PER_YEAR;

  const rewardUSD = rewardPerYear * rewardPrice;
  const apr = (rewardUSD / reserve) * 100;

  return apr;
};

const getApy = async (chain) => {
  let poolsApy = [];

  const poolLength = parseInt(
    (
      await sdk.api.abi.call({
        abi: abi.poolLength,
        target: CONFIG[chain].LP_STAKING,
        chain,
      })
    ).output
  );
  // use ETH pricing for STG since its most liquid, use OPT pricing for OP, and kava price for WKAVA
  const rewardPrice = ['optimism', 'kava', 'linea'].includes(chain)
    ? (await getPrices(chain, [CONFIG[chain].REWARD_TOKEN]))[
        CONFIG[chain].REWARD_TOKEN.toLowerCase()
      ]
    : (await getPrices('ethereum', [CONFIG.ethereum.REWARD_TOKEN]))[
        CONFIG.ethereum.REWARD_TOKEN.toLowerCase()
      ];
  for (index = 0; index < poolLength; index++) {
    const pool = await pools(index, chain);
    const reserveUSD = await tvl(
      chain,
      pool.lpTokenSymbol,
      pool.underlyingLpToken,
      pool.reserve
    );
    const apy = await calcApy(
      chain,
      pool.allocPoint,
      pool.totalAllocPoint,
      pool.rewardPerBlock,
      rewardPrice,
      reserveUSD
    );

    poolsApy.push({
      pool: `${pool.lpToken}-${CONFIG[chain].LLAMA_NAME}`.toLowerCase(),
      chain: CONFIG[chain].LLAMA_NAME,
      project: 'stargate',
      symbol: `${pool.lpTokenSymbol}`,
      tvlUsd: reserveUSD,
      apyReward: apy,
      underlyingTokens: [`${pool.underlyingLpToken}`],
      rewardTokens: [`${CONFIG[chain].REWARD_TOKEN}`],
      url: `https://stargate.finance/pool/${pool.lpTokenSymbol.replace(
        'S*',
        ''
      )}-${CHAIN_MAP[chain]}/add`,
    });
  }

  return poolsApy;
};

const main = async () => {
  const pools = [];
  for (const chain of Object.keys(CONFIG)) {
    console.log(chain);
    try {
      pools.push(await getApy(chain, CONFIG[chain].LP_STAKING));
    } catch (err) {
      console.log(`${chain} failed`);
    }
  }

  return pools
    .flat()
    .filter((p) => utils.keepFinite(p))
    .map((p) => ({ ...p, symbol: p.symbol.replace('S*', '') }));
};

module.exports = {
  timetravel: false,
  apy: main,
};
