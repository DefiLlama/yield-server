const axios = require('axios');
const utils = require('../utils');
const constants = require('./constants');
const { getPoolsQuery } = require('./query');
const {
  ethers,
  utils: { formatEther, formatUnits, getAddress },
  constants: { AddressZero },
} = require('ethers');

const getTimeDurationStr = (secs) => {
  if (secs < 60) {
    return `${secs} seconds`;
  }

  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    return `${mins} minutes`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours} hours`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) {
    return `${days} day`;
  } else if (days < 7) {
    return `${days} days`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks === 1) {
    return `${weeks} week`;
  }
  return `${weeks} weeks`;
};

const bn = (amount) => {
  return ethers.BigNumber.from(amount);
};

const getPriceFromUniswapForToken0 = (
  token1Price,
  token0Decimals,
  token1Decimals,
  poolPrice
) => {
  const _token0Decimals = Number(token0Decimals);
  const _token1Decimals = Number(token1Decimals);
  const decimalDiff = Math.abs(_token0Decimals - _token1Decimals);

  let _poolPrice = bn(poolPrice);

  // Adjust token price for different token decimals
  if (_token0Decimals >= _token1Decimals) {
    _poolPrice = _poolPrice.mul(1e12).div(bn(10).pow(18 - decimalDiff));
  } else {
    _poolPrice = _poolPrice.mul(1e12).div(bn(10).pow(18 + decimalDiff));
  }

  return formatUnits(
    _poolPrice.mul((Number(token1Price) * 1e8).toFixed(0)).div(bn(10).pow(8)),
    12
  );
};

const getPriceFromUniswapForToken1 = (
  token0Price,
  token0Decimals,
  token1Decimals,
  poolPrice
) => {
  const _token0Decimals = Number(token0Decimals);
  const _token1Decimals = Number(token1Decimals);
  const decimalDiff = Math.abs(_token0Decimals - _token1Decimals);

  let _poolPrice = bn(poolPrice);

  // Adjust token price for different token decimals
  if (_token0Decimals >= _token1Decimals) {
    _poolPrice = _poolPrice.mul(1e12).div(bn(10).pow(18 - decimalDiff));
  } else {
    _poolPrice = _poolPrice.mul(1e12).div(bn(10).pow(18 + decimalDiff));
  }

  return formatUnits(
    bn((Number(token0Price) * 1e8).toFixed(0))
      .mul(bn(10).pow(16))
      .div(_poolPrice),
    12
  );
};

const getTokenPriceFrom1inch = async (tokenAddress, tokenDecimals, network) => {
  const networkId = constants.NETWORK_IDS[network.toLowerCase()];
  const usdcAddress = constants.USDC_ADDRESSES[network.toLowerCase()];
  const amount = bn(10).pow(tokenDecimals).toString();
  const path = `https://api.1inch.io/v4.0/${networkId}/quote?fromTokenAddress=${tokenAddress}&toTokenAddress=${usdcAddress}&amount=${amount}`;

  let res;
  try {
    res = await axios.get(path);
  } catch (err) {
    return '0';
  }

  const decimals = res.data.toToken.decimals;
  const price = res.data.toTokenAmount;

  return formatUnits(bn(price).mul(1e12).div(bn(10).pow(decimals)), 12);
};

const getTokenPrice = async (token, network) => {
  const tokenKey = `${network.toLowerCase()}:${token.address}`;
  let price = (await axios.get(`${constants.COINS_PRICES_URL}/${tokenKey}`))
    .data.coins[tokenKey]?.price;

  if (!!price) {
    return price;
  }

  // use 1inch price as backup
  if (token.address & token.decimals) {
    return getTokenPriceFrom1inch(token.address, token.decimals, network);
  }
};

