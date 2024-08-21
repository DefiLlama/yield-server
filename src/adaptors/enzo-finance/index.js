const ethers = require('ethers');
const cEthABI = require('./ceth.json');
const cERC20ABI = require('./cerc20.json');
const { default: BigNumber } = require('bignumber.js');
const { getPrices } = require('../utils');

const blockInterval = 3;
const blocksPerMinute = 60 / blockInterval;
const blocksPerDay = blocksPerMinute * 60 * 24;
const daysPerYear = 365;
const chain = 'Bitlayer';
const markets = [
  {
    pool: '0xe277Aed3fF3Eb9824EdC52Fe7703DF0c5ED8B313',
    decimals: 18,
    isCurrency: true,
    symbol: 'BTC',
    underlyingToken: '0xfF204e2681A6fA0e2C3FaDe68a1B28fb90E4Fc5F',
  },
  {
    pool: '0xF6Fa83E30c7d3978F86141016ee9471d77f48aE0',
    decimals: 6,
    symbol: 'USDT',
    underlyingToken: '0xfe9f969faf8Ad72a83b761138bF25dE87eFF9DD2',
  },
  {
    pool: '0xBb0CB5C5e49d5C3903932d07831fB8c1bB1651d2',
    decimals: 6,
    symbol: 'USDC',
    underlyingToken: '0x9827431e8b77E87C9894BD50B055D6BE56bE0030',
  },
  {
    pool: '0xAb7f136BBb18808F0C981D0307D3360cA92AD171',
    decimals: 18,
    symbol: 'ETH',
    underlyingToken: '0xEf63d4E178b3180BeEc9B0E143e0f37F4c93f4C2',
  },
];

const getContractWithCToken = (cToken, provider) => {
  if (!cToken.poolContract) {
    cToken.poolContract = new ethers.Contract(
      cToken.pool,
      cToken.isCurrency ? cEthABI : cERC20ABI,
      provider
    );
  }

  return cToken.poolContract;
};

const getMarketsPrice = async () => {
  const prices = await getPrices(
    markets.map((market) => market.underlyingToken),
    'btr'
  );
  markets.forEach((market) => {
    market.price = prices.pricesByAddress[market.underlyingToken.toLowerCase()];
  });
};

const getDataByMarket = async (cToken, provider) => {
  const c = getContractWithCToken(cToken, provider);

  // const totalBorrowsCurrent = await c.callStatic.totalBorrowsCurrent();
  // const totalBorrowed = BigNumber(totalBorrowsCurrent._hex).shiftedBy(-cToken.decimals);
  // const totalBorrowedFiat = totalBorrowed.multipliedBy(cToken.price).toNumber();

  const cash = await c.getCash();
  const cashDecimals = BigNumber(cash._hex).shiftedBy(-cToken.decimals);
  const cashFiat = cashDecimals.multipliedBy(cToken.price).toNumber();

  const supplyRatePerBlock = await c.supplyRatePerBlock();
  const supplyRatePerBlockDecimals = BigNumber(supplyRatePerBlock._hex);
  const supplyApy =
    supplyRatePerBlockDecimals
      .shiftedBy(-18)
      .multipliedBy(blocksPerDay)
      .plus(1)
      .pow(daysPerYear - 1)
      .minus(1)
      .toNumber() * 100;

  return { cashFiat, supplyApy };
};

const apy = async () => {
  await getMarketsPrice();

  const provider = new ethers.providers.JsonRpcProvider(
    'https://rpc.bitlayer.org'
  );
  const pools = [];

  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    const { cashFiat, supplyApy } = await getDataByMarket(market, provider);

    pools.push({
      pool: market.pool,
      chain,
      project: 'enzo-finance',
      symbol: market.symbol,
      tvlUsd: cashFiat, // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
      apy: supplyApy,
      underlyingTokens: [market.underlyingToken],
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://enzo.finance/',
};
