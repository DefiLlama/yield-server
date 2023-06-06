const axios = require('axios');
const BigNumber = require('bignumber.js');
const superagent = require('superagent');
const {
  chainSupported,
  ethereumRefUnderlyingTokenAddress,
  supportedChainName,
  ypoolTokenAddress,
} = require('./config');

const main = async () => {
  const { data: resp } = await axios.get('https://api.xy.finance/ypool/stats/eachVault');
  if (!resp.isSuccess) {
    throw new Error('Failed to fetch data from XY Finance');
  }

  var pools = [];
  for (const [symbol, vaultInfo] of Object.entries(resp.eachYpoolVault)) {
    const refAddr = ethereumRefUnderlyingTokenAddress(symbol);
    const key = `ethereum:${refAddr}`;
    const priceRes = await superagent.get(
      `https://coins.llama.fi/prices/current/${key}`
    );
    const tokenPrice = priceRes.body.coins[key].price;
    for (const chainId of vaultInfo.supportedChains) {
      if (!chainSupported(chainId)) {
        continue;
      }
      const chainName = supportedChainName(chainId);
      const ypoolToken = ypoolTokenAddress(symbol, chainId);
      pools.push({
        pool: `ypool-${symbol}-${chainName}`.toLowerCase(),
        chain: chainName,
        project: 'xy-finance',
        symbol: symbol,
        apyBase: Number(vaultInfo.dayAPY),
        rewardTokens: [ypoolToken],
        underlyingTokens: [ypoolToken],
        tvlUsd: Number(vaultInfo.TVL) * tokenPrice,
      });
    }
  }
  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.xy.finance/pools',
};
