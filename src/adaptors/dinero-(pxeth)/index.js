const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiData, getPriceApiUrl } = require('../utils');

const token = '0x9ba021b0a9b958b5e75ce9f6dff97c7ee52cb3e6';
const convertToAssetsAbi =
  'function convertToAssets(uint256 shares) external view returns (uint256)';
const SHARE_UNIT = '1000000000000000000';
const LOOKBACK_DAYS = 30;

const getBlock = async (timestamp) =>
  (await axios.get(getPriceApiUrl(`/block/ethereum/${timestamp}`))).data.height;

const pricePerShareAt = async (block) =>
  Number(
    (
      await sdk.api.abi.call({
        target: token,
        block,
        abi: convertToAssetsAbi,
        params: [SHARE_UNIT],
        chain: 'ethereum',
      })
    ).output
  );

const getOnChainApy = async () => {
  const now = Math.floor(Date.now() / 1e3);
  const [blockNow, blockThen] = await Promise.all([
    getBlock(now),
    getBlock(now - LOOKBACK_DAYS * 86400),
  ]);
  const [priceNow, priceThen] = await Promise.all([
    pricePerShareAt(blockNow),
    pricePerShareAt(blockThen),
  ]);
  if (
    !priceNow ||
    !priceThen ||
    !Number.isFinite(priceNow) ||
    !Number.isFinite(priceThen)
  )
    return null;

  return ((priceNow / priceThen) ** (365 / LOOKBACK_DAYS) - 1) * 100;
};

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (await axios.get('https://dinero.xyz/api/apr')).data;
  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  const reportedApy = apyData?.apxEth;
  let apyBase =
    reportedApy == null || String(reportedApy).trim() === ''
      ? NaN
      : Number(reportedApy);
  if (!Number.isFinite(apyBase)) apyBase = await getOnChainApy();
  if (!Number.isFinite(apyBase))
    throw new Error(
      'dinero: apxETH apy unavailable from dinero.xyz/api/apr and from on-chain pricePerShare'
    );

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'dinero-(pxeth)',
      symbol: 'apxeth',
      tvlUsd: tvl * ethPrice,
      apyBase,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      searchTokenOverride: token, //autocompounding Pirex Ether
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '3912',
  timetravel: false,
  apy: getApy,
  url: 'https://dineroismoney.com/pxeth/deposit',
};
