const axios = require('axios');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');

// const masterChefABI = require('./abis/abi-master-chef.json');
const lpTokenABI = require('./abis/abi-lp-token.json');
const erc20ABI = require('./abis/abi-erc20.json');
const apePriceABI = require('./abis/abi-ape-price-getter.json');
const jungleFarmsABI = require('./abis/abi-jungle-farms.json');
const utils = require('../utils');
const { chunk } = require('lodash');
const { request, gql, batchRequests } = require('graphql-request');
const { CHAINS } = require('./config');

const WEEKS_PER_YEAR = 52;
const SECONDS_PER_YEAR = new BigNumber(31536000)

const pairQuery = gql`
  query pairQuery($id_in: [ID!]) {
    pairs(where: { id_in: $id_in }) {
      id
      token0 {
        symbol
        decimals
        id
      }
      token1 {
        symbol
        decimals
        id
      }
    }
  }
`;

const getPairInfo = async (pairs, apiUrl) => {
  const pairInfo = await Promise.all(
    chunk(pairs, 7).map((tokens) =>
      request(apiUrl, pairQuery, {
        id_in: tokens.map((pair) => pair.toLowerCase()),
      })
    )
  );

  return pairInfo
    .map(({ pairs }) => pairs)
    .flat()
    .reduce((acc, pair) => ({ ...acc, [pair.id.toLowerCase()]: pair }), {});
};

const getPrices = async (addresses, chain) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses.map((address) => `${chain}:${address}`),
    })
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

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  bananaPerBlock,
  bananaPrice,
  reserveUSD,
  blocksYear,
  chain
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const perBlock = chain === 'bsc' ? bananaPerBlock : bananaPerBlock * 3;
  const vvsPerYear = blocksYear * perBlock;
  return ((poolWeight * vvsPerYear * bananaPrice) / reserveUSD) * 100;
};

const calculateReservesUSD = (
  reserves,
  reservesRatio,
  token0,
  token1,
  tokenPrices
) => {
  const { decimals: token0Decimals, id: token0Address } = token0;
  const { decimals: token1Decimals, id: token1Address } = token1;
  const token0Price = tokenPrices[token0Address.toLowerCase()];
  const token1Price = tokenPrices[token1Address.toLowerCase()];

  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - token0Decimals));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - token1Decimals));

  if (token0Price) return reserve0.times(token0Price).times(2);
  if (token1Price) return reserve1.times(token1Price).times(2);
};

