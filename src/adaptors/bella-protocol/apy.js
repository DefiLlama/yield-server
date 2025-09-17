const { ContractAddresses, crvBaseApyUrl } = require('./address');
const { api } = require('@defillama/sdk');
const { ContractAbis } = require('./abi');
const {
  TokenPriceAcquireMethode,
  ConfigContent,
  StakingTokens,
  VaultTokens,
} = require('./token');
const fetch = require('node-fetch');

const chain = 'ethereum';
const callAbi = (abi, target, _config) => {
  const { name: fName, ...callConfig } =
    typeof _config === 'string' ? { name: _config } : _config;
  return api.abi.call(
    Object.assign(
      {
        chain,
        target,
        abi: abi.find(({ name }) => name === fName),
      },
      callConfig
    )
  );
};

const getTokenBalance = (tokenAddress, poolAddress, unit = 18) => {
  return callAbi(ContractAbis.miniAbi, tokenAddress, {
    name: 'balanceOf',
    params: poolAddress,
  }).then(({ output }) => {
    return output / Math.pow(10, unit);
  });
};

const getTokenPriceUniUsdtPool = async (
  tokenAddress,
  poolAddress,
  formatUnit
) => {
  if (tokenAddress === ContractAddresses.usdtTokenAddress) {
    return 1;
  } else {
    const [tokenBalance, usdtBalance] = await Promise.all([
      getTokenBalance(tokenAddress, poolAddress, formatUnit),
      getTokenBalance(ContractAddresses.usdtTokenAddress, poolAddress, 6),
    ]);

    return (usdtBalance / tokenBalance).toFixed(3);
  }
};

const getTokenUsdtPriceUniEthPool = async (
  tokenContractAddress,
  uniTokenUniPoolAddress,
  formatUnit
) => {
  if (tokenContractAddress === ContractAddresses.usdtTokenAddress) {
    return 1;
  } else {
    const [tokenBalance, ethBalance, ethPrice] = await Promise.all([
      getTokenBalance(tokenContractAddress, uniTokenUniPoolAddress, formatUnit),
      getTokenBalance(
        ContractAddresses.wethTokenAddress,
        uniTokenUniPoolAddress
      ),
      getTokenPriceUniUsdtPool(
        ContractAddresses.wethTokenAddress,
        ContractAddresses.wethUsdtUniPoolAddress
      ),
    ]);

    const alignedTokenBalance = parseFloat(tokenBalance);
    const alignedEthBalance = parseFloat(ethBalance);
    return ((alignedEthBalance * ethPrice) / alignedTokenBalance).toFixed(3);
  }
};

const get3poolStrategyApy = async () => {
  const values = await Promise.all([
    callAbi(
      ContractAbis.crvPoolAbi,
      ContractAddresses.crv3poolAddress,
      'get_virtual_price'
    ),

    fetch(crvBaseApyUrl).then((res) => res.json()),
    callAbi(
      ContractAbis.crvPoolGaugeAbi,
      ContractAddresses.crv3poolGaugeAddress,
      'inflation_rate'
    ),
    callAbi(
      ContractAbis.crvGaugeControllerAbi,
      ContractAddresses.crvGaugeControllerAddress,
      {
        params: ContractAddresses.crv3poolGaugeAddress,
        name: 'gauge_relative_weight',
      }
    ),
    callAbi(
      ContractAbis.crvPoolGaugeAbi,
      ContractAddresses.crv3poolGaugeAddress,
      'working_supply'
    ),
    getTokenUsdtPriceUniEthPool(
      ContractAddresses.crvTokenAddress,
      ContractAddresses.crvEthUniPoolAddress
    ),
  ]);

  const virtualPrice = values[0].output / 1e18;
  const baseApy = parseFloat(values[1].apy.day['3pool']) * 100;
  const inflationRate = values[2].output / 1e18;
  const relativeWeight = values[3].output / 1e18;
  const totalEffectiveStaked = values[4].output / 1e18;
  const crvPrice = values[5];

  const gaugeApy =
    (inflationRate *
      relativeWeight *
      60 *
      60 *
      24 *
      365 *
      100 *
      crvPrice *
      0.4) /
    totalEffectiveStaked /
    virtualPrice;

  return parseFloat((baseApy + gaugeApy).toFixed(2));
};

const getTotalAllocPoint = (tokenAddress) => {
  return callAbi(
    ContractAbis.bStakingAbi,
    tokenAddress,
    'totalAllocPoint'
  ).then(({ output }) => output / 1e18);
};

const getCurrPoolAllocPoint = (tokenAddress, poolId) => {
  return callAbi(ContractAbis.bStakingAbi, tokenAddress, {
    name: 'poolInfo',
    params: poolId,
  }).then(({ output }) => output.allocPoint / 1e18);
};

const getBelPerSecond = (tokenAddress) => {
  return callAbi(ContractAbis.bStakingAbi, tokenAddress, 'bellaPerSecond').then(
    ({ output }) => output / 1e18
  );
};

