const { request, gql } = require('graphql-request');
const BigNumber = require('bignumber.js');
const ethers = require('ethers');

const utils = require('../utils');

BigNumber.config({ EXPONENTIAL_AT: [-1e+9, 1e+9] });

const url = 'https://api.thegraph.com/subgraphs/id/QmcsWW8j9jKvCbfv4CfoavYBbWMmHfdgHyXMj3Pm9s9ihA';

const pageSizeLimit = 100;

const query = gql`
{
  markets(where: { totalValueLockedUSD_gt: 100 }) {
    id
    name
    totalValueLockedUSD
    totalBorrowBalanceUSD
    inputToken {
      id
      symbol
      decimals
      totalSupply
      lastPriceUSD
    }
    marketAssets {
      id
      balance
      supply
      protectedSupply
      tokenPriceUSD
      asset {
        id
        symbol
        decimals
        totalSupply
        lastPriceUSD
      }
    }
    rates {
      rate
      side
      token {
        id
        symbol
      }
    }
    cumulativeBorrowUSD
  }
}
`;

const buildMarketName = (symbol) => {
  let formattedSymbol = utils.formatSymbol(symbol);
  if(formattedSymbol === 'ETH') {
    return 'ETH-XAI';
  } else if (formattedSymbol === 'XAI') {
    return 'XAI-ETH';
  } else {
    return `${formattedSymbol}-ETH-XAI`
  }
}

const main = async () => {
  // market data
  const data = await request(url, query);

  const markets = [];

  for(let market of data.markets) {

    const {
      id,
      name,
      totalValueLockedUSD,
      cumulativeBorrowUSD,
      inputToken,
      marketAssets,
      rates,
      totalBorrowBalanceUSD,
    } = market;

    let underlyingAssetAddresses = [];
    for(let i = 0; i < marketAssets.length; i++) {
      underlyingAssetAddresses.push(marketAssets[i].asset.id);
    }
    const tvlUsd = new BigNumber(totalValueLockedUSD).minus(new BigNumber(totalBorrowBalanceUSD)).toNumber()

    let inputTokenBorrowRateObject = rates.find(rate => (rate.token.id === inputToken.id) && (rate.side === 'BORROWER'));
    let inputTokenSupplyRateObject = rates.find(rate => (rate.token.id === inputToken.id) && (rate.side === 'LENDER'));
    
    markets.push({
      pool: `${market.id}-ethereum`,
      chain: 'Ethereum',
      project: 'silo-finance',
      symbol: buildMarketName(name),
      tvlUsd,
      apyBase: Number(inputTokenSupplyRateObject.rate),
      apyBaseBorrow: Number(inputTokenBorrowRateObject.rate),
      url: `https://app.silo.finance/silo/${market.id}`,
      underlyingTokens: underlyingAssetAddresses,
    })
  };

  return markets;
  
};

module.exports = {
  timetravel: false,
  apy: main,
};
