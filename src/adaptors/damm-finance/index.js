const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const abi = require('./abis.json');
const utils = require('../utils')

const unitroller = '0x4F96AB61520a6636331a48A11eaFBA8FB51f74e4';
const bdAMM = '0xfa372fF1547fa1a283B5112a4685F1358CE5574d';
const dAMM = '0xb3207935ff56120f3499e8ad08461dd403bf16b8';

const poolInfo = async (chain) => {
  const allMarkets = await sdk.api.abi.call({
    target: unitroller,
    chain,
    abi: abi.getAllMarkets,
  });

  const yieldMarkets = allMarkets.output.map((pool) => {
    return { pool };
  });

  const getOutput = ({ output }) => output.map(({ output }) => output);
  const [markets, compSpeeds] = await Promise.all(
    ['markets', 'compSpeeds'].map((method) =>
      sdk.api.abi.multiCall({
        abi: abi[method],
        target: unitroller,
        calls: yieldMarkets.map((pool) => ({
          params: pool.pool,
        })),
        chain,
      })
    )
  ).then((data) => data.map(getOutput));
  const collateralFactor = markets.map((data) => data.collateralFactorMantissa);

  const [
    borrowRatePerBlock,
    supplyRatePerBlock,
    getCash,
    totalBorrows,
    totalReserves,
    underlyingToken,
    tokenSymbol,
  ] = await Promise.all(
    [
      'borrowRatePerBlock',
      'supplyRatePerBlock',
      'getCash',
      'totalBorrows',
      'totalReserves',
      'underlying',
      'symbol',
    ].map((method) =>
      sdk.api.abi.multiCall({
        abi: abi[method],
        calls: yieldMarkets.map((address) => ({
          target: address.pool,
        })),
        chain,
      })
    )
  ).then((data) => data.map(getOutput));

  const underlyingTokenDecimals = (
    await sdk.api.abi.multiCall({
      abi: abi.decimals,
      calls: underlyingToken.map((token) => ({
        target: token,
      })),
      chain,
    })
  ).output.map((decimal) => Math.pow(10, Number(decimal.output)));

  const price = await getPrices('ethereum', underlyingToken);

  yieldMarkets.map((data, i) => {
    data.collateralFactor = collateralFactor[i];
    data.borrowRate = borrowRatePerBlock[i];
    data.supplyRate = supplyRatePerBlock[i];
    data.compSpeeds = compSpeeds[i];
    data.getCash = getCash[i];
    data.totalBorrows = totalBorrows[i];
    data.totalReserves = totalReserves[i];
    data.underlyingToken = underlyingToken[i];
    data.tokenSymbol = tokenSymbol[i];
    data.price = price[underlyingToken[i].toLowerCase()];
    data.underlyingTokenDecimals = underlyingTokenDecimals[i];
  });

  return { yieldMarkets };
};

const getPrices = async (chain, addresses) => {
  const uri = `${addresses.map((address) => `${chain}:${address}`)}`;
  const prices = (
    await superagent.get('https://coins.llama.fi/prices/current/' + uri)
  ).body.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

function calculateApy(rate, price = 1, tvl = 1) {
  // supply rate per block * number of blocks per year
  const BLOCK_TIME = 12;
  const YEARLY_BLOCKS = (365 * 24 * 60 * 60) / BLOCK_TIME;
  const safeTvl = tvl === 0 ? 1 : tvl;
  const apy = (((rate / 1e18) * YEARLY_BLOCKS * price) / safeTvl) * 100;
  return apy;
}

function calculateTvl(cash, borrows, reserves, price, decimals) {
  // ( cash + totalBorrows - reserve value ) * underlying price = balance
  const tvl =
    ((parseFloat(cash) + parseFloat(borrows) - parseFloat(reserves)) /
      decimals) *
    price;
  return tvl;
}

const getApy = async () => {
  const prices = await getPrices(['ethereum'], [bdAMM, dAMM]);

  const bdammPrice = prices[bdAMM.toLowerCase()];
  const dammPrice = prices[dAMM.toLowerCase()];

  // const discountRatio = bdammPrice / dammPrice
  // hardcoding this. need to see how they derive their bdammPrices...
  const discountRate = 0.05;

  const yieldMarkets = (await poolInfo('ethereum')).yieldMarkets;

  const symbol = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: yieldMarkets.map((p) => ({ target: p.underlyingToken })),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const yieldPools = yieldMarkets.map((pool, i) => {
    const totalSupplyUsd = calculateTvl(
      pool.getCash,
      pool.totalBorrows,
      pool.totalReserves,
      pool.price,
      pool.underlyingTokenDecimals
    );
    const totalBorrowUsd = calculateTvl(
      0,
      pool.totalBorrows,
      0,
      pool.price,
      pool.underlyingTokenDecimals
    );
    const tvlUsd = totalSupplyUsd - totalBorrowUsd;
    const apyBase = calculateApy(pool.supplyRate);
    const apyReward = calculateApy(pool.compSpeeds, bdammPrice, totalSupplyUsd);
    const apyBaseBorrow = calculateApy(pool.borrowRate);
    const apyRewardBorrow = calculateApy(
      pool.compSpeeds,
      bdammPrice,
      totalBorrowUsd
    );
    const ltv = parseInt(pool.collateralFactor) / 1e18;
    const readyToExport = exportFormatter(
      pool.pool,
      'Ethereum',
      symbol[i],
      tvlUsd,
      apyBase,
      apyReward * discountRate,
      pool.underlyingToken,
      [bdAMM],
      apyBaseBorrow,
      apyRewardBorrow * discountRate,
      totalSupplyUsd,
      totalBorrowUsd,
      ltv
    );
    return readyToExport;
  });

  return yieldPools.filter(i => utils.keepFinite(i));
};

function exportFormatter(
  pool,
  chain,
  symbol,
  tvlUsd,
  apyBase,
  apyReward,
  underlyingTokens,
  rewardTokens,
  apyBaseBorrow,
  apyRewardBorrow,
  totalSupplyUsd,
  totalBorrowUsd,
  ltv
) {
  return {
    pool: `${pool}-${chain}`.toLowerCase(),
    chain,
    project: 'damm-finance',
    symbol,
    tvlUsd,
    apyBase,
    // apyReward,
    underlyingTokens: [underlyingTokens],
    // rewardTokens,
    // apyBaseBorrow,
    // apyRewardBorrow,
    totalSupplyUsd,
    totalBorrowUsd,
    ltv,
  };
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.damm.finance/dashboard',
};