const apy = async (chain) => {
  const masterchef = CHAINS[chain].masterchef;
  const masterChefABI = CHAINS[chain].abi;
  const poolLength = await sdk.api.abi.call({
    target: masterchef,
    chain,
    abi: masterChefABI.find((e) => e.name === CHAINS[chain].callsName.length),
  });
  const totalAllocPoint = await sdk.api.abi.call({
    target: masterchef,
    chain,
    abi: masterChefABI.find((e) => e.name === CHAINS[chain].callsName.alloc),
  });
  const bananaPerBlock = await sdk.api.abi.call({
    target: masterchef,
    chain,
    abi: masterChefABI.find((e) => e.name === CHAINS[chain].callsName.perBlock),
  });
  const normalizedbananaPerBlock = bananaPerBlock.output / 1e18;
  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === CHAINS[chain].callsName.poolInfo)[0],
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
      target: masterchef,
      params: i,
    })),
    chain,
    requery: true,
  });
  const filterLpTokenAbi = masterChefABI.filter(({ name }) => name === 'lpToken')[0];
  const lpTokensAddress = filterLpTokenAbi ? await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'lpToken')[0],
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
      target: masterchef,
      params: i,
    })),
    chain,
    requery: true,
  }) : [];
  const pools = poolsRes.output
    .map(({ output }, i) => ({ ...output, ...{ lpToken: output.lpToken ?? lpTokensAddress.output[i].output }, i }))
    .filter((e) => e.allocPoint !== '0')
    .filter((e) => !CHAINS[chain].exclude.includes(e.lpToken));
  const lpTokens = pools.map(({ lpToken }) => lpToken);
  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [masterchef] : null,
        })),
        chain,
        requery: true,
      })
    )
  );
  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
        })),
        chain,
        requery: true,
      })
    )
  );
  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const masterChefBalData = masterChefBalancesRes.output.map(
    (res, i) => res.output
  );
  const tokens0 = underlyingToken0.output.map((res) => res.output);
  const tokens1 = underlyingToken1.output.map((res) => res.output);
  const tokensPrices = await getPrices([...tokens0, ...tokens1], chain);
  const pairsInfo = await getPairInfo(lpTokens, CHAINS[chain].apiUrl);
  const lpChunks = chunk(lpTokens, 10);
  const pairVolumes = await Promise.all(
    lpChunks.map((lpsChunk) =>
      request(
        CHAINS[chain].apiUrl,
        gql`
    query volumesQuery {
      ${lpsChunk
        .slice(0, 10)
        .map(
          (token, i) => `token_${token.toLowerCase()}:pairDayDatas(
        orderBy: date
        orderDirection: desc
        first: 7
        where: { pairAddress: "${token.toLowerCase()}" }
      ) {
        dailyVolumeUSD
      }`
        )
        .join('\n')}

    }
  `
      )
    )
  );
  const volumesMap = pairVolumes.flat().reduce(
    (acc, curChunk) => ({
      ...acc,
      ...Object.entries(curChunk).reduce((innerAcc, [key, val]) => ({
        ...innerAcc,
        [key.split('_')[1]]: val,
      })),
    }),
    {}
  );
  const res = pools.map((pool, i) => {
    const poolInfo = pool;
    const reserves = reservesData[i];
    const pairInfo = pairsInfo[pool.lpToken.toLowerCase()];
    const supply = supplyData[i];
    const masterChefBalance = masterChefBalData[i];
    const masterChefReservesUsd = calculateReservesUSD(
      reserves,
      masterChefBalance / supply,
      pairInfo.token0,
      pairInfo.token1,
      tokensPrices
    )
      .div(1e18)
      .toString();
    
    const lpReservesUsd = calculateReservesUSD(
      reserves,
      1,
      pairInfo.token0,
      pairInfo.token1,
      tokensPrices
    )
      .div(1e18)
      .toString();
    const lpFees7D =
      (volumesMap[pool.lpToken.toLowerCase()] || []).reduce(
        (acc, { dailyVolumeUSD }) => acc + Number(dailyVolumeUSD),
        0
      ) * CHAINS[chain].feeRate;
    const apyBase = ((lpFees7D * WEEKS_PER_YEAR) / lpReservesUsd) * 100;
    const banana = CHAINS[chain].banana;
    const apyReward = calculateApy(
      poolInfo,
      totalAllocPoint,
      normalizedbananaPerBlock,
      tokensPrices[banana.toLowerCase()],
      masterChefReservesUsd,
      CHAINS[chain].block.year,
      chain
    );

    return {
      pool: `${pool.lpToken}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'apeswap-amm',
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd: Number(masterChefReservesUsd),
      apyBase,
      apyReward,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [banana]
    };
  });

  return res;
};
const fetchPrices = async (tokens, chain) => {
  const tokenDecimals = await sdk.api.abi.multiCall({
    abi: erc20ABI.filter(({ name }) => name === 'decimals')[0],
    calls: tokens.map(({address}) => ({
      target: address,
    })),
    chain,
    requery: true,
  });
  const tokenPrices = await Promise.all(
    tokens.map((token, i) => {
      const method = token.isLp ? 'getLPPrice' : 'getPrice';
      return sdk.api.abi.multiCall({
      abi: apePriceABI.filter(({ name }) => name === method)[0],
      calls: [
        {
          target: CHAINS[chain].apePriceGetterAddress,
          params: [token.address, tokenDecimals.output[i].output]
        }
      ],
      chain,
      requery: true,
    })
    })
  );
  const mappedTokenPrices = tokenPrices.map((prices, i) => {
    const displayBalance = new BigNumber(prices.output[0].output).dividedBy(new BigNumber(10).pow(tokenDecimals.output[i].output))
    return {
      address: tokens[i].address,
      price: displayBalance.toNumber(),
    }
  })

  return mappedTokenPrices
}

const getAprAndStakedUsd = async (
  farm,
  tokenPrices,
  chain
) => {
  const totalStakedCall = await sdk.api.abi.multiCall({
    abi: jungleFarmsABI.filter(({ name }) => name === 'totalStaked')[0],
    calls: [{
      target: farm.contractAddress[40]
    }],
    chain,
    requery: true,
  });
  const totalStaked = totalStakedCall.output[0].output / 1e18
  const rewardsPerSecond = farm.rewardsPerSecond;
   
  const rewardToken = tokenPrices
    ? tokenPrices.find((token) => farm?.rewardToken && token?.address.toLowerCase() === farm?.rewardToken.address[40].toLowerCase())
    : farm.rewardToken
  const stakingToken = tokenPrices
    ? tokenPrices.find((token) => token?.address.toLowerCase() === farm?.stakingToken.address[40].toLowerCase())
    : farm.stakingToken
    
  const stakingTokenPrice = stakingToken?.price;
  const rewardTokenPrice = rewardToken?.price;
  const totalStakedUsd = totalStaked * stakingTokenPrice;
  const totalRewardPricePerYear = new BigNumber(rewardTokenPrice).times(+rewardsPerSecond).times(SECONDS_PER_YEAR)
  const totalStakingTokenInPool = new BigNumber(stakingTokenPrice).times(totalStaked)
  const apr = totalRewardPricePerYear.div(totalStakingTokenInPool).times(100)
  return { rewardToken: rewardToken.address, apr: apr.isNaN() || !apr.isFinite() ? null : apr.toNumber(), totalStakedUsd};
}
const apyTelos = async (chain) => {
  const farmsUrl = CHAINS[chain].farmsUrl;
  const farmsList = (
    await axios.get(farmsUrl)
  ).data;
  const farmsTlos = farmsList.filter(({ network }) => network === 40);
  const priceList = [];
  farmsTlos.map(async (farm) => {
    const tokens0 = farm.lpTokens.token.address[40];
    const tokens1 = farm.lpTokens.quoteToken.address[40];
    const lpToken = farm.stakingToken.address[40];
    priceList.push(fetchPrices([{address: tokens0}, {address: tokens1}, {address: lpToken, isLp: true}], chain));
  });
  const prices = await Promise.all(priceList);
  const data = await Promise.all(farmsTlos.map(async (farm) => {
    const tokens0 = farm.lpTokens.token.address[40];
    const tokens1 = farm.lpTokens.quoteToken.address[40];
    const lpToken = farm.stakingToken.address[40];
    const { apr, totalStakedUsd, rewardToken } = await getAprAndStakedUsd(farm, prices.flat(), chain);
    return {
      pool: `${lpToken}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'apeswap-amm',
      symbol: `${farm.lpTokens.token.symbol}-${farm.lpTokens.quoteToken.symbol}`,
      tvlUsd: Number(totalStakedUsd),
      apyReward: apr,
      underlyingTokens: [tokens0, tokens1],
      rewardTokens: [rewardToken]
    };
  }));
  return data;
}
const main = async () => {
  const data = await Promise.all(
    Object.keys(CHAINS).map((chain) => chain !== 'telos' ? apy(chain) : apyTelos(chain)),
  );
  return data.flat();
}
module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://apeswap.finance/farms',
};
