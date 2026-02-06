const axios = require('axios');
const utils = require('../utils');

const XTOKENS = {
  xusdc: {
    address: '0xE9bE066a32c854dBbBc797823c445ec3fB0C42Ee',
    underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    statsKey: 'usdc',
  },
  xusdt: {
    address: '0x721E483FE764d3A6B636aEB87Ab391d23E6ffD3B',
    underlying: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    statsKey: 'usdt',
  },
  xwbtc: {
    address: '0x889Af8a5a5Cc6Db869c967b3f9e86B76a17145e1',
    underlying: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    statsKey: 'btc',
  },
};

const RWAUSDI = {
  ethereum: '0xA39986F96B80d04e8d7AeAaF47175F47C23FD0f4',
  base: '0xd74FB32112b1eF5b4C428Fead8dA8d85A0019009',
};

const RWAUSDI_DECIMALS = 6;

// Collateral assets used to mint rwaUSD
const RWAUSD_UNDERLYING = [
  '0x45804880De22913dAFE09f4980848ECE6EcbAf78', // PAXG
  '0x68749665FF8D2d112Fa859AA293F07A622782F38', // xAUT
  // TODO: ADD MH3 address once found
];

async function apy() {
  const [apyRes, statsRes, tvlRes, rwaRes] = await Promise.all([
    axios.get('https://api.multipli.fi/multipli/v2/get-apy/'),
    axios.get('https://api.multipli.fi/multipli/v2/platform-stats/'),
    axios.get(
      'https://api.multipli.fi/multipli/v1/external-aggregator/defillama/tvl/'
    ),
    axios.get('https://api.multipli.fi/multipli/v1/rwausd-stats'),
  ]);

  const apyData = apyRes.data.payload;
  const statsData = statsRes.data.payload;
  const tvlData = tvlRes.data.payload;
  const rwaData = rwaRes.data.payload;

  // Compute rwaUSDi APY from asset manager monthly yields
  // Each manager has an array of monthly net yields; we average the latest
  // month across all managers and annualize
  let rwaUsdApy = 0;
  if (rwaData.historical_am_yield_apy) {
    const managers = Object.values(rwaData.historical_am_yield_apy);
    const latestYields = managers
      .filter((m) => m.net_yield && m.net_yield.length > 0)
      .map((m) => m.net_yield[m.net_yield.length - 1]);
    if (latestYields.length > 0) {
      const avgMonthly =
        latestYields.reduce((sum, y) => sum + y, 0) / latestYields.length;
      rwaUsdApy = avgMonthly * 12;
    }
  }

  const apyMap = {};
  for (const item of apyData) {
    apyMap[item.currency] = parseFloat(item.latest_apy);
  }

  const pools = [];

  // xToken pools on Ethereum
  for (const [currency, token] of Object.entries(XTOKENS)) {
    const volumeData = statsData.volume_staked[token.statsKey];
    const parsed = parseFloat(volumeData?.total_volume_staked_usd);
    const tvlUsd = isFinite(parsed) ? parsed : 0;

    pools.push({
      pool: token.address,
      chain: utils.formatChain('ethereum'),
      project: 'multipli.fi',
      symbol: currency.toUpperCase(),
      tvlUsd,
      apy: apyMap[currency] || 0,
      underlyingTokens: [token.underlying],
      url: 'https://app.multipli.fi/',
    });
  }

  // rwaUSDi on Ethereum
  const rwaEthKey = `ethereum:${RWAUSDI.ethereum.toLowerCase()}`;
  const rwaEthRaw = tvlData.ethereum?.[rwaEthKey];
  if (!rwaEthRaw) {
    console.log(
      `multipli.fi: rwaUSDi key "${rwaEthKey}" not found in tvlData.ethereum, ` +
        `available keys: ${Object.keys(tvlData.ethereum || {}).join(', ')}`
    );
  } else {
    const tokenAmount = Number(rwaEthRaw) / 10 ** RWAUSDI_DECIMALS;
    // Fetch price from DefiLlama; rwaUSDi is ~$1 pegged but use real price
    let rwaEthTvl = tokenAmount; // fallback: treat as $1 per token
    try {
      const priceKey = `ethereum:${RWAUSDI.ethereum.toLowerCase()}`;
      const priceRes = await axios.get(
        `https://coins.llama.fi/prices/current/${priceKey}`
      );
      const price = priceRes.data.coins[priceKey]?.price;
      if (price) {
        rwaEthTvl = tokenAmount * price;
      } else {
        console.warn(
          `multipli.fi: no price found for ${priceKey}, falling back to $1 peg`
        );
      }
    } catch (e) {
      console.warn(
        `multipli.fi: price fetch failed for rwaUSDi, falling back to $1 peg`
      );
    }
    pools.push({
      pool: RWAUSDI.ethereum,
      chain: utils.formatChain('ethereum'),
      project: 'multipli.fi',
      symbol: 'rwaUSDi',
      tvlUsd: rwaEthTvl,
      apy: rwaUsdApy,
      underlyingTokens: RWAUSD_UNDERLYING,
      url: 'https://app.multipli.fi/rwaUSD'
    });
  }

  // rwaUSDi on Base **INSTITUTIONAL NOT AVAILABLE TO RETAIL FROM WHAT I CAN SEE**
  // const rwaBaseKey = `base:${RWAUSDI.base}`;
  // const rwaBaseRaw = tvlData.base?.[rwaBaseKey];
  // if (rwaBaseRaw) {
  //   const rwaBaseTvl = Number(rwaBaseRaw) / 10 ** RWAUSDI_DECIMALS;
  //   pools.push({
  //     pool: RWAUSDI.base,
  //     chain: utils.formatChain('base'),
  //     project: 'multipli.fi',
  //     symbol: 'rwaUSDi',
  //     tvlUsd: rwaBaseTvl,
  //     apy: rwaUsdApy,
  //     underlyingTokens: RWAUSD_UNDERLYING,
  //     url: 'https://app.multipli.fi/rwaUSD'
  //   });
  // }

  return pools;
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.multipli.fi/',
};
