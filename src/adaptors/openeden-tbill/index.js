const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getTotalSupply } = require('../utils');

const config = {
  ethereum: {
    tbill: '0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a',
    priceOracle: '0xCe9a6626Eb99eaeA829D7fA613d5D0A2eaE45F40',
  },
  arbitrum: {
    tbill: '0xF84D28A8D28292842dD73D1c5F99476A80b6666A',
  },
  solana: {
    tbill: '4MmJVdwYN8LwvbGeCowYjSx7KoEi6BJWg8XXnW4fDDp6',
  },
  xrpl: {
    // TBL token issuer on XRPL
    issuer: 'rJNE2NNz83GJYtWVLwMvchDWEon3huWnFn',
    currency: 'TBL',
  },
};

// Use Ethereum oracle as the canonical price source (same underlying asset)
const CANONICAL_ORACLE = config.ethereum.priceOracle;
const project = 'openeden-tbill';
const symbol = 'TBILL';

const getBlock = (timestamp) =>
  axios
    .get(`https://coins.llama.fi/block/ethereum/${timestamp}`)
    .then((r) => r.data.height);

// Helper to fetch oracle price at a specific block
const getOraclePrice = (block) =>
  sdk.api.abi.call({
    target: CANONICAL_ORACLE,
    chain: 'ethereum',
    abi: 'uint256:latestAnswer',
    block,
  });

// Fetch XRPL issued token supply via gateway_balances
const getXrplSupply = async () => {
  try {
    const response = await axios.post('https://xrplcluster.com/', {
      method: 'gateway_balances',
      params: [
        {
          account: config.xrpl.issuer,
          ledger_index: 'validated',
        },
      ],
    });

    const obligations = response.data?.result?.obligations;
    if (obligations && obligations[config.xrpl.currency]) {
      // XRPL TBL token uses internal precision
      // Raw obligations ~9.97B -> ~54.5M tokens at $1.13 = ~$61.6M TVL
      // Decimal factor: 9.97B / 54.5M ≈ 183
      const rawSupply = parseFloat(obligations[config.xrpl.currency]);
      return rawSupply / 183;
    }
    return 0;
  } catch (error) {
    console.error('OpenEden: Error fetching XRPL supply:', error.message);
    return 0;
  }
};

const apy = async () => {
  const [tvlEth, tvlArb, tvlSol, tvlXrpl] = await Promise.all([
    sdk.api.erc20.totalSupply({
      target: config.ethereum.tbill,
      chain: 'ethereum',
    }),
    sdk.api.erc20.totalSupply({
      target: config.arbitrum.tbill,
      chain: 'arbitrum',
    }),
    getTotalSupply(config.solana.tbill).catch(() => 0),
    getXrplSupply(),
  ]);

  // TBILL token uses 6 decimals on EVM chains
  const supplyEth = tvlEth.output / 1e6;
  const supplyArb = tvlArb.output / 1e6;
  const supplySol = typeof tvlSol === 'number' ? tvlSol : 0;
  const supplyXrpl = tvlXrpl;

  const timestampNow = Math.floor(Date.now() / 1000);
  const timestamp7daysAgo = timestampNow - 86400 * 7;
  const timestamp30daysAgo = timestampNow - 86400 * 30;

  const [blockNow, block7daysAgo, block30daysAgo] = await Promise.all([
    getBlock(timestampNow),
    getBlock(timestamp7daysAgo),
    getBlock(timestamp30daysAgo),
  ]);

  // Fetch price from oracle at different points in time
  // Oracle updates once per business day (US), so using 30-day provides stability
  const [priceNow, price7daysAgo, price30daysAgo] = await Promise.all([
    getOraclePrice(blockNow),
    getOraclePrice(block7daysAgo),
    getOraclePrice(block30daysAgo),
  ]);

  // Oracle returns price with 8 decimals (Chainlink standard)
  const priceNowNum = priceNow.output / 1e8;
  const price7daysAgoNum = price7daysAgo.output / 1e8;
  const price30daysAgoNum = price30daysAgo.output / 1e8;

  // Calculate APR (linear, not compounded) - same approach as superstate-uscc
  // This handles business-day-only oracle updates better
  const apyBase7d =
    ((priceNowNum - price7daysAgoNum) / price7daysAgoNum) * (365 / 7) * 100;
  const apyBase =
    ((priceNowNum - price30daysAgoNum) / price30daysAgoNum) * (365 / 30) * 100;

  const pools = [
    {
      pool: `${config.ethereum.tbill.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project,
      symbol,
      tvlUsd: supplyEth * priceNowNum,
      apyBase,
      apyBase7d,
      underlyingTokens: [config.ethereum.tbill],
      url: 'https://app.openeden.com/tbill?chain=mainnet',
    },
    {
      pool: `${config.arbitrum.tbill.toLowerCase()}-arbitrum`,
      chain: 'Arbitrum',
      project,
      symbol,
      tvlUsd: supplyArb * priceNowNum,
      apyBase,
      apyBase7d,
      underlyingTokens: [config.arbitrum.tbill],
      url: 'https://app.openeden.com/tbill?chain=arbitrum',
    },
  ];

  // Add Solana pool if supply > 0
  if (supplySol > 0) {
    pools.push({
      pool: config.solana.tbill,
      chain: 'Solana',
      project,
      symbol,
      tvlUsd: supplySol * priceNowNum,
      apyBase,
      apyBase7d,
      underlyingTokens: [config.solana.tbill],
      url: 'https://app.openeden.com/tbill',
    });
  }

  // Add XRPL pool if supply > 0
  if (supplyXrpl > 0) {
    pools.push({
      pool: `${config.xrpl.issuer}-xrpl`,
      chain: 'Ripple',
      project,
      symbol: 'TBL',
      tvlUsd: supplyXrpl * priceNowNum,
      apyBase,
      apyBase7d,
      underlyingTokens: [`${config.xrpl.currency}.${config.xrpl.issuer}`],
      url: 'https://app.openeden.com/tbill?chain=xrpl',
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.openeden.com/tbill',
};
