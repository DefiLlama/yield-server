const sdk = require('@defillama/sdk');
const utils = require('../utils');
const superagent = require('superagent');

const {
  VaultABI,
  ConfigurableInterestVaultConfigABI,
  Erc20ABI,
  BigBangABI,
} = require('./abis');

const project = 'single-finance';

const poolApiEndpoint = 'https://api.singlefinance.io/api/vaults';
const lyfPoolApiEndpoint = 'https://api.singlefinance.io/api/info/farms'

const singleToken = {
  cronos: '0x0804702a4E749d39A35FDe73d1DF0B1f1D6b8347'.toLowerCase(),
  fantom: '0x8cc97b50fe87f31770bcdcd6bc8603bc1558380b'.toLowerCase(),
  arbitrum: '0x55853edc67aa68ec2e3903ac00f2bc5bf2ca8db0'.toLowerCase(),
};

const singleVaultAddress = {
  cronos: '0x3710000815c45d715af84f35919a6f2a901b7548'.toLowerCase(),
  fantom: '0xE87158503f831244E67af248E02bb1cc1CEfA841'.toLowerCase(),
  arbitrum: '0xdd19f71FacE7E136035e6dc6da79FBE9E9c62D72'.toLowerCase(),
};

const bigBang = {
  cronos: '0x1Ae8a7C582C3f9F9117d5Bc2863F2eD16cBd29cb'.toLowerCase(),
  fantom: '0x7C770a787B430582AbccE88886e9E4E24A457A61'.toLowerCase(),
  arbitrum: '0x490Eba9a1F0d4A2311B6c158eFAbdd259Af5030a'.toLowerCase(),
};

const blocksPerYear = (secondsPerBlock) =>
  (60 / secondsPerBlock) * 60 * 24 * 365;

const blocksPerYears = {
  cronos: blocksPerYear(5.8),
  fantom: blocksPerYear(1.2),
  arbitrum: blocksPerYear(0.25),
};

const chainMapping = {
  cronos: {
    id: 25
  },
  fantom: {
    id: 250
  },
  arbitrum: {
    id: 42161
  }
}

const dexMapping = {
  vvs: {
    name: "VVS Finance"
  },
  mmf: {
    name: "MMFinance"
  },
  spooky: {
    name: "SpookySwap"
  },
  sushi: {
    name: "SushiSwap"
  },
  camelot: {
    name: "Camelot"
  }
}

const availablePools = {
  cronos: ['CRO', 'USDC', 'VVS', 'MMF', 'USDT', 'VERSA', 'ARGO', 'bCRO', 'VNO'],
  fantom: ['FTM', 'USDC', 'fUSDT'],
  arbitrum: ['WETH', 'USDC', 'USDT', 'MAGIC', 'DPX', 'RDPX'],
  // cronos: ['CRO',],
  // fantom:[],
};

const getApyBase = (
  borrowingInterest,
  totalBorrow,
  totalSupply,
  lendingPerformanceFee
) => {
  return (
    borrowingInterest *
    (totalBorrow / totalSupply) *
    (1 - lendingPerformanceFee) *
    100
  );
};

const getApyReward = (
  stakedTvl,
  allocPoint,
  totalAllocPoint,
  singlePerBlock,
  singlePrice,
  blocksPerYear
) => {
  return (
    (((allocPoint / totalAllocPoint) * singlePerBlock * singlePrice) /
      stakedTvl) *
    blocksPerYear *
    100
  );
};

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const priceItems = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return priceItems;
};

const secondToYearlyInterestRate = (rate) =>
  (Number(rate) * (60 * 60 * 24 * 365)) / 1000000000000000000;

const getPriceInUsd = (item, decimal, price) => {
  return (Number(item) / 10 ** Number(decimal)) * price;
};

const multiCallOutput = async (abi, calls, chain) => {
  const res = await sdk.api.abi.multiCall({
    abi: abi,
    calls: calls,
    chain: chain,
  });

  return res.output.map(({ output }) => output);
};

