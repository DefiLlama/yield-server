const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const abiUnitroller = require('./abiUnitroller');
const abiPool = require('./abiPool');

const unitroller = '0xfD36E2c2a6789Db23113685031d7F16329158384';
const VBNB = '0xA07c5b74C9B40447a954e1466938b865b6BBea36';
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
const BETH = '0x250632378e573c6be1ac2f97fcdf00515d0aa91b';
const XVS = '0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63';

const poolInfo = async (chain) => {
  const getAllMarkets = await sdk.api.abi.call({
    target: unitroller,
    chain,
    abi: abiUnitroller.find((m) => m.name === 'getAllMarkets'),
    permitFailure: true,
  });

  // filter out unsupported vcan pool
  const yieldMarkets = getAllMarkets.output
    .map((pool) => {
      return { pool };
    })
    .filter(
      (pool) =>
        pool.pool.toLowerCase() !== '0xebd0070237a0713e8d94fef1b728d3d993d290ef'
    );

  const getOutput = ({ output }) => output.map(({ output }) => output);
  const [markets, venusSupplySpeeds, venusBorrowSpeeds] = await Promise.all(
    ['markets', 'venusSupplySpeeds', 'venusBorrowSpeeds'].map((method) =>
      sdk.api.abi.multiCall({
        abi: abiUnitroller.find((m) => m.name === method),
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
        abi: abiPool.find((m) => m.name === method),
        calls: yieldMarkets.map((pool) => ({
          target: pool.pool,
        })),
        chain,
        permitFailure: true,
      })
    )
  ).then((data) => data.map(getOutput));

  // no underlying token in vbnb swap null -> wbnb
  underlyingToken.find((token, index, arr) => {
    if (token === null) arr[index] = WBNB;
  });

  const underlyingTokenDecimals = (
    await sdk.api.abi.multiCall({
      abi: abiPool.find((m) => m.name === 'decimals'),
      calls: underlyingToken.map((token) => ({
        target: token,
      })),
      chain,
      permitFailure: true,
    })
  ).output.map((decimal) => Math.pow(10, Number(decimal.output)));

  //incorrect beth price swap beth 0xaddress -> coingecko id
  const price = await getPrices('bsc', underlyingToken);

  yieldMarkets.map((data, index) => {
    data.collateralFactor = collateralFactor[index];
    data.venusSupplySpeeds = venusSupplySpeeds[index];
    data.venusBorrowSpeeds = venusBorrowSpeeds[index];
    data.borrowRatePerBlock = borrowRatePerBlock[index];
    data.supplyRatePerBlock = supplyRatePerBlock[index];
    data.getCash = getCash[index];
    data.totalBorrows = totalBorrows[index];
    data.totalReserves = totalReserves[index];
    data.underlyingToken = underlyingToken[index];
    data.tokenSymbol = tokenSymbol[index];
    data.price = price[underlyingToken[index].toLowerCase()];
    data.underlyingTokenDecimals = underlyingTokenDecimals[index];
    data.rewardTokens = [XVS];
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
  const BLOCK_TIME = 3;
  const YEARLY_BLOCKS = (365 * 24 * 60 * 60) / BLOCK_TIME;
  const apy = (((rate / 1e18) * YEARLY_BLOCKS * price) / tvl) * 100;
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
  const priceOf = await getPrices(['bsc'], [XVS]);

  const yieldMarkets = (await poolInfo('bsc')).yieldMarkets;

  const symbol = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: yieldMarkets.map((p) => ({ target: p.underlyingToken })),
      chain: 'bsc',
      permitFailure: true,
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
    const tvl = totalSupplyUsd - totalBorrowUsd;
    const apyBase = calculateApy(pool.supplyRatePerBlock);
    const apyReward = calculateApy(
      pool.venusSupplySpeeds,
      priceOf[XVS],
      totalSupplyUsd
    );

    const apyBaseBorrow = calculateApy(pool.borrowRatePerBlock);
    const apyRewardBorrow = calculateApy(
      pool.venusBorrowSpeeds,
      priceOf[XVS],
      totalBorrowUsd
    );
    const ltv = parseInt(pool.collateralFactor) / 1e18;
    const readyToExport = exportFormatter(
      pool.pool,
      'Binance',
      symbol[i],
      tvl,
      apyBase,
      apyReward,
      pool.underlyingToken,
      pool.rewardTokens,
      apyBaseBorrow,
      apyRewardBorrow,
      totalSupplyUsd,
      totalBorrowUsd,
      ltv
    );

    return readyToExport;
  });

  return yieldPools;
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
    pool: pool.toLowerCase(),
    chain,
    project: 'venus-core-pool',
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
  url: 'https://app.venus.io/markets',
};