const getLPTokensDetails = async (token0, token1, poolPrice, network) => {
  const token0Details = {
    ...token0,
    price: await getTokenPrice(token0, network),
  };
  const token1Details = {
    ...token1,
    price: await getTokenPrice(token1, network),
  };

  if (!Number(token0Details.price) && !Number(token1Details.price)) {
    token0Details.price = '0';
    token1Details.price = '0';
    return [token0Details, token1Details];
  }

  if (!Number(token0Details.price)) {
    let uniswapPrice;
    try {
      if (token0Details.balance != 0) {
        uniswapPrice = getPriceFromUniswapForToken0(
          token1Details.price,
          token0Details.decimals,
          token1Details.decimals,
          poolPrice
        );
      } else {
        uniswapPrice = '0';
      }
    } catch (err) {
      console.error(`err retrieving uniswap price: ${err.message}`);
      uniswapPrice = '0';
    }
    token0Details.price = uniswapPrice;
  }

  if (!Number(token1Details.price)) {
    let uniswapPrice;
    try {
      if (token1Details.balance != 0) {
        uniswapPrice = getPriceFromUniswapForToken1(
          token0Details.price,
          token0Details.decimals,
          token1Details.decimals,
          poolPrice
        );
      } else {
        uniswapPrice = '0';
      }
    } catch (err) {
      console.error(`err retrieving uniswap price: ${err.message}`);
      uniswapPrice = '0';
    }
    token1Details.price = uniswapPrice;
  }
  return [token0Details, token1Details];
};

const parseToken = (token) => {
  const isTokenEth = token.id === ethers.constants.AddressZero;
  return {
    address: token.id,
    symbol: isTokenEth ? utils.formatSymbol('ETH') : token.symbol,
    decimals: isTokenEth ? 18 : token.decimals,
    name: isTokenEth ? 'Ethereum' : token.name,
  };
};

const calculateTVL = (token0Price, token1Price, poolBalances) => {
  try {
    const _token0Price = (Number(token0Price) * 1e8).toFixed(0);
    const _token1Price = (Number(token1Price) * 1e8).toFixed(0);

    const t0Value = poolBalances[0].mul(_token0Price).div(1e8);
    const t1Value = poolBalances[1].mul(_token1Price).div(1e8);
    const tvl = t0Value.add(t1Value);

    const t0Percentage = tvl.isZero()
      ? 0
      : t0Value.mul(1e8).div(tvl).toNumber() / 1e6;
    const t1Percentage = tvl.isZero()
      ? 0
      : t1Value.mul(1e8).div(tvl).toNumber() / 1e6;

    return {
      t0Value: t0Value.toString(),
      t1Value: t1Value.toString(),
      t0Percentage,
      t1Percentage,
      tvl,
    };
  } catch (err) {
    console.error(`error calculating TVL: ${err}`);
    return {
      t0Value: '0',
      t1Value: '0',
      t0Percentage: 0,
      t1Percentage: 0,
      tvl: bn(0),
    };
  }
};

const calculateAPY = (
  rewardAmounts,
  rewardProgramDuration,
  tvlUsd,
  rewardTokens,
  periodFinish
) => {
  try {
    const SECONDS_IN_YEAR = 31536000;
    if (
      rewardProgramDuration === '0' ||
      Number(periodFinish) * 1000 < Date.now() // sale ended
    ) {
      return 0;
    }

    let amountPerYearTotal = bn(0);
    for (let i = 0; i < rewardAmounts.length; ++i) {
      let price = rewardTokens[i].price || '0';
      price = (Number(price) * 1e8).toFixed(0);
      const amount = bn(rewardAmounts[i]);
      const value = amount.mul(price).div(1e8);
      const amountPerYear = value
        .mul(SECONDS_IN_YEAR)
        .div(rewardProgramDuration);
      amountPerYearTotal = amountPerYearTotal.add(amountPerYear);
    }
    const amoutPerYearTotalNum = Number(
      formatEther(amountPerYearTotal.toString())
    );

    return tvlUsd === 0
      ? amoutPerYearTotalNum
      : (amoutPerYearTotalNum * 100) / tvlUsd;
  } catch (err) {
    console.error(`error calculating APY: ${err}`);
    return 0;
  }
};