const getLendingApy = async (chain) => {
  const chainId = chainMapping[chain]?.id
  const allPools = await utils.getData(
    `${poolApiEndpoint}?chainid=${chainId}`
  );

  const pools = allPools.data.filter((pool) => {
    const symbol = pool.token.symbol;
    return availablePools[chain].includes(symbol);
  });

  const singlePrice = await getPrices([chain + ':' + singleToken[chain]]);

  const totalSupply = await multiCallOutput(
    VaultABI.find(({ name }) => name === 'totalToken'),
    pools.map((pool) => ({ target: pool.address })),
    chain
  );

  const totalSupplyToken = await multiCallOutput(
    VaultABI.find(({ name }) => name === 'totalSupply'),
    pools.map((pool) => ({ target: pool.address })),
    chain
  );

  const totalBorrowed = await multiCallOutput(
    VaultABI.find(({ name }) => name === 'vaultDebtVal'),
    pools.map((pool) => ({ target: pool.address })),
    chain
  );

  const decimals = await multiCallOutput(
    VaultABI.find(({ name }) => name === 'decimals'),
    pools.map((pool) => ({ target: pool.address })),
    chain
  );

  const configs = await multiCallOutput(
    VaultABI.find(({ name }) => name === 'config'),
    pools.map((pool) => ({ target: pool.address })),
    chain
  );

  const totalToken = await multiCallOutput(
    Erc20ABI.find(({ name }) => name === 'balanceOf'),
    pools.map((pool) => ({
      target: pool.token.id,
      params: [pool.address],
    })),
    chain
  );

  const interestRate = await multiCallOutput(
    ConfigurableInterestVaultConfigABI.find(
      ({ name }) => name === 'getInterestRate'
    ),
    configs.map((config, i) => {
      return {
        target: config,
        params: [totalBorrowed[i].toString(), totalToken[i].toString()],
      };
    }),
    chain
  );
  const totalIbStaked = await multiCallOutput(
    VaultABI.find(({ name }) => name === 'balanceOf'),
    configs.map((config, i) => {
      return {
        target: pools[i].address,
        params: bigBang[chain],
      };
    }),
    chain
  );

  const lendingPerformanceFeeBps = await multiCallOutput(
    ConfigurableInterestVaultConfigABI.find(
      ({ name }) => name === 'getReservePoolBps'
    ),
    configs.map((config, i) => {
      return {
        target: config,
      };
    }),
    chain
  );

  const allocPoint = await multiCallOutput(
    BigBangABI.find(({ name }) => name === 'poolInfo'),
    pools.map((pool) => ({
      params: [pool.fairLaunchPoolId],
      target: bigBang[chain],
    })),
    chain
  );

  const totalAllocPoint = await multiCallOutput(
    BigBangABI.find(({ name }) => name === 'totalAllocPoint'),
    [{ target: bigBang[chain] }],
    chain
  );

  const singlePerBlock = await multiCallOutput(
    BigBangABI.find(({ name }) => name === 'singlePerBlock'),
    [{ target: bigBang[chain] }],
    chain
  );

  const singleVaultDeimals = await multiCallOutput(
    VaultABI.find(({ name }) => name === 'decimals'),
    [{ target: singleVaultAddress[chain] }],
    chain
  );

  const prices = await getPrices(
    pools.map((pool) => {
      return chain + ':' + pool.token.id;
    })
  );

  const res = pools.map((pool, idx) => {
    const tokenAddress = pool.token.id.toLowerCase();
    const totalSupplyUsd = getPriceInUsd(
      totalSupply[idx],
      decimals[idx],
      prices[tokenAddress]
    );
    const totalBorrowUsd = getPriceInUsd(
      totalBorrowed[idx],
      decimals[idx],
      prices[tokenAddress]
    );
    const lendingPerformanceFee = Number(lendingPerformanceFeeBps[idx]) / 10000;

    const apyBase = getApyBase(
      secondToYearlyInterestRate(interestRate[idx]),
      totalBorrowed[idx],
      totalSupply[idx],
      lendingPerformanceFee
    );

    let conversionRate = 1;

    if (totalSupplyToken[idx] && Number(totalSupplyToken[idx]) > 0) {
      conversionRate = totalSupply[idx] / totalSupplyToken[idx];
    }

    const stakedTvl =
      (Number(totalIbStaked[idx]) / Math.pow(10, decimals[idx])) *
      prices[tokenAddress] *
      conversionRate;

    const apyReward = getApyReward(
      stakedTvl,
      allocPoint[idx].allocPoint,
      totalAllocPoint[0],
      singlePerBlock[0] / Math.pow(10, singleVaultDeimals[0]),
      singlePrice[singleToken[chain]],
      blocksPerYears[chain]
    );

    return {
      pool: pool.address,
      chain: utils.formatChain(chain),
      project,
      symbol: pool.token.symbol,
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBaseBorrow: secondToYearlyInterestRate(interestRate[idx]) * 100,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBase,
      apyReward: chain === 'cronos' ? apyReward : 0,
      underlyingTokens: [pool.token.id],
      rewardTokens: chain === 'cronos' ? [singleToken[chain]] : [],
      ltv: 0,
    };
  });
  return res;
};

const getLYFApy = async (chain, dex) => {
  const chainId = chainMapping[chain]?.id
  const allPools = (await utils.getData(
    `${lyfPoolApiEndpoint}?dex=${dex}&chainid=${chainId}`
  )).data.farms;

  return allPools.map((raw) => ({
    pool: `${raw.lpToken.address[chainId]}-${dex}-farming-${chain}`,
    chain: utils.formatChain(chain),
    project,
    symbol: `${raw.token0.symbol}-${raw.token1.symbol}`,
    poolMeta: dexMapping[dex].name,
    tvlUsd: raw.tvlInUSD,
    apyBase: utils.aprToApy((raw.tradingFeeApr + raw.autoCompoundDexYieldPercent) * (1 - raw.perfFee) * 100 ) + raw.manualHarvestDexYieldPercent * (1 - raw.perfFee) * 100,
    apyReward: 0,
    underlyingTokens: [
      raw.token0.address[chainId],
      raw.token1.address[chainId]
    ]
  }))
}

const apy = async () => {
  const cronosPools = await getLendingApy('cronos');
  const fantomPools = await getLendingApy('fantom');
  const arbitrumPools = await getLendingApy('arbitrum');
  const cronosVvsPools = await getLYFApy('cronos', 'vvs');
  const cronosMmfPools = await getLYFApy('cronos', 'mmf');
  const fantomSpookyPools = await getLYFApy('fantom', 'spooky');
  const arbitrumSushiPools = await getLYFApy('arbitrum', 'sushi');
  const arbitrumCamelotPools = await getLYFApy('arbitrum', 'camelot');
  return [
    ...cronosPools,
    ...fantomPools,
    ...arbitrumPools,
    ...cronosVvsPools,
    ...cronosMmfPools,
    ...fantomSpookyPools,
    ...arbitrumSushiPools,
    ...arbitrumCamelotPools,
  ].filter(i => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.singlefinance.io/',
};
