const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const abi = require('./abis.json');

const contractsRegister = '0xA50d4E7D8946a7c90652339CDBd262c375d54D99';
const dataCompressor = '0x0050b1ABD1DD2D9b01ce954E663ff3DbCa9193B1';
const gear = '0xBa3335588D9403515223F109EdC4eB7269a9Ab5D';

const poolInfo = async (chain) => {
  const allPools = await sdk.api.abi.call({
    target: contractsRegister,
    chain,
    abi: abi.getPools,
  });

  const yieldPools = allPools.output.map((pool) => {
    return { pool };
  });

  //LM REWARDS Adjustment N.1
  // usdc:31.01/dai:22.83/eth:40.14/wstETH:0/btc:4.57
  //Credit Account LM REWARDS
  // usdc:1.66/dai:1.66/eth:2.30/wstETH:0/btc:0
  // https://gov.gearbox.fi/t/gip-30-lm-adjustment-1/1875
  const gearPerBlock = {
    '0x86130bDD69143D8a4E5fc50bf4323D48049E98E4': { LP: 31.01, CA: 1.66 },
    '0x24946bCbBd028D5ABb62ad9B635EB1b1a67AF668': { LP: 22.83, CA: 1.66 },
    '0xB03670c20F87f2169A7c4eBE35746007e9575901': { LP: 40.14, CA: 2.3 },
    '0xB8cf3Ed326bB0E51454361Fb37E9E8df6DC5C286': { LP: 0, CA: 0 },
    '0xB2A015c71c17bCAC6af36645DEad8c572bA08A08': { LP: 4.57, CA: 0 },
  };

  const poolData = (
    await sdk.api.abi.multiCall({
      target: dataCompressor,
      chain,
      abi: abi.getPoolData,
      calls: yieldPools.map((address) => ({
        params: address.pool,
      })),
    })
  ).output;

  const dToken = (
    await sdk.api.abi.multiCall({
      abi: abi.dieselToken,
      calls: yieldPools.map((address) => ({
        target: address.pool,
      })),
      chain,
    })
  ).output.map((output) => output.output);

  const getOutput = ({ output }) => output.map(({ output }) => output);
  const [symbol, decimals] = await Promise.all(
    ['symbol', 'decimals'].map((method) =>
      sdk.api.abi.multiCall({
        abi: abi[method],
        calls: yieldPools.map((token, i) => ({
          target: dToken[i],
        })),
        chain,
      })
    )
  ).then((data) => data.map(getOutput));
  const dTokenDecimals = decimals.map((decimal) =>
    Math.pow(10, Number(decimal))
  );

  const underlyingTokens = poolData.map((pool) => pool.output.underlyingToken);

  const price = await getPrices('ethereum', underlyingTokens);

  yieldPools.map((pool, i) => {
    pool.gearPerBlock = gearPerBlock[pool.pool];
    pool.availableLiquidity = poolData[i].output.availableLiquidity;
    pool.totalBorrowed = poolData[i].output.totalBorrowed;
    pool.depositAPY_RAY = poolData[i].output.depositAPY_RAY;
    pool.borrowAPY_RAY = poolData[i].output.borrowAPY_RAY;
    pool.underlyingToken = underlyingTokens[i];
    pool.withdrawFee = poolData[i].output.withdrawFee;
    pool.symbol = symbol[i];
    pool.price = price[underlyingTokens[i].toLowerCase()];
    pool.decimals = dTokenDecimals[i];
  });

  return { yieldPools };
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
  const apy = ((rate * YEARLY_BLOCKS * price) / safeTvl) * 100;
  return apy;
}

function calculateTvl(availableLiquidity, totalBorrowed, price, decimals) {
  // ( availableLiquidity + totalBorrowed ) * underlying price = total pool balance in USD
  const tvl =
    ((parseFloat(availableLiquidity) + parseFloat(totalBorrowed)) / decimals) *
    price;
  return tvl;
}

const getApy = async () => {
  //https://gov.gearbox.fi/t/gip-22-gearbox-v2-liquidity-mining-programs/1550
  //"FDV is taken at a smol increase to the 200M$ FDV for strategic rounds"
  const fdv = 200000000;
  const totalGearSupply = 10000000000;
  const gearPrice = fdv / totalGearSupply;

  const yieldPools = (await poolInfo('ethereum')).yieldPools;

  const symbol = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: yieldPools.map((p) => ({ target: p.underlyingToken })),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const pools = yieldPools.map((pool, i) => {
    const totalSupplyUsd = calculateTvl(
      pool.availableLiquidity,
      pool.totalBorrowed,
      pool.price,
      pool.decimals
    );
    const totalBorrowUsd = calculateTvl(
      0,
      pool.totalBorrowed,
      pool.price,
      pool.decimals
    );
    const tvlUsd = totalSupplyUsd - totalBorrowUsd;
    const LpRewardApy = calculateApy(
      pool.gearPerBlock.LP,
      gearPrice,
      totalSupplyUsd
    );
    const CaRewardApy = calculateApy(
      pool.gearPerBlock.CA,
      gearPrice,
      totalBorrowUsd
    );

    return (readyToExport = exportFormatter(
      pool.pool,
      'Ethereum',
      symbol[i],
      tvlUsd,
      (pool.depositAPY_RAY / 1e27) * 100,
      LpRewardApy,
      pool.underlyingToken,
      [gear],
      `https://app.gearbox.fi/pools/add/${pool.pool}`,
      (pool.borrowAPY_RAY / 1e27) * 100,
      0, // CaRewardApy, //uncomment after CA Ninja LM begins
      totalSupplyUsd,
      totalBorrowUsd,
      0 // this is currently just for the isolated earn page
    ));
  });

  return pools;
};

function exportFormatter(
  pool,
  chain,
  symbol,
  tvlUsd,
  apyBase,
  apyReward,
  underlyingToken,
  rewardTokens,
  url,
  apyBaseBorrow,
  apyRewardBorrow,
  totalSupplyUsd,
  totalBorrowUsd,
  ltv
) {
  return {
    pool,
    chain,
    project: 'gearbox',
    symbol,
    tvlUsd,
    apyBase,
    apyRewardFake: apyReward,
    underlyingTokens: [underlyingToken],
    rewardTokens,
    url,
    apyBaseBorrow,
    apyRewardBorrowFake: apyRewardBorrow,
    totalSupplyUsd,
    totalBorrowUsd,
    ltv,
  };
}

module.exports = {
  timetravel: false,
  apy: getApy,
};
