const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const abi = require('./abis.json');

const utils = require('../utils');

const unitroller = '0x5E23dC409Fc2F832f83CEc191E245A191a4bCc5C';
const WCANTO = '0x826551890Dc65655a0Aceca109aB11AbDbD7a07B';

const getOutput = ({ output }) => output.map(({ output }) => output);

const poolInfo = async (chain) => {
  const allMarkets = await sdk.api.abi.call({
    target: unitroller,
    chain,
    abi: abi.getAllMarkets,
  });

  const yieldMarkets = allMarkets.output.map((pool) => {
    return { pool };
  });

  const [markets, compSupplySpeeds, compBorrowSpeeds] = await Promise.all(
    ['markets', 'compSupplySpeeds', 'compBorrowSpeeds'].map((method) =>
      sdk.api.abi.multiCall({
        abi: abi[method],
        target: unitroller,
        calls: yieldMarkets.map((pool) => ({
          params: pool.pool,
        })),
        chain,
        permitFailure: true,
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
        permitFailure: true,
      })
    )
  ).then((data) => data.map(getOutput));
  underlyingToken.find((token, index, arr) => {
    if (token === null) arr[index] = WCANTO;
  });

  const [underlyingTokenDecimals, underlyingTokenSymbol] = await Promise.all(
    ['decimals', 'symbol'].map((method) =>
      sdk.api.abi.multiCall({
        abi: abi[method],
        calls: underlyingToken.map((token) => ({
          target: token,
        })),
        chain,
        permitFailure: true,
      })
    )
  ).then((data) => data.map(getOutput));

  underlyingTokenDecimals.map((decimal, i, arr) => {
    arr[i] = Math.pow(10, Number(decimal));
  });

  const lpPoolsIdx = [];
  const coinPoolsIdx = [];
  tokenSymbol.map((symbol, idx) => {
    if (/[/]/.test(symbol) === true) {
      lpPoolsIdx.push(idx);
    } else {
      coinPoolsIdx.push(idx);
    }
  });

  const lpPools = lpPoolsIdx.map((idx) => underlyingToken[idx]);
  const lpPrices = await unwrapLP(chain, lpPools);

  const coinPools = coinPoolsIdx.map((idx) => underlyingToken[idx]);
  const coinPrices = await getPrices(chain, coinPools);

  const prices = {
    ...coinPrices,
    ...lpPrices,
  };

  yieldMarkets.map((data, i) => {
    data.collateralFactor = collateralFactor[i];
    data.borrowRate = borrowRatePerBlock[i];
    data.supplyRate = supplyRatePerBlock[i];
    data.compSupplySpeeds = compSupplySpeeds[i];
    data.compBorrowSpeeds = compBorrowSpeeds[i];
    data.getCash = getCash[i];
    data.totalBorrows = totalBorrows[i];
    data.totalReserves = totalReserves[i];
    data.underlyingToken = underlyingToken[i];
    data.tokenSymbol = underlyingTokenSymbol[i];
    data.price = prices[underlyingToken[i].toLowerCase()]?.usd;
    data.underlyingTokenDecimals = underlyingTokenDecimals[i];
  });

  return { yieldMarkets };
};