const getTokenTotalSupply = (tokenAddress, formatUnit, callback) => {
  return callAbi(ContractAbis.erc20TokenAbi, tokenAddress, 'totalSupply').then(
    ({ output }) => output / Math.pow(10, formatUnit)
  );
};

const getTokenPriceBinance = (tokenBasePair) => {
  return tokenBasePair === 'USDT'
    ? new Promise((resolve) => resolve(1))
    : fetch(ConfigContent.binancePriceApi + tokenBasePair)
        .then((response) => response.text())
        .then((_res) => {
          let res = JSON.parse(_res);
          return res.price;
        })
        .catch((error) => console.log('error', error));
};

const getTokenPriceCoingecko = (tokenId) => {
  return tokenId === 'usd'
    ? new Promise((resolve) => resolve(1))
    : fetch(ConfigContent.coingeckoPriceApi + tokenId + '&vs_currencies=usd')
        .then((response) => response.text())
        .then((_res) => {
          let res = JSON.parse(_res);

          return res[tokenId].usd;
        })
        .catch((error) => console.log('error', error));
};

const getBTokenPrice = (vaultContractAddress) => {
  let priceRate = 1;
  let token;
  let tokenPrice = 0;
  let bTokenPrice = 0;

  function getTokenObjFromVaultAddress(vaultContractAddress) {
    VaultTokens.find((o) => {
      if (o.bTokenContractAddress === vaultContractAddress) {
        token = o;
        return true;
      }
    });
  }

  return callAbi(
    ContractAbis.bVaultAbi,
    vaultContractAddress,
    'getPricePerFullShare'
  )
    .then(({ output }) => output / 1e18)
    .then((priceRate) => {
      getTokenObjFromVaultAddress(vaultContractAddress);

      if (token.priceSrc === TokenPriceAcquireMethode.BINANCE_API) {
        // use binance as price source (need to focus with binance api accessability from different area)
        return getTokenPriceBinance(token.binanceApiSymbol).then(
          (_tokenPrice) => {
            tokenPrice = _tokenPrice;

            return (bTokenPrice = tokenPrice * priceRate);
          }
        );
      } else if (token.priceSrc === TokenPriceAcquireMethode.UNISWAP_USDT_LP) {
        // use uniswap X/USDT pool
        return getTokenPriceUniUsdtPool(
          token.tokenContractAddress,
          token.uniPoolAddress,
          token.tokenDecimal
        ).then((_tokenPrice) => {
          tokenPrice = _tokenPrice;
          return (bTokenPrice = tokenPrice * priceRate);
        });
      } else if (token.priceSrc === TokenPriceAcquireMethode.UNISWAP_ETH_LP) {
        // use uniswap X/ETH pool
        return getTokenUsdtPriceUniEthPool(
          token.tokenContractAddress,
          token.uniPoolAddress,
          token.tokenDecimal
        ).then((_tokenPrice) => {
          tokenPrice = _tokenPrice;
          return (bTokenPrice = tokenPrice * priceRate);
        });
      } else {
        // use coingecko api as price source
        return getTokenPriceCoingecko(token.coingeckoApiTokenId).then(
          (_tokenPrice) => {
            tokenPrice = _tokenPrice;

            return (bTokenPrice = tokenPrice * priceRate);
          }
        );
      }
    });
};

const getTotalAum = (token) => {
  let bTokenTotalSupply = 0;

  return getTokenTotalSupply(token.bTokenContractAddress, token.bTokenDecimal)
    .then((_bTokenTotalSupply) => {
      bTokenTotalSupply = _bTokenTotalSupply;

      return getBTokenPrice(token.bTokenContractAddress);
    })
    .then((_bTokenPrice) => {
      return _bTokenPrice * bTokenTotalSupply;
    })
    .catch(() => {
      return 0;
    });
};

const getDistributionApy = async (token) => {
  let weeklyRewardBelInUsd = 0;
  let totalStakingBTokenInUsd = 0;
  let distributionApy = 0;

  const values = await Promise.all([
    getTokenPriceUniUsdtPool(
      ContractAddresses.bellaTokenAddress,
      ContractAddresses.belUsdtUniPoolAddress
    ),
    getTotalAllocPoint(ContractAddresses.bStakingContractAddress),
    getCurrPoolAllocPoint(
      ContractAddresses.bStakingContractAddress,
      token.bPoolId
    ),
    getBelPerSecond(ContractAddresses.bStakingContractAddress),
    getTotalAum(token),
  ]);

  const belPrice = values[0];
  const totalAllocPoint = values[1];
  const currPoolAllocPoint = values[2];
  const belPerSecond = values[3];
  const bTokenValue = values[4];

  weeklyRewardBelInUsd =
    (belPrice * belPerSecond * 60 * 60 * 24 * 7 * currPoolAllocPoint) /
    totalAllocPoint;

  totalStakingBTokenInUsd = totalStakingBTokenInUsd + bTokenValue;

  const apy = (() => {
    if (totalStakingBTokenInUsd === 0) {
      return parseFloat(distributionApy.toFixed(2));
    } else {
      if (token.symbol === 'bBUSD') {
        // return '-';
        return 0;
      } else {
        distributionApy =
          (weeklyRewardBelInUsd * 365 * 100) / 7 / totalStakingBTokenInUsd;
        return parseFloat(distributionApy.toFixed(2));
      }
    }
  })();

  return { apy, tvlUsd: bTokenValue };
};

