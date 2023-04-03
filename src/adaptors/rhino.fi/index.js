const sdk = require('@defillama/sdk');
const utils = require("../utils");

const APP_URL = 'https://app.rhino.fi'
const API_URL = 'https://api.rhino.fi/apytvl/all'
const BEEFY_API_URL = 'https://api.beefy.finance'

const CHAINS = {
  ETHEREUM: 'Ethereum',
  ARBITRUM: 'Arbitrum',
  POLYGON: 'Polygon'
}

const TVL_ADDRESSES = {
  [CHAINS.ETHEREUM]: '0x5d22045daceab03b158031ecb7d9d06fad24609b',
  [CHAINS.POLYGON]: '0xda7EeB4049dA84596937127855B50271ad1687E7',
  [CHAINS.ARBITRUM]: '0xCA8E436347a46502E353Cc36b58FE3bB9214D7Fd'
}

const YIELD_TOKENS = {
  [CHAINS.ETHEREUM]: [
    {address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', chain: CHAINS.ETHEREUM, token: 'WSTETH'},
    {address: '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9', chain: CHAINS.ETHEREUM, token: 'CUSDT'},
    {address: '0x341c05c0e9b33c0e38d64de76516b2ce970bb3be', chain: CHAINS.ETHEREUM, token: 'DSETH'},
    {address: '0x7C07F7aBe10CE8e33DC6C5aD68FE033085256A84', chain: CHAINS.ETHEREUM, token: 'ICETH'},
    {address: '0x9ee91F9f426fA633d227f7a9b000E28b9dfd8599', chain: CHAINS.ETHEREUM, token: 'STMATIC'},
    {address: '0x3b27f92c0e212c671ea351827edf93db27cc0c65', chain: CHAINS.ETHEREUM, token: 'YVUSDT'},
  ],
  [CHAINS.ARBITRUM]: [
    {
      address: '0xd496ea90a454ea49e30a8fd9e053c186d4fc897d',
      chain: CHAINS.ARBITRUM,
      token: 'mooStargateUSDC',
      beefyId: 'stargate-arb-usdc'
    },
  ],
  [CHAINS.POLYGON]: [
    {
      address: '0x1c480521100c962f7da106839a5a504b5a7457a1',
      chain: CHAINS.POLYGON,
      token: 'mooStargateUSDT',
      beefyId: 'stargate-polygon-usdt'
    }
  ]
}

const getTokenSlug = (address, chain, coingeckoSlug) => `${coingeckoSlug ? 'coingecko' : chain.toLowerCase()}:${coingeckoSlug || address.toLowerCase()}`

const getTokenPrices = async (tokens) => {
  const l1TokenQuery = tokens.map(({address, chain, coingeckoSlug}) => getTokenSlug(address, chain, coingeckoSlug));
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${l1TokenQuery}`
  );

  return Object.fromEntries(
    tokens.map(({address, chain, token, coingeckoSlug}) => {
      const {decimals = 0, price = 0, symbol = token} = data.coins[getTokenSlug(address, chain, coingeckoSlug)] || {};
      return [address, {price, decimals, symbol}];
    })
  );
};


const getBeefyPrices = async () => {
  return utils.getData(`${BEEFY_API_URL}/vaults`)
}


const getTVL = async (chain, tokens) => {
  return (await sdk.api.abi.multiCall({
    calls: tokens.map(({address}) => ({
      target: address.toLowerCase(),
      params: [TVL_ADDRESSES[chain].toLowerCase()]
    })),
    abi: 'erc20:balanceOf',
    chain: chain.toLowerCase()
  })).output.map(({output}) => output)
}

const findBeefyPrice = (beefyId, vaults) => {
  const {pricePerFullShare = 0, tokenDecimals: decimals = 18} = vaults.find(({id}) => id === beefyId) || {}
  return {price: pricePerFullShare / 10 ** 18, decimals}
}

const getApy = async () => {
  const apy = await utils.getData(API_URL);
  const beefyUsdPrices = await getBeefyPrices()

  const tvlPerChain = (
    await Promise.all(Object.keys(YIELD_TOKENS).map(chain => {
      return getTVL(chain, YIELD_TOKENS[chain])
    })))
    .flat()
  const usdPrices = (await Promise.all(Object.keys(YIELD_TOKENS)
    .map((chain) => getTokenPrices(YIELD_TOKENS[chain]))))
    .reduce((acc, usdPrices) => {
      return {
        ...acc,
        ...usdPrices
      }
    }, {})
  return Object.values(YIELD_TOKENS)
    .flat()
    .map(({address, chain, token, beefyId}, index) => {
      const {apy: apyBase} = apy[token]
      const tvl = tvlPerChain[index] || 0
      const {
        price: usdPrice,
        decimals
      } = beefyId ? findBeefyPrice(beefyId, beefyUsdPrices) : usdPrices[address] || {price: 0, decimals: 18}
      const tvlUsd = (tvl / 10 ** decimals) * usdPrice

      return ({
        pool: `${address}-${chain}-rhino.fi`.toLowerCase(),
        chain,
        project: 'rhino.fi',
        tvlUsd,
        apyBase,
        symbol: token,
        url: `${APP_URL}/invest/${token}`
      })
    })
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: `${APP_URL}/invest`,
};
