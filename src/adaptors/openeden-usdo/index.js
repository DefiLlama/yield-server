const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getTotalSupply } = require('../utils');

// USDO is a rebasing stablecoin, cUSDO is wrapped non-rebasing version
// Both earn the same yield - we track USDO supply for TVL, cUSDO rate for APY
const config = {
  ethereum: {
    usdo: '0x8238884Ec9668Ef77B90C6dfF4D1a9F4F4823BFe',
    cusdo: '0xaD55aebc9b8c03FC43cd9f62260391c13c23e7c0',
  },
  base: {
    usdo: '0xaD55aebc9b8c03FC43cd9f62260391c13c23e7c0',
    cusdo: '0x83dB73EF5192de4B6a4c92bD0141Ba1a0Dc87c65',
  },
  bsc: {
    usdo: '0x302e52AFf9815B9D1682473DBFB9C74F9B750AA8',
    cusdo: '0x64748ea3E31d0B7916F0fF91b017B9f404DED8eF',
  },
  solana: {
    // Solana only has cUSDO
    cusdo: 'BnANu5CtUogLqcvBNByJuwaRvRxNtVuDcAytwjsUUtqs',
  },
};

const project = 'openeden-usdo';
const symbol = 'USDO';

// Helper to fetch block number for a timestamp
const getBlock = async (chain, timestamp) => {
  const response = await axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp}`
  );
  return response.data.height;
};

// Get cUSDO exchange rate (assets per share) at a specific block
const getExchangeRate = async (chain, address, block) => {
  const [totalAssets, totalSupply] = await Promise.all([
    sdk.api.abi.call({
      target: address,
      chain,
      abi: 'uint256:totalAssets',
      block,
    }),
    sdk.api.abi.call({
      target: address,
      chain,
      abi: 'uint256:totalSupply',
      block,
    }),
  ]);

  if (totalSupply.output === '0') return 1;
  return Number(totalAssets.output) / Number(totalSupply.output);
};

const apy = async () => {
  const pools = [];

  // Get timestamps for APY calculation
  const timestampNow = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = timestampNow - 86400;
  const timestamp7daysAgo = timestampNow - 86400 * 7;

  // Use Ethereum as canonical source for exchange rates (same underlying asset)
  const ethConfig = config.ethereum;
  const [blockNow, block1dayAgo, block7daysAgo] = await Promise.all([
    getBlock('ethereum', timestampNow),
    getBlock('ethereum', timestamp1dayAgo),
    getBlock('ethereum', timestamp7daysAgo),
  ]);

  const [rateNow, rate1dayAgo, rate7daysAgo] = await Promise.all([
    getExchangeRate('ethereum', ethConfig.cusdo, blockNow),
    getExchangeRate('ethereum', ethConfig.cusdo, block1dayAgo),
    getExchangeRate('ethereum', ethConfig.cusdo, block7daysAgo),
  ]);

  const apyBase =
    ((rateNow - rate1dayAgo) / rate1dayAgo) * (365 / 1) * 100;
  const apyBase7d =
    ((rateNow - rate7daysAgo) / rate7daysAgo) * (365 / 7) * 100;
  // Fetch USDO supplies for TVL (USDO is the main token, cUSDO is wrapped)
  // Solana only has cUSDO, so we track that there
  const [ethSupply, baseSupply, bscSupply, solSupply] = await Promise.all([
    sdk.api.erc20.totalSupply({
      target: config.ethereum.usdo,
      chain: 'ethereum',
    }),
    sdk.api.erc20.totalSupply({
      target: config.base.usdo,
      chain: 'base',
    }),
    sdk.api.erc20.totalSupply({
      target: config.bsc.usdo,
      chain: 'bsc',
    }),
    getTotalSupply(config.solana.cusdo).catch(() => 0),
  ]);

  const supplies = {
    ethereum: Number(ethSupply.output) / 1e18,
    base: Number(baseSupply.output) / 1e18,
    bsc: Number(bscSupply.output) / 1e18,
    solana: typeof solSupply === 'number' ? solSupply : 0,
  };

  const chainNames = {
    ethereum: 'Ethereum',
    base: 'Base',
    bsc: 'Binance',
    solana: 'Solana',
  };

  for (const [chain, addresses] of Object.entries(config)) {
    const supply = supplies[chain];
    if (!supply || supply === 0) continue;

    // USDO is pegged to $1, so TVL = supply
    // For Solana (cUSDO only), multiply by exchange rate
    const tvlUsd = chain === 'solana' ? supply * rateNow : supply;

    // Only add pool if TVL > $1000
    if (tvlUsd > 1000) {
      // Use USDO address for pool ID where available, cUSDO for Solana
      const tokenAddress = addresses.usdo || addresses.cusdo;
      const pool = {
        pool:
          chain === 'solana'
            ? addresses.cusdo
            : `${tokenAddress.toLowerCase()}-${chain}`,
        chain: chainNames[chain],
        project,
        symbol: chain === 'solana' ? 'cUSDO' : 'USDO',
        tvlUsd,
        apyBase,
        apyBase7d,
        underlyingTokens: [tokenAddress],
        url: 'https://app.openeden.com/usdo',
      };

      pools.push(pool);
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.openeden.com/usdo',
};
