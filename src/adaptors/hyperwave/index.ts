const utils = require('../utils');
const axios = require('axios');
const sdk = require('@defillama/sdk');
const Vault = require('./Vault.json');
const Accountant = require('./Accountant.json');
const ethers = require('ethers');

const hwHLP = '0x9FD7466f987Fd4C45a5BBDe22ED8aba5BC8D72d1';
const hwHLP_ACCOUNTANT = '0x78E3Ac5Bf48dcAF1835e7F9861542c0D43D0B03E';
const UNDERLYING = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC

// const CHAIN = 'ethereum';
const ethRPC = process.env.ALCHEMY_CONNECTION_ETHEREUM;
const ethPROVIDER = new ethers.providers.JsonRpcProvider(ethRPC);
// const CHAIN = 'hyperliquid';
const hyperevmRPC = 'https://rpc.hyperlend.finance/archive';
const hyperevmPROVIDER = new ethers.providers.JsonRpcProvider(hyperevmRPC);

const config = [
  {
    chain : "ethereum",
    provider: ethPROVIDER
  },
  {
    chain: "hyperliquid",
    provider: hyperevmPROVIDER
  },
]


/**
 * Calculate TVL (Total Value Locked) for the vault
 */
const calculateTVL = async (provider) => {
  const totalSupplyCall = sdk.api.abi.call({
    target: hwHLP,
    abi: Vault.find((m) => m.name === 'totalSupply'),
    provider: provider,
  });

  const decimalsCall = sdk.api.abi.call({
    target: hwHLP,
    abi: Vault.find((m) => m.name === 'decimals'),
    provider: provider,
  });

  const priceKey = `ethereum:${UNDERLYING}`;
  const underlyingPriceCall = axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}?searchWidth=24h`
  );

  const currentRateCall = sdk.api.abi.call({
    target: hwHLP_ACCOUNTANT,
    abi: Accountant.find((m) => m.name === 'getRate'),
    provider: provider,
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

  const decimals = decimalsResponse.output;
  const scalingFactor = 10 ** decimals;
  const totalSupply = totalSupplyResponse.output / scalingFactor;
  const underlyingPrice = underlyingPriceResponse.data.coins[priceKey].price;
  const currentRate = currentRateResponse.output;
  
  const tvlUsd = totalSupply * (currentRate / scalingFactor) * underlyingPrice;

  return {
    tvlUsd,
    decimals,
    scalingFactor,
    currentRate,
  };
};

/**
 * Calculate APR (Annual Percentage Rate) for 1 day and 7 days
 */
const calculateAPR = async (currentRate, scalingFactor, chain="ethereum", provider=ethPROVIDER) => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;

  const block1dayAgoCall = axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp1dayAgo}`
  );
  const block7dayAgoCall = axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp7dayAgo}`
  );

  const [block1dayAgoResponse, block7dayAgoResponse] = await Promise.all([
    block1dayAgoCall,
    block7dayAgoCall,
  ]);

  const block1dayAgo = block1dayAgoResponse.data.height;
  const block7dayAgo = block7dayAgoResponse.data.height;

  const [rate1dayAgo, rate7dayAgo] = await Promise.all([
    sdk.api.abi.call({
      target: hwHLP_ACCOUNTANT,
      abi: Accountant.find((m) => m.name === 'getRate'),
      block: block1dayAgo,
      provider: provider,
    }),
    sdk.api.abi.call({
      target: hwHLP_ACCOUNTANT,
      abi: Accountant.find((m) => m.name === 'getRate'),
      block: block7dayAgo,
      provider: provider,
    }),
  ]);

  const apr1d = ((currentRate - rate1dayAgo.output) / scalingFactor) * 365 * 100;
  const apr7d = ((currentRate - rate7dayAgo.output) / scalingFactor / 7) * 365 * 100;

  return {
    apr1d,
    apr7d,
  };
};

/**
 * Main function that orchestrates TVL and APR calculations
 */
const apy = async () => {
  const out = await Promise.all(config.map(
    async (chainConfig) => {

      const { tvlUsd, currentRate, scalingFactor } = await calculateTVL(chainConfig.provider);
      const { apr1d, apr7d } = await calculateAPR(currentRate, scalingFactor);
      return [
        {
          pool: hwHLP,
          project: 'hyperwave',
          chain: utils.formatChain(chainConfig.chain),
          symbol: 'hwHLP',
          tvlUsd: tvlUsd,
          apyBase: apr1d,
          apyBase7d: apr7d,
          underlyingTokens: [UNDERLYING],
        },
      ];
    }
  ))
  
  return out

};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.hyperwavefi.xyz/assets/hwhlp',
};