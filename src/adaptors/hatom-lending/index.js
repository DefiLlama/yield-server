const BigNumber = require('bignumber.js');
const axios = require('axios');

// On-chain data sources (MultiversX gateway for contract queries, API for prices)
const GATEWAY_URL = 'https://gateway.multiversx.com';
const API_URL = 'https://api.multiversx.com';

// NOTE: This adapter reports base Supply APY only. Hatom also offers "Booster" rewards
// (additional HTM token incentives) which are shown on their UI as part of "Net APY".
// The Booster rewards data requires Hatom's GraphQL API (mainnet-api.hatom.com/graphql)
// which is currently experiencing timeouts. When their API is restored, rewards can be
// re-added by querying queryRewardsBatchState for speed and rewardsToken data.

const MARKETS = [
  { symbol: 'EGLD', address: 'erd1qqqqqqqqqqqqqpgq35qkf34a8svu4r2zmfzuztmeltqclapv78ss5jleq3', decimals: 18, tokenId: 'EGLD' },
  { symbol: 'SEGLD', address: 'erd1qqqqqqqqqqqqqpgqxmn4jlazsjp6gnec95423egatwcdfcjm78ss5q550k', decimals: 18, tokenId: 'SEGLD-3ad2d0' },
  { symbol: 'WBTC', address: 'erd1qqqqqqqqqqqqqpgqg47t8v5nwzvdxgf6g5jkxleuplu8y4f678ssfcg5gy', decimals: 8, tokenId: 'WBTC-5349b3' },
  { symbol: 'WETH', address: 'erd1qqqqqqqqqqqqqpgq8h8upp38fe9p4ny9ecvsett0usu2ep7978ssypgmrs', decimals: 18, tokenId: 'WETH-b4ca29' },
  { symbol: 'USDC', address: 'erd1qqqqqqqqqqqqqpgqkrgsvct7hfx7ru30mfzk3uy6pxzxn6jj78ss84aldu', decimals: 6, tokenId: 'USDC-c76f1f' },
  { symbol: 'USDT', address: 'erd1qqqqqqqqqqqqqpgqvxn0cl35r74tlw2a8d794v795jrzfxyf78sstg8pjr', decimals: 6, tokenId: 'USDT-f8c08c' },
  { symbol: 'UTK', address: 'erd1qqqqqqqqqqqqqpgqta0tv8d5pjzmwzshrtw62n4nww9kxtl278ssspxpxu', decimals: 18, tokenId: 'UTK-2f80e9' },
  { symbol: 'HTM', address: 'erd1qqqqqqqqqqqqqpgqxerzmkr80xc0qwa8vvm5ug9h8e2y7jgsqk2svevje0', decimals: 18, tokenId: 'HTM-f51d55' },
  { symbol: 'WTAO', address: 'erd1qqqqqqqqqqqqqpgqz9pvuz22qvqxfqpk6r3rluj0u2can55c78ssgcqs00', decimals: 9, tokenId: 'WTAO-4f5363' },
  { symbol: 'SWTAO', address: 'erd1qqqqqqqqqqqqqpgq7sspywe6e2ehy7dn5dz00ved3aa450mv78ssllmln6', decimals: 9, tokenId: 'SWTAO-356a25' },
];

const COINGECKO_MAP = {
  EGLD: 'coingecko:elrond-erd-2',
  SEGLD: 'coingecko:elrond-erd-2',
  WBTC: 'coingecko:wrapped-bitcoin',
  WETH: 'coingecko:ethereum',
  USDC: 'coingecko:usd-coin',
  USDT: 'coingecko:tether',
  UTK: 'coingecko:utrust',
  HTM: 'coingecko:hatom',
  WTAO: 'coingecko:bittensor',
  SWTAO: 'coingecko:bittensor',
};

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

async function queryContract(address, funcName) {
  const response = await axios.post(`${GATEWAY_URL}/vm-values/query`, {
    scAddress: address,
    funcName,
    args: [],
  });

  const returnData = response.data?.data?.data?.returnData;
  if (!returnData || !returnData[0]) {
    return '0';
  }

  const buff = Buffer.from(returnData[0], 'base64');
  if (buff.length === 0) return '0';
  return BigInt('0x' + buff.toString('hex')).toString();
}

async function getMarketData(market) {
  const [cash, supplyRatePerSecond] = await Promise.all([
    queryContract(market.address, 'getCash'),
    queryContract(market.address, 'getSupplyRatePerSecond'),
  ]);

  return {
    symbol: market.symbol,
    address: market.address,
    cash,
    supplyRatePerSecond,
    decimals: market.decimals,
    tokenId: market.tokenId,
  };
}

async function getTokenPrices() {
  const tokenIds = MARKETS.filter(m => m.tokenId).map(m => m.tokenId).join(',');

  const [tokensResponse, economicsResponse] = await Promise.all([
    axios.get(`${API_URL}/tokens?identifiers=${tokenIds}`),
    axios.get(`${API_URL}/economics`),
  ]);

  const prices = {};

  // EGLD price from economics endpoint
  prices['EGLD'] = economicsResponse.data.price;

  // Other token prices
  for (const token of tokensResponse.data) {
    const market = MARKETS.find(m => m.tokenId === token.identifier);
    if (market) {
      prices[market.symbol] = token.price || 0;
    }
  }

  return prices;
}

function calculateAPY(supplyRatePerSecond) {
  // supplyRatePerSecond is in 1e18 format
  const rate = new BigNumber(supplyRatePerSecond).dividedBy(1e18);
  const apy = rate.multipliedBy(SECONDS_PER_YEAR).multipliedBy(100);
  return apy.toNumber();
}

const apy = async () => {
  const [marketDataList, prices] = await Promise.all([
    Promise.all(MARKETS.map(getMarketData)),
    getTokenPrices(),
  ]);

  return marketDataList
    .filter(market => {
      const price = prices[market.symbol];
      return price && price > 0;
    })
    .map(market => {
      const price = prices[market.symbol];
      const tvlUsd = new BigNumber(market.cash)
        .multipliedBy(price)
        .dividedBy(`1e${market.decimals}`)
        .toNumber();

      const apyBase = calculateAPY(market.supplyRatePerSecond);

      return {
        pool: market.symbol,
        chain: 'MultiversX',
        project: 'hatom-lending',
        symbol: market.symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: COINGECKO_MAP[market.symbol] ? [COINGECKO_MAP[market.symbol]] : [market.tokenId],
      };
    });
}

module.exports = {
   timetravel: false,
   apy: apy,
   url: 'https://app.hatom.com/lend',
};