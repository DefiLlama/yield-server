const axios = require('axios');
const { ethers } = require('ethers');
const utils = require('../utils');

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
    pool: '0x43dAe5624445e7679D16a63211c5ff368681500c-filecoin',
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
    // Base chain RPC endpoint
    const provider = new ethers.providers.JsonRpcProvider(
      'https://mainnet.base.org'
    );

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

    const peripheryContract = new ethers.Contract(
      peripheryAddress,
      peripheryABI,
      provider
    );

    // Call both apy() and tvl() methods in parallel
    const [apyRaw, tvlRaw] = await Promise.all([
      peripheryContract.apy(),
      peripheryContract.tvl(),
    ]);

    icntPool.apy = Number(ethers.utils.formatUnits(apyRaw, 18)) * 100;

    // Convert from wei to USD (assuming the contract returns TVL in wei)
    // You may need to adjust this conversion based on how the contract returns the TVL
    const tvlRawNumber = Number(ethers.utils.formatUnits(tvlRaw, 18));

    // <- ICNT ->
    const icntPriceKey = `coingecko:impossible-cloud-network-token`;
    const icntPrice = (
      await axios.get(`https://coins.llama.fi/prices/current/${icntPriceKey}`)
    ).data.coins[icntPriceKey]?.price;

    icntPool.tvlUsd = tvlRawNumber * icntPrice;

    return icntPool;
  } catch (error) {
    console.error('Error fetching ICNT pool data:', error);
    return icntPool;
  }
};

module.exports = {
  timetravel: false,
  apy: fetchApy,
  url: 'https://www.glif.io',
};
