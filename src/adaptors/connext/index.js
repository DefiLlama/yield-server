const axios = require('axios');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const API_URL = 'https://sdk-server.mainnet.connext.ninja';

const CHAIN_DOMAINS = {
  arbitrum: '1634886255',
  bsc: '6450786',
  polygon: '1886350457',
  gnosis: '6778479',
  optimism: '1869640809',
  linea: '1818848877',
  metis: '1835365481',
  base: '1650553709',
  mode: '1836016741',
};

const POOL_TOKEN_SYMBOLS = {
  'WETH-nextWETH': 'eth',
  'USDC-nextUSDC': 'usdc',
  'USDT-nextUSDT': 'usdt',
  'DAI-nextDAI': 'dai',
  'METIS-nextMETIS': 'metis',
}

const POOLS_META = [
  {
    poolName: 'WETH-nextWETH',
    adopted: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    local: '0x2983bf5c334743Aa6657AD70A55041d720d225dB',
    chain: 'arbitrum'
  },
  {
    poolName: 'WETH-nextWETH',
    adopted: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    local: '0xA9CB51C666D2AF451d87442Be50747B31BB7d805',
    chain: 'bsc'
  },
  {
    poolName: 'WETH-nextWETH',
    adopted: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    local: '0x4b8BaC8Dd1CAA52E32C07755c17eFadeD6A0bbD0',
    chain: 'polygon'
  },
  {
    poolName: 'WETH-nextWETH',
    adopted: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1',
    local: '0x538E2dDbfDf476D24cCb1477A518A82C9EA81326',
    chain: 'gnosis'
  },
  {
    poolName: 'WETH-nextWETH',
    adopted: '0x4200000000000000000000000000000000000006',
    local: '0xbAD5B3c68F855EaEcE68203312Fd88AD3D365e50',
    chain: 'optimism'
  },
  {
    poolName: 'WETH-nextWETH',
    adopted: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
    local: '0x0573AD07cA4f74757e5B2417Bf225BEbeBcF66D9',
    chain: 'linea'
  },
  {
    poolName: 'WETH-nextWETH',
    adopted: '0x420000000000000000000000000000000000000a',
    local: '0x3883B5Bdd61BA1b687de69eE50c9738D5ec501E9',
    chain: 'metis'
  },
  {
    poolName: 'WETH-nextWETH',
    adopted: '0x4200000000000000000000000000000000000006',
    local: '0xE08D4907b2C7aa5458aC86596b6D17B1feA03F7E',
    chain: 'base'
  },
  {
    poolName: 'WETH-nextWETH',
    adopted: '0x4200000000000000000000000000000000000006',
    local: '0x609aEfb9FB2Ee8f2FDAd5dc48efb8fA4EE0e80fB',
    chain: 'mode'
  },
  {
    poolName: 'USDC-nextUSDC',
    adopted: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    local: '0x5e7D83dA751F4C9694b13aF351B30aC108f32C38',
    chain: 'bsc'
  },
  {
    poolName: 'USDC-nextUSDC',
    adopted: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    local: '0x8c556cF37faa0eeDAC7aE665f1Bb0FbD4b2eae36',
    chain: 'arbitrum'
  },
  {
    poolName: 'USDC-nextUSDC',
    adopted: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    local: '0xF96C6d2537e1af1a9503852eB2A4AF264272a5B6',
    chain: 'polygon'
  },
  {
    poolName: 'USDC-nextUSDC',
    adopted: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
    local: '0x44CF74238d840a5fEBB0eAa089D05b763B73faB8',
    chain: 'gnosis'
  },
  {
    poolName: 'USDC-nextUSDC',
    adopted: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    local: '0x67E51f46e8e14D4E4cab9dF48c59ad8F512486DD',
    chain: 'optimism'
  },
  {
    poolName: 'USDC-nextUSDC',
    adopted: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
    local: '0x331152ca43B50B39F3a9f203685B98dbb9b42342',
    chain: 'linea'
  },
  {
    poolName: 'USDC-nextUSDC',
    adopted: '0xEA32A96608495e54156Ae48931A7c20f0dcc1a21',
    local: '0x9ac9aD5A82Ccd0Ab7584a037A7A2334Dc3715Be2',
    chain: 'metis'
  },
  {
    poolName: 'USDC-nextUSDC',
    adopted: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    local: '0x1ede59e0d39B14c038698B1036BDE9a4819C86D4',
    chain: 'base'
  },
  {
    poolName: 'USDT-nextUSDT',
    adopted: '0x55d398326f99059fF775485246999027B3197955',
    local: '0xD609f26B5547d5E31562B29150769Cb7c774B97a',
    chain: 'bsc'
  },
  {
    poolName: 'USDT-nextUSDT',
    adopted: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    local: '0x2fD7E61033b3904c65AA9A9B83DCd344Fa19Ffd2',
    chain: 'arbitrum'
  },
  {
    poolName: 'USDT-nextUSDT',
    adopted: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    local: '0xE221C5A2a8348f12dcb2b0e88693522EbAD2690f',
    chain: 'polygon'
  },
  {
    poolName: 'USDT-nextUSDT',
    adopted: '0x4ECaBa5870353805a9F068101A40E0f32ed605C6',
    local: '0xF4d944883D6FddC56d3534986feF82105CaDbfA1',
    chain: 'gnosis'
  },
  {
    poolName: 'USDT-nextUSDT',
    adopted: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    local: '0x4cBB28FA12264cD8E87C62F4E1d9f5955Ce67D20',
    chain: 'optimism'
  },
  {
    poolName: 'USDT-nextUSDT',
    adopted: '0xA219439258ca9da29E9Cc4cE5596924745e12B93',
    local: '0xbD7eAEd30936670C931B718F5D9014AFf82fC767',
    chain: 'linea'
  },
  {
    poolName: 'USDT-nextUSDT',
    adopted: '0xbB06DCA3AE6887fAbF931640f67cab3e3a16F4dC',
    local: '0xa6A8d22D5da43C9f6E5cF7b4e50941784e70F688',
    chain: 'metis'
  },
  {
    poolName: 'DAI-nextDAI',
    adopted: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    local: '0x86a343BCF17D79C475d300eed35F0145F137D0c9',
    chain: 'bsc'
  },
  {
    poolName: 'DAI-nextDAI',
    adopted: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    local: '0xfDe99b3B3fbB69553D7DaE105EF34Ba4FE971190',
    chain: 'arbitrum'
  },
  {
    poolName: 'DAI-nextDAI',
    adopted: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    local: '0xaDCe87b14d570665222C1172D18a221BF7690d5a',
    chain: 'polygon'
  },
  {
    poolName: 'DAI-nextDAI',
    adopted: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    local: '0x0e1D5Bcd2Ac5CF2f71841A9667afC1E995CaAf4F',
    chain: 'gnosis'
  },
  {
    poolName: 'DAI-nextDAI',
    adopted: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    local: '0xd64Bd028b560bbFc732eA18f282c64B86F3468e0',
    chain: 'optimism'
  }, 
  {
    poolName: 'METIS-nextMETIS',
    adopted: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000',
    local: '0x1a1162304654A79B4b6A3aF0D564CA1E3cC7cc1B',
    chain: 'metis'
  },
];