const getWbtcStrategyApy = async () => {
  const values = await Promise.all([
    callAbi(
      ContractAbis.crvPoolAbi,
      ContractAddresses.crvhbtcPoolAddress,
      'get_virtual_price'
    ),
    fetch(ConfigContent.crvBaseApyUrl).then((res) => res.json()),
    callAbi(
      ContractAbis.crvPoolGaugeAbi,
      ContractAddresses.crvhbtcPoolGaugeAddress,
      'inflation_rate'
    ),
    callAbi(
      ContractAbis.crvGaugeControllerAbi,
      ContractAddresses.crvGaugeControllerAddress,
      {
        name: 'gauge_relative_weight',
        params: ContractAddresses.crvhbtcPoolGaugeAddress,
      }
    ),
    callAbi(
      ContractAbis.crvPoolGaugeAbi,
      ContractAddresses.crvhbtcPoolGaugeAddress,
      'working_supply'
    ),
    getTokenUsdtPriceUniEthPool(
      ContractAddresses.crvTokenAddress,
      ContractAddresses.crvEthUniPoolAddress
    ),
    getTokenPriceUniUsdtPool(
      ContractAddresses.wbtcTokenAddress,
      ContractAddresses.wbtcUsdtUniPoolAddress,
      8
    ),
  ]);

  const virtualPriceNormalize = values[0].output / 1e18;
  const baseApy = parseFloat(values[1].apy.day['hbtc']) * 100;
  const inflattionRateNormalize = values[2].output / 1e18;
  const relativeWeigthNomalize = values[3].output / 1e18;
  const totalEffectiveStakedNormalize = values[4].output / 1e18;
  const crvPrice = values[5];
  const wbtcPrice = values[6];

  const gaugeApy =
    (inflattionRateNormalize *
      relativeWeigthNomalize *
      60 *
      60 *
      24 *
      365 *
      100 *
      crvPrice *
      0.4) /
    totalEffectiveStakedNormalize /
    virtualPriceNormalize /
    wbtcPrice;

  return parseFloat((baseApy + gaugeApy).toFixed(2));
};

const getApy = async () => {
  const [
    // wbtc
    wbtc_s,
    wbtc_d,
    // hbtc
    // hbtc_s,
    hbtc_d,
    // usdt
    usdt_s,
    usdt_d,
    // usdc
    usdc_d,
    // arpa
    arpa_d,
  ] = await Promise.all([
    // wbtc
    getWbtcStrategyApy(),
    getDistributionApy(StakingTokens[3]),
    // hbtc
    getDistributionApy(StakingTokens[4]),

    // USDT
    get3poolStrategyApy(),
    getDistributionApy(StakingTokens[0]),

    // USDC
    getDistributionApy(StakingTokens[1]),
    // ARPA
    getDistributionApy(StakingTokens[2]),
  ]);

  return Object.entries({
    usdt: {
      strategyApy: usdt_s,
      distributionApy: usdt_d.apy,
      tvlUsd: usdt_d.tvlUsd,
      pool: StakingTokens[0].bTokenContractAddress,
    },
    usdc: {
      strategyApy: usdt_s,
      distributionApy: usdc_d.apy,
      tvlUsd: usdc_d.tvlUsd,
      pool: StakingTokens[1].bTokenContractAddress,
    },
    arpa: {
      strategyApy: 0,
      distributionApy: arpa_d.apy,
      tvlUsd: arpa_d.tvlUsd,
      pool: StakingTokens[2].bTokenContractAddress,
    },
    wbtc: {
      strategyApy: wbtc_s,
      distributionApy: wbtc_d.apy,
      tvlUsd: wbtc_d.tvlUsd,
      pool: StakingTokens[3].bTokenContractAddress,
    },
    hbtc: {
      strategyApy: wbtc_s,
      distributionApy: hbtc_d.apy,
      tvlUsd: hbtc_d.tvlUsd,
      pool: StakingTokens[4].bTokenContractAddress,
    },
  }).reduce((prev, cur) => {
    const { strategyApy, distributionApy, tvlUsd, pool } = cur[1];
    return {
      ...prev,
      [cur[0]]: {
        strategyApy: parseFloat(strategyApy.toFixed(2)),
        distributionApy: parseFloat(distributionApy.toFixed(2)),
        tvlUsd: parseFloat(tvlUsd.toFixed(3)),
        pool,
      },
    };
  }, {});
};

exports.getApy = getApy;
