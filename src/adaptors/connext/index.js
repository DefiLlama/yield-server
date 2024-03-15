const axios = require('axios');
const sdk = require('@defillama/sdk5');
const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const api = 'https://sdk-server.mainnet.connext.ninja';

const getApy = async () => {
  const priceData = await utils.getPrices(['ethereum'], ['coingecko']);
  const ethPrice = priceData.pricesBySymbol.eth;
  const pools = [];
  const poolsMeta = [
    {
      poolName: 'WETH-nextWETH',
      adopted: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      local: '0x2983bf5c334743Aa6657AD70A55041d720d225dB',
      chain: 'arbitrum',
      domain: '1634886255',
      url: 'https://bridge.connext.network/pool/ETH-on-arbitrum',
    },
    {
      poolName: 'WETH-nextWETH',
      adopted: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      local: '0xA9CB51C666D2AF451d87442Be50747B31BB7d805',
      chain: 'bsc',
      domain: '6450786',
      url: 'https://bridge.connext.network/pool/ETH-on-binance',
    },
    {
      poolName: 'WETH-nextWETH',
      adopted: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      local: '0x4b8BaC8Dd1CAA52E32C07755c17eFadeD6A0bbD0',
      chain: 'polygon',
      domain: '1886350457',
      url: 'https://bridge.connext.network/pool/ETH-on-polygon',
    },
    {
      poolName: 'WETH-nextWETH',
      adopted: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1',
      local: '0x538E2dDbfDf476D24cCb1477A518A82C9EA81326',
      chain: 'gnosis',
      domain: '6778479',
      url: 'https://bridge.connext.network/pool/ETH-on-gnosis',
    },
    {
      poolName: 'WETH-nextWETH',
      adopted: '0x4200000000000000000000000000000000000006',
      local: '0xbAD5B3c68F855EaEcE68203312Fd88AD3D365e50',
      chain: 'optimism',
      domain: '1869640809',
      url: 'https://bridge.connext.network/pool/ETH-on-optimism',
    },
    {
      poolName: 'WETH-nextWETH',
      adopted: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
      local: '0x0573AD07cA4f74757e5B2417Bf225BEbeBcF66D9',
      chain: 'linea',
      domain: '1818848877',
      url: 'https://bridge.connext.network/pool/ETH-on-linea',
    },
    {
      poolName: 'WETH-nextWETH',
      adopted: '0x420000000000000000000000000000000000000a',
      local: '0x3883B5Bdd61BA1b687de69eE50c9738D5ec501E9',
      chain: 'metis',
      domain: '1835365481',
      url: 'https://bridge.connext.network/pool/ETH-on-metis',
    },
    {
      poolName: 'WETH-nextWETH',
      adopted: '0x4200000000000000000000000000000000000006',
      local: '0xE08D4907b2C7aa5458aC86596b6D17B1feA03F7E',
      chain: 'base',
      domain: '1650553709',
      url: 'https://bridge.connext.network/pool/ETH-on-base',
    },
    {
      poolName: 'WETH-nextWETH',
      adopted: '0x4200000000000000000000000000000000000006',
      local: '0x609aEfb9FB2Ee8f2FDAd5dc48efb8fA4EE0e80fB',
      chain: 'mode',
      domain: '1836016741',
      url: 'https://bridge.connext.network/pool/ETH-on-mode',
    },
  ];
  for (const meta of poolsMeta) {
    const yieldStats = await axios.post(`${api}/getYieldData`, {
      domainId: meta.domain,
      tokenAddress: meta.adopted,
      days: 7,
    });

    pools.push({
      pool: `${meta.local}-${meta.chain}`,
      chain: utils.formatChain(meta.chain),
      project: 'connext',
      symbol: meta.poolName,
      apyBase: yieldStats.data.apy * 100,
      apyReward: 0,
      rewardTokens: [],
      underlyingTokens: [meta.adopted, meta.local],
      tvlUsd: yieldStats.data.liquidity * ethPrice,
      url: meta.url,
    });
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