const getCurratedPoolData = async (poolData, network) => {
  const pool = poolData;

  const token0Balance = pool.stakedTokenBalance
    ? pool.stakedTokenBalance[0]
    : 0;
  const token1Balance = pool.stakedTokenBalance
    ? pool.stakedTokenBalance[1]
    : 0;
  let token0 = parseToken(pool.token0);
  let token1 = parseToken(pool.token1);

  let stakedToken = pool.stakedToken ? parseToken(pool.stakedToken) : undefined;
  const uniswapPrice = `${pool.price || 0}`;
  token0 = {
    ...token0,
    balance: token0Balance,
  };
  token1 = {
    ...token1,
    balance: token1Balance,
  };
  const tokenDetails = await getLPTokensDetails(
    token0,
    token1,
    uniswapPrice,
    network
  );
  token0 = tokenDetails[0];
  token1 = tokenDetails[1];

  if (stakedToken != undefined) {
    stakedToken = {
      ...stakedToken,
      price: await getTokenPrice(stakedToken, network),
    };
  }

  const rewardAmounts = pool.rewardAmounts || [];
  const rewardTokens = [];

  for (let j = 0; j < pool.rewardTokens.length; ++j) {
    let rewardToken = parseToken(pool.rewardTokens[j]);
    if (rewardToken.address.toLowerCase() === token0.address.toLowerCase()) {
      rewardToken = token0;
    } else if (
      rewardToken.address.toLowerCase() === token1.address.toLowerCase()
    ) {
      rewardToken = token1;
    } else {
      rewardToken = {
        ...rewardToken,
        price: await getTokenPrice(rewardToken, network),
      };
    }

    rewardTokens.push(rewardToken);
    if (!pool.rewardAmounts) {
      rewardAmounts.push('0');
    }
  }

  let poolBalances = [bn(0), bn(0)];
  if (pool.bufferTokenBalance) {
    const poolBalance0 = bn(pool.bufferTokenBalance[0]).add(
      bn(pool.stakedTokenBalance[0]).mul(
        bn(10).pow(18 - Number(token0.decimals))
      )
    );
    const poolBalance1 = bn(pool.bufferTokenBalance[1]).add(
      bn(pool.stakedTokenBalance[1]).mul(
        bn(10).pow(18 - Number(token1.decimals))
      )
    );
    poolBalances = [poolBalance0, poolBalance1];
  }

  const { tvl } = calculateTVL(token0.price, token1.price, poolBalances);
  const tvlUsd = Number(formatEther(tvl.toString()));

  const apy = calculateAPY(
    rewardAmounts,
    pool.rewardDuration,
    tvlUsd,
    rewardTokens,
    pool.periodFinish || '0'
  );

  return {
    pool: `${getAddress(pool.id)}-${network}`,
    chain: utils.formatChain(network),
    project: 'xtoken',
    symbol: `${utils.formatSymbol(token0.symbol)}-${utils.formatSymbol(
      token1.symbol
    )}`,
    tvlUsd: tvlUsd,
    apyReward: apy,
    rewardTokens: rewardTokens.map(({ address }) => address),
    underlyingTokens: [token0, token1].map(({ address }) => address),
    url: `${constants.BASE_APP_URL}/pools/${
      network.toLowerCase() === 'ethereum' ? 'mainnet' : network.toLowerCase()
    }/${getAddress(pool.id)}`,
    ...(Number(pool.vestingPeriod) === 0
      ? {}
      : { poolMeta: `${getTimeDurationStr(pool.vestingPeriod)} vesting` }),
  };
};

const getPools = async () => {
  const responses = await Promise.all(
    Object.values(constants.SUBGRAPHS).map((url) =>
      axios({
        url,
        method: 'post',
        headers: {
          'content-type': 'application/json',
        },
        data: { query: getPoolsQuery },
      })
    )
  ).catch((err) => console.error('Pools subgraph request failed:', err));
  const poolsInfo = responses.map((res) => res.data.data.pools);

  const pools = [];
  for (let networkIdx in poolsInfo) {
    const network = Object.keys(constants.SUBGRAPHS)[networkIdx];
    const curatedPools = poolsInfo[networkIdx].filter(
      (pool) =>
        !constants.DELISTED_POOLS[network].includes(pool.id.toLowerCase())
    );

    for (let poolData of curatedPools) {
      const poolCurratedData = await getCurratedPoolData(poolData, network);
      pools.push(poolCurratedData);
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: `${constants.BASE_APP_URL}/discover`,
};
