const sdk = require('@defillama/sdk');
const axios = require('axios');
const BigNumber = require('bignumber.js');
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
    // uncomment if cannot be resolve dim
    // usdo: 'coingecko: openeden-open-dollar' 
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
// Returns a BigNumber to preserve precision for APY calculations
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

  if (totalSupply.output === '0') return new BigNumber(1);
  return new BigNumber(totalAssets.output).dividedBy(totalSupply.output);
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

  // Calculate APY using BigNumber for precision, convert to Number only at the end
  const apyBase = rateNow
    .minus(rate1dayAgo)
    .dividedBy(rate1dayAgo)
    .times(365)
    .times(100)
    .toNumber();
  const apyBase7d = rateNow
    .minus(rate7daysAgo)
    .dividedBy(rate7daysAgo)
    .times(365 / 7)
    .times(100)
    .toNumber();
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

  // Use BigNumber for supply conversion to avoid precision loss on large values
  const supplies = {
    ethereum: new BigNumber(ethSupply.output).dividedBy(1e18).toNumber(),
    base: new BigNumber(baseSupply.output).dividedBy(1e18).toNumber(),
    bsc: new BigNumber(bscSupply.output).dividedBy(1e18).toNumber(),
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
    const tvlUsd = chain === 'solana' ? rateNow.times(supply).toNumber() : supply;

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