const unwrapLP = async (chain, lpTokens) => {
  const [token0, token1, getReserves, totalSupply, symbol] = await Promise.all(
    ['token0', 'token1', 'getReserves', 'totalSupply', 'symbol'].map((method) =>
      sdk.api.abi.multiCall({
        abi: abi[method],
        calls: lpTokens.map((token) => ({
          target: token,
        })),
        chain,
        permitFailure: true,
      })
    )
  ).then((data) => data.map(getOutput));

  const token0Decimals = (
    await sdk.api.abi.multiCall({
      abi: abi.decimals,
      calls: token0.map((token) => ({
        target: token,
      })),
      chain,
      permitFailure: true,
    })
  ).output.map((decimal) => Math.pow(10, Number(decimal.output)));

  const token1Decimals = (
    await sdk.api.abi.multiCall({
      abi: abi.decimals,
      calls: token1.map((token) => ({
        target: token,
      })),
      chain,
      permitFailure: true,
    })
  ).output.map((decimal) => Math.pow(10, Number(decimal.output)));

  const token0Price = await getPrices(chain, token0);
  const token1Price = await getPrices(chain, token1);

  const lpMarkets = lpTokens.map((lpToken) => {
    return { lpToken };
  });

  lpMarkets.map((token, i) => {
    token.lpPrice =
      ((getReserves[i]._reserve0 / token0Decimals[i]) *
        token0Price[token0[i].toLowerCase()].usd +
        (getReserves[i]._reserve1 / token1Decimals[i]) *
          token1Price[token1[i].toLowerCase()].usd) /
      (totalSupply[i] / 1e18);
  });

  const lpPrices = {};
  lpMarkets.map((lp) => {
    lpPrices[lp.lpToken.toLowerCase()] = { usd: lp.lpPrice };
  });

  return lpPrices;
};

const getPrices = async (chain, addresses) => {
  const priceKeys = addresses
    .map((a) => `${chain}:${a.toLowerCase()}`)
    .join(',');

  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  return Object.entries(prices).reduce((acc, [k, v]) => {
    acc[k.replace(`${chain}:`, '')] = { usd: v.price };
    return acc;
  }, {});
};

function calculateApy(rate, price = 1, tvl = 1) {
  // supply rate per block * number of blocks per year
  const BLOCK_TIME = 6;
  const YEARLY_BLOCKS = (365 * 24 * 60 * 60) / BLOCK_TIME;
  const safeTvl = tvl === 0 ? 1 : tvl;
  const apy = (((rate / 1e18) * YEARLY_BLOCKS * price) / safeTvl) * 100;
  return apy;
}

function calculateTvl(cash, borrows, reserves, price, decimals) {
  // ( cash + totalBorrows ) * underlying price = balance
  const tvl =
    ((parseFloat(cash) + parseFloat(borrows) - parseFloat(reserves)) /
      decimals) *
    price;
  return tvl;
}

const getApy = async () => {
  const wCantoPrice = (await getPrices('canto', [WCANTO]))[
    WCANTO.toLowerCase()
  ];

  const yieldPools = (await poolInfo('canto')).yieldMarkets.map((pool, i) => {
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
    const apyReward = calculateApy(
      pool.compSupplySpeeds,
      wCantoPrice.usd,
      totalSupplyUsd
    );
    const apyBaseBorrow = calculateApy(pool.borrowRate);
    const apyRewardBorrow = calculateApy(
      pool.compBorrowSpeeds,
      wCantoPrice.usd,
      totalBorrowUsd
    );
    const ltv = parseInt(pool.collateralFactor) / 1e18;

    const readyToExport = exportFormatter(
      pool.pool,
      'Canto',
      pool.tokenSymbol.replace('sAMM-', '').replace('vAMM-', ''),
      tvlUsd,
      apyBase,
      apyReward,
      pool.underlyingToken,
      [WCANTO],
      apyBaseBorrow,
      apyRewardBorrow,
      totalSupplyUsd,
      totalBorrowUsd,
      ltv
    );

    return readyToExport;
  });

  return yieldPools.filter(
    (i) =>
      utils.keepFinite(i) &&
      i.pool !== '0xee602429ef7ece0a13e4ffe8dbc16e101049504c-canto'
  );
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
    project: 'canto-lending',
    symbol,
    tvlUsd,
    apyBase,
    apyReward,
    underlyingTokens: [underlyingTokens],
    rewardTokens,
    apyBaseBorrow,
    apyRewardBorrow,
    totalSupplyUsd,
    totalBorrowUsd,
    ltv,
  };
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://lending.canto.io/',
};