const URL_FORMATTED_CHAINS = {
  arbitrum: 'arbitrum',
  bsc: 'binance',
  polygon: 'polygon',
  gnosis: 'gnosis',
  optimism: 'optimism',
  linea: 'linea',
  metis: 'metis',
  base: 'base',
  mode: 'mode',
};


const constructPoolUrl = (poolName, chain) => {
  const symbol = POOL_TOKEN_SYMBOLS[poolName].toUpperCase();
  const urlFormattedChain = URL_FORMATTED_CHAINS[chain];
  return `https://bridge.connext.network/pool/${symbol}-on-${urlFormattedChain}`;
}

const getApy = async () => {
  const priceData = await Promise.all([
    utils.getPrices(['ethereum'], ['coingecko']),
    utils.getPrices([
      // USDC
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      // USDT
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      // DAI
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      // METIS
      "0x9e32b13ce7f2e80a01932b42553652e053d6ed8e"
    ], "ethereum")
  ]) 

  const pools = [];
  const promises = [];
  for (const meta of POOLS_META) {
    const poolTokenSymbol = POOL_TOKEN_SYMBOLS[meta.poolName] 
    const price = priceData.find((p) => poolTokenSymbol in p.pricesBySymbol).pricesBySymbol[poolTokenSymbol]

    const promise = axios.post(`${API_URL}/getYieldData`, {
      domainId: CHAIN_DOMAINS[meta.chain],
      tokenAddress: meta.adopted,
      days: 7,
    }).then((yieldStats) => {
      pools.push({
        pool: `${meta.local}-${meta.chain}`,
        chain: utils.formatChain(meta.chain),
        project: 'connext',
        symbol: meta.poolName,
        apyBase: yieldStats.data.apy * 100,
        apyReward: 0,
        rewardTokens: [],
        underlyingTokens: [meta.adopted, meta.local],
        tvlUsd: yieldStats.data.liquidity * price,
        url: constructPoolUrl(meta.poolName, meta.chain)
      });
    });

    promises.push(promise);
  }

  await Promise.all(promises);
  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
