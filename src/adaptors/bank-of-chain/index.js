const utils = require('../utils');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const vault_abi = require('./vault_abi.json');
const USD_APY_URL =
  'https://service-pr02-sg.bankofchain.io/apy/vault_apy?chainId=1&duration=monthly&offset=0&limit=1&tokenType=USDi';
const ETH_APY_URL =
  'https://service-pr02-sg.bankofchain.io/apy/vault_apy?chainId=1&duration=monthly&offset=0&limit=1&tokenType=ETHi';
const USD_VAULT_ADDRESS = '0x30D120f80D60E7b58CA9fFaf1aaB1815f000B7c3';
const ETH_VAULT_ADDRESS = '0x8f0Cb368C63fbEDF7a90E43fE50F7eb8B9411746';
const ethAddress = '0x0000000000000000000000000000000000000000';

const usd_apy = async () => {
  const { content } = await utils.getData(USD_APY_URL);
  const apy = Number(content[0].apy);
  const trackedAssets = await sdk.api.abi.call({
    abi: vault_abi.getTrackedAssets,
    chain: 'ethereum',
    target: USD_VAULT_ADDRESS,
  });
  const totalAsset = await sdk.api.abi.call({
    abi: vault_abi.totalAssets,
    chain: 'ethereum',
    target: USD_VAULT_ADDRESS,
  });

  return {
    pool: `${USD_VAULT_ADDRESS}-ethereum`,
    chain: utils.formatChain('ethereum'),
    project: 'bank-of-chain',
    symbol: 'USDi',
    tvlUsd: Number(totalAsset.output / 10 ** 18),
    apyBase: Number.isFinite(apy) ? apy : 0,
    underlyingTokens: trackedAssets.output,
  };
};

const eth_apy = async () => {
  const { content } = await utils.getData(ETH_APY_URL);
  const apy = Number(content[0].apy);
  const trackedAssets = await sdk.api.abi.call({
    abi: vault_abi.getTrackedAssets,
    chain: 'ethereum',
    target: ETH_VAULT_ADDRESS,
  });
  const totalAsset = await sdk.api.abi.call({
    abi: vault_abi.totalAssets,
    chain: 'ethereum',
    target: ETH_VAULT_ADDRESS,
  });
  const key = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const ethPriceUSD = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;

  return {
    pool: `${ETH_VAULT_ADDRESS}-ethereum`,
    chain: utils.formatChain('ethereum'),
    project: 'bank-of-chain',
    symbol: 'ETHi',
    tvlUsd: Number((totalAsset.output * ethPriceUSD) / 10 ** 18),
    apyBase: Number.isFinite(apy) ? apy : 0,
    underlyingTokens: trackedAssets.output,
  };
};

const apy = async () => {
  const pools = [await usd_apy(), await eth_apy()];
  return pools;
};

module.exports = {
  apy,
  url: 'https://bankofchain.io',
  timetravel: false,
};
