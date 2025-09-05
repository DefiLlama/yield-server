
const axios = require('axios');
const utils = require('../utils');
const sdk = require('@defillama/sdk');

const poolAbi = require('./poolAbi.json');
const accountantAbi = require('./accountantAbi.json');

const LHYPE = '0x5748ae796AE46A4F1348a1693de4b50560485562';
const LHYPE_ACCOUNTANT = '0xcE621a3CA6F72706678cFF0572ae8d15e5F001c3';
const UNDERLYING = '0x5555555555555555555555555555555555555555'; // WHYPE on Hyperliquid
const CHAIN = 'hyperliquid';

/* ---------------------------------
   TVL Calculation Section
----------------------------------*/
const calculateTVL = async (chain = CHAIN) => {
  const totalSupplyCall = sdk.api.abi.call({
    target: LHYPE,
    abi: poolAbi.find((m) => m.name === 'totalSupply'),
    chain,
  });

  const decimalsCall = sdk.api.abi.call({
    target: LHYPE,
    abi: poolAbi.find((m) => m.name === 'decimals'),
    chain,
  });

  const priceKey = `${chain}:${UNDERLYING}`;
  const underlyingPriceCall = axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}?searchWidth=24h`
  );

  const currentRateCall = sdk.api.abi.call({
    target: LHYPE_ACCOUNTANT,
    abi: accountantAbi.find((m) => m.name === 'getRate'),
    chain,
  });

  const [
    totalSupplyResponse,
    decimalsResponse,
    underlyingPriceResponse,
    currentRateResponse,
  ] = await Promise.all([
    totalSupplyCall,
    decimalsCall,
    underlyingPriceCall,
    currentRateCall,
  ]);

  const decimals = Number(decimalsResponse.output);
  const scalingFactor = 10 ** decimals;

  const totalSupply = Number(totalSupplyResponse.output) / scalingFactor;
  const currentRate = Number(currentRateResponse.output);

  const priceObj = underlyingPriceResponse.data?.coins?.[priceKey];
  if (!priceObj || typeof priceObj.price !== 'number') {
    throw new Error(`No price found for ${priceKey}`);
  }
  const underlyingPrice = priceObj.price;
  const tvlUsd = totalSupply * currentRate * underlyingPrice / scalingFactor;

  return {
    tvlUsd,
    underlyingPrice,
    decimals,
    scalingFactor,
    totalSupply,
    currentRate,
  };
};

/* ---------------------------------
   APY Calculation Section
----------------------------------*/
const calculateAPY = async (currentRate, scalingFactor, chain = CHAIN) => {
  const now = Math.floor(Date.now() / 1000);
  const t1d = now - 86400;
  const t7d = now - 86400 * 7;

  const [b1, b7] = await Promise.all([
    axios.get(`https://coins.llama.fi/block/${chain}/${t1d}`),
    axios.get(`https://coins.llama.fi/block/${chain}/${t7d}`),
  ]);

  const block1d = b1.data?.height;
  const block7d = b7.data?.height;

  const [r1, r7] = await Promise.all([
    sdk.api.abi.call({
      target: LHYPE_ACCOUNTANT,
      abi: accountantAbi.find((m) => m.name === 'getRate'),
      block: block1d,
      chain,
    }),
    sdk.api.abi.call({
      target: LHYPE_ACCOUNTANT,
      abi: accountantAbi.find((m) => m.name === 'getRate'),
      block: block7d,
      chain,
    }),
  ]);

  const apy1d = ((Number(currentRate) - Number(r1.output)) / scalingFactor) * 365 * 100;
  const apy7d = ((Number(currentRate) - Number(r7.output)) / scalingFactor / 7) * 365 * 100;

  return {
    apy1d,
    apy7d,
  };
};

/* ---------------------------------
   Adapter Export
----------------------------------*/
const apy = async () => {
  const { tvlUsd, currentRate, scalingFactor } = await calculateTVL(CHAIN);
  const { apy1d, apy7d } = await calculateAPY(currentRate, scalingFactor, CHAIN);

  const pool = {
    pool: `${LHYPE}-${CHAIN}`.toLowerCase(),
    project: 'looped-hype',
    chain: utils.formatChain(CHAIN),
    symbol: 'LHYPE',
    tvlUsd,
    apyBase: apy1d,
    apyBase7d: apy7d,
    underlyingTokens: [UNDERLYING],
  };

  return [pool];
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.loopingcollective.org/product/lhype',
};
