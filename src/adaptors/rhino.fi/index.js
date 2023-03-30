const utils = require("../utils");

const APP_URL = 'https://app.rhino.fi'
const API_URL = 'https://api.rhino.fi/apytvl/all'

const CHAINS = {
  ETHEREUM: 'Ethereum',
  ARBITRUM: 'Arbitrum',
  POLYGON: 'Polygon'
}

const CONTRACT_ADDRESSES = {
  WSTETH: {address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', chain: CHAINS.ETHEREUM},
  CUSDT: {address: '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9', chain: CHAINS.ETHEREUM},
  DSETH: {address: '0x341c05c0e9b33c0e38d64de76516b2ce970bb3be', chain: CHAINS.ETHEREUM},
  ETHBTCMOMENTUM: {address: '0x6E2dAc3b9E9ADc0CbbaE2D0B9Fd81952a8D33872', chain: CHAINS.ETHEREUM, isStrategy: true},
  ETHBTCTREND: {address: '0x6b7f87279982d919Bbf85182DDeAB179B366D8f2', chain: CHAINS.ETHEREUM, isStrategy: true},
  ICETH: {address: '0x7C07F7aBe10CE8e33DC6C5aD68FE033085256A84', chain: CHAINS.ETHEREUM},
  STMATIC: {address: '0x9ee91F9f426fA633d227f7a9b000E28b9dfd8599', chain: CHAINS.ETHEREUM},
  YVUSDT: {address: '0x3b27f92c0e212c671ea351827edf93db27cc0c65', chain: CHAINS.ETHEREUM},
  mooStargateUSDC: {address: '0xd496ea90a454ea49e30a8fd9e053c186d4fc897d', chain: CHAINS.ARBITRUM},
  mooStargateUSDT: {address: '0x1c480521100c962f7da106839a5a504b5a7457a1', chain: CHAINS.POLYGON}
}

const getApy = async () => {
  const yieldPools = await utils.getData(API_URL);
  return Object.keys(yieldPools)
    .filter(pool => !!CONTRACT_ADDRESSES[pool])
    .map(pool => {
    const {apy, tvl} = yieldPools[pool]
    const {address, chain, isStrategy} = CONTRACT_ADDRESSES[pool]
    return ({
      pool: `${address}-${chain}-rhino.fi`.toLowerCase(),
      chain,
      project: 'rhino.fi',
      tvlUsd: tvl,
      apyBase: apy,
      symbol: pool,
      url: `${APP_URL}/${isStrategy ? 'strategy' : 'invest'}/${pool}`
    })
  })
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: `${APP_URL}/invest`,
};
