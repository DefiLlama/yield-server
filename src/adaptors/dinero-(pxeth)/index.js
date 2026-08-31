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

const convertToAssets = async (shares, block) =>
  Number(
    (
      await sdk.api.abi.call({
        target: token,
        block,
        abi: convertToAssetsAbi,
        params: [shares],
        chain: 'ethereum',
      })
    ).output
  );

const pricePerShareAt = (block) => convertToAssets(SHARE_UNIT, block);

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
    priceNow <= 0 ||
    priceThen <= 0 ||
    !Number.isFinite(priceNow) ||
    !Number.isFinite(priceThen)
  )
    throw new Error(
      `dinero: bad apxETH convertToAssets reads (${priceThen} -> ${priceNow})`
    );

  // No harvest during the lookback is a measured 0% return. A decrease is
  // likewise a real negative return, rather than a failed contract read.
  return ((priceNow / priceThen) ** (365 / LOOKBACK_DAYS) - 1) * 100;
};

const getApy = async () => {
  const shares = (await sdk.api.erc20.totalSupply({ target: token })).output;
  const tvl = (await convertToAssets(shares)) / 1e18;

  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  const apyBase = await getOnChainApy();

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'dinero-(pxeth)',
      symbol: 'apxeth',
      tvlUsd: tvl * ethPrice,
      apyBase,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
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
