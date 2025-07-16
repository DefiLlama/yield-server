const axios = require('axios');
const { ethers } = require('ethers');
const utils = require('../utils');
const sdk = require('@defillama/sdk');

const fetchApy = async () => {
  const [filPool, icntPool] = await Promise.all([
    getFilecoinPool(),
    getICNTPool(),
  ]);

  return [filPool, icntPool];
};

const getFilecoinPool = async () => {
  const { data: apyData } = await axios.get(
    'https://events.glif.link/pool/apy'
  );

  const { data: metricsData } = await axios.get(
    'https://events.glif.link/metrics'
  );

  // div out the wad of 18 decimals
  let tvlFIL = metricsData.totalValueLocked / 10 ** 18;

  // <- Filecoin ->
  const filPriceKey = `coingecko:filecoin`;
  const filPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${filPriceKey}`)
  ).data.coins[filPriceKey]?.price;

  return {
    pool: '0xe764Acf02D8B7c21d2B6A8f0a96C78541e0DC3fd-filecoin',
    chain: utils.formatChain('filecoin'),
    project: 'glif',
    symbol: utils.formatSymbol('IFIL'),
    tvlUsd: tvlFIL * filPrice,
    apy: Number(apyData.apy),
    poolMeta: 'GLIF',
  };
};

const getICNTPool = async () => {
  const icntPool = {
    pool: '0xAeD7C2eD7Bb84396AfCB55fF72c8F8E87FFb68f3-base',
    chain: utils.formatChain('base'),
    project: 'glif',
    symbol: utils.formatSymbol('stICNT'),
    tvlUsd: 0,
    apy: 0,
    poolMeta: 'GLIF',
  };

  try {
    // Periphery contract address
    const peripheryAddress = '0x3a24CFF2F5c9af8e77775418A115214e171112B8';

    // ABI for the apy() and tvl() methods
    const peripheryABI = [
      {
        inputs: [],
        name: 'apy',
        outputs: [
          {
            internalType: 'uint256',
            name: '',
            type: 'uint256',
          },
        ],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'tvl',
        outputs: [
          {
            internalType: 'uint256',
            name: '',
            type: 'uint256',
          },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    ];

    // Call both apy() and tvl() methods using DefiLlama SDK with timeout
    const [apyRaw, tvlRaw] = await Promise.allSettled([
      sdk.api.abi.call({
        target: peripheryAddress,
        abi: peripheryABI.find((abi) => abi.name === 'apy'),
        chain: 'base',
      }),
      sdk.api.abi.call({
        target: peripheryAddress,
        abi: peripheryABI.find((abi) => abi.name === 'tvl'),
        chain: 'base',
      }),
    ]);

    // Handle APY result
    if (apyRaw.status === 'fulfilled' && apyRaw.value?.output) {
      icntPool.apy =
        Number(ethers.utils.formatUnits(apyRaw.value.output, 18)) * 100;
    }

    // Handle TVL result
    let tvlRawNumber = 0;
    if (tvlRaw.status === 'fulfilled' && tvlRaw.value?.output) {
      tvlRawNumber = Number(ethers.utils.formatUnits(tvlRaw.value.output, 18));
    }

    // Try to get ICNT price with timeout
    try {
      const icntPriceKey = `coingecko:impossible-cloud-network-token`;
      const priceResponse = await axios.get(
        `https://coins.llama.fi/prices/current/${icntPriceKey}`,
        {
          timeout: 10000, // 10 second timeout
        }
      );
      const icntPrice = priceResponse.data.coins[icntPriceKey]?.price || 0;
      icntPool.tvlUsd = tvlRawNumber * icntPrice;
    } catch (priceError) {
      console.error('Error fetching ICNT price:', priceError.message);
      icntPool.tvlUsd = 0;
    }

    return icntPool;
  } catch (error) {
    console.error('Error fetching ICNT pool data:', error.message);
    return icntPool;
  }
};

module.exports = {
  timetravel: false,
  apy: fetchApy,
  url: 'https://www.glif.io',
};
