const utils = require('../utils');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const marketDataABI = require('./abi');

const marketConfig = {
  '0x4c8e1656E042A206EEf7e8fcff99BaC667E4623e': {
    name: 'LUSDT',
    symbol: 'USDT',
    decimals: 6,
    underlyingAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  '0x0dDB1eA478F8eF0E22C7706D2903a41E94B1299B': {
    name: 'LUSDC',
    symbol: 'USDC',
    decimals: 6,
    underlyingAddress: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  },
  '0xb190214D5EbAc7755899F2D96E519aa7a5776bEC': {
    name: 'LETH',
    symbol: 'ETH',
    decimals: 18,
    underlyingAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  '0x2E9963ae673A885b6bfeDa2f80132CE28b784C40': {
    name: 'LFrax',
    symbol: 'FRAX',
    decimals: 18,
    underlyingAddress: '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
  },
  '0x21202227Bc15276E40d53889Bc83E59c3CccC121': {
    name: 'LARB',
    symbol: 'LARB',
    decimals: 18,
    underlyingAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
};

function getSupplyAndBorrowRate(liquidity, borrows, borrowRatePerBlock) {
  const utilization = BigNumber(borrows).isZero()
    ? BigNumber(0)
    : BigNumber(borrows).times(10000).div(BigNumber(liquidity).plus(borrows));

  const borrowAPR = BigNumber(borrowRatePerBlock).times(31556952);
  const supplyAPR = utilization.times(borrowAPR).div(10000);
  return [supplyAPR, borrowAPR];
}

async function getMarketsState() {
  const marketsOnChainState = (
    await sdk.api.abi.call({
      target: '0x711cc1578bc995bc0e27292cb1a340835d277c18',
      abi: marketDataABI.find((m) => m.name === 'getLTokens'),
      chain: 'arbitrum',
    })
  ).output;

  const marketsState = [];

  marketsOnChainState.forEach((state) => {
    const [supplyAPR, borrowAPR] = getSupplyAndBorrowRate(
      state.liquidity,
      state.borrows,
      state.borrowRate
    );
    marketsState.push({
      liquidity: state.liquidity,
      borrows: state.borrows,
      supplyAPY: supplyAPR.div(10 ** 16),
      borrowAPY: borrowAPR.div(10 ** 16),
      market: state.lToken,
    });
  });

  return marketsState;
}

const apy = async () => {
  const apyData = await getMarketsState();
  const pools = [];
  const prices = (
    await utils.getPrices(
      Object.values(marketConfig).map((value) => value['underlyingAddress']),
      'arbitrum'
    )
  ).pricesByAddress;

  apyData.forEach((market) => {
    const config = marketConfig[market['market']];
    const decimals = BigNumber(10 ** config.decimals);
    const tvl = BigNumber(market['liquidity'])
      .div(decimals)
      .times(BigNumber(prices[config.underlyingAddress.toLowerCase()]));
    pools.push({
      pool: `${market['market']}-arbitrum`.toLowerCase(),
      chain: utils.formatChain('arbitrum'),
      project: 'sentiment',
      symbol: utils.formatSymbol(config['symbol']),
      tvlUsd: tvl.toNumber(),
      apyBase: parseFloat(market['supplyAPY']),
      underlyingTokens: [config.underlyingAddress],
      apyBaseBorrow: parseFloat(market['borrowAPY']),
      totalSupplyUsd: BigNumber(market['liquidity'])
        .div(decimals)
        .plus(BigNumber(market['borrows']).div(decimals))
        .times(BigNumber(prices[config.underlyingAddress.toLowerCase()]))
        .toNumber(),
      totalBorrowUsd: BigNumber(market['borrows'])
        .div(decimals)
        .times(BigNumber(prices[config.underlyingAddress.toLowerCase()]))
        .toNumber(),
      ltv: 1,
    });
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://arbitrum.sentiment.xyz/lending',
};
