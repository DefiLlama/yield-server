const sdk = require('@defillama/sdk');
const axios = require('axios');
const zlib = require('zlib');
const utils = require('../utils');
const { BigNumber } = require('ethers');
const ethers = require('ethers');

const PROJECT_NAME = 'myso-v1';
const POOL_INFO_ABI = {
  inputs: [],
  name: 'getPoolInfo',
  outputs: [
    {
      internalType: 'address',
      name: '_loanCcyToken',
      type: 'address',
    },
    {
      internalType: 'address',
      name: '_collCcyToken',
      type: 'address',
    },
    {
      internalType: 'uint256',
      name: '_maxLoanPerColl',
      type: 'uint256',
    },
    {
      internalType: 'uint256',
      name: '_minLoan',
      type: 'uint256',
    },
    {
      internalType: 'uint256',
      name: '_loanTenor',
      type: 'uint256',
    },
    {
      internalType: 'uint256',
      name: '_totalLiquidity',
      type: 'uint256',
    },
    {
      internalType: 'uint256',
      name: '_totalLpShares',
      type: 'uint256',
    },
    {
      internalType: 'uint256',
      name: '_baseAggrBucketSize',
      type: 'uint256',
    },
    {
      internalType: 'uint256',
      name: '_loanIdx',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const PRECISION = BigNumber.from(10).pow(18);
const YEAR_IN_SECONDS = BigNumber.from(365 * 86400);

const mapChainIdToChainName = {
  1: 'ethereum',
  42161: 'arbitrum',
};

const getBalances = async ({
  poolAddress,
  chain,
  tokenAddress,
  tokenDecimals,
}) => {
  const balanceOf = (
    await sdk.api.abi.call({
      target: tokenAddress,
      abi: 'erc20:balanceOf',
      chain,
      params: [poolAddress],
    })
  ).output;

  return balanceOf / 10 ** Number(tokenDecimals);
};

const getPoolInfo = async ({ poolAddress }) => {
  const poolInfo = await sdk.api.abi.call({
    abi: POOL_INFO_ABI,
    target: poolAddress,
    chain: 'ethereum',
  });

  return poolInfo.output;
};

const getRate = (liquidity, liqBnd_1, liqBnd_2, rate_1, rate_2) => {
  if (liquidity.isZero()) return BigNumber.from(0);

  if (liquidity.lt(liqBnd_1)) {
    return rate_1.mul(liqBnd_1).div(liquidity);
  } else if (liquidity.lt(liqBnd_2)) {
    const liquidityDelta = liqBnd_2.sub(liquidity);
    const rateDelta = rate_1.sub(rate_2);
    const rateNumerator = rateDelta.mul(liquidityDelta);
    const rateDenominator = liqBnd_2.sub(liqBnd_1);
    const ratePart_2 = rateNumerator.div(rateDenominator);
    return rate_2.add(ratePart_2);
  } else {
    return rate_2;
  }
};

const calculateApr = (currTotalLiquidity, pool) => {
  return ethers.utils.formatUnits(
    getRate(
      BigNumber.from(currTotalLiquidity),
      BigNumber.from(pool.lBnd1),
      BigNumber.from(pool.lBnd2),
      BigNumber.from(pool.r1),
      BigNumber.from(pool.r2)
    )
      .mul(1000000)
      .mul(YEAR_IN_SECONDS)
      .div(pool.loanTenor)
      .div(PRECISION),
    4
  );
};

const calculateBorrowApr = (totalLiquidity, pool) => {
  const postLiquidity = BigNumber.from(totalLiquidity).sub(pool.minLoan);

  const avgRate = getRate(
    BigNumber.from(totalLiquidity),
    BigNumber.from(pool.lBnd1),
    BigNumber.from(pool.lBnd2),
    BigNumber.from(pool.r1),
    BigNumber.from(pool.r2)
  )
    .add(
      getRate(
        BigNumber.from(postLiquidity),
        BigNumber.from(pool.lBnd1),
        BigNumber.from(pool.lBnd2),
        BigNumber.from(pool.r1),
        BigNumber.from(pool.r2)
      )
    )
    .div(2);

  const rawRate = avgRate.add(PRECISION);
  const repaymentAmount = BigNumber.from(pool.minLoan)
    .mul(rawRate)
    .div(PRECISION);

  const numeratorAPR = repaymentAmount
    .sub(pool.minLoan)
    .mul(YEAR_IN_SECONDS)
    .mul(10000);

  const denominatorAPR = BigNumber.from(pool.minLoan).mul(pool.loanTenor);
  const APR = !denominatorAPR.isZero()
    ? numeratorAPR.div(denominatorAPR)
    : BigNumber.from(0);

  return APR.toNumber() / 100;
};

const getLTV = (
  _maxLoanPerColl,
  loanTokenDecimals,
  priceLoanCcy,
  priceCollCcy
) => {
  try {
    const maxLoanPerColl = BigNumber.from(_maxLoanPerColl);

    if (maxLoanPerColl.isZero()) {
      return '0';
    }
    if (priceCollCcy * priceLoanCcy === 0) {
      return '0';
    }
    const collCcyPriceInCentsPowerNegFour = Math.round(1000000 * priceCollCcy);
    const loanCcyPriceInCentsPowerNegFour = Math.round(1000000 * priceLoanCcy);
    const collCcyPledgeValue = BigNumber.from(collCcyPriceInCentsPowerNegFour);
    const maxLoanAmountValue = maxLoanPerColl
      .mul(loanCcyPriceInCentsPowerNegFour)
      .div(BigNumber.from(10).pow(loanTokenDecimals));
    // max LTV to 3 decimal places
    return maxLoanAmountValue.mul(1000).div(collCcyPledgeValue);
  } catch (e) {
    console.log(e);
    return '0';
  }
};

const getTokenSymbolByAddress = async ({ address, chain }) => {
  return (
    await sdk.api.abi.call({
      target: address,
      abi: 'erc20:symbol',
      chain: chain,
    })
  ).output;
};

const brotliDecode = (stream) => {
  return new Promise((resolve, reject) => {
    let responseBuffer = [];

    stream.on('data', function handleStreamData(chunk) {
      responseBuffer.push(chunk);
    });

    stream.on('error', function handleStreamError(err) {
      reject(err);
    });

    stream.on('end', function handleStreamEnd() {
      let responseData = Buffer.concat(responseBuffer);

      responseData = responseData.toString('utf8');

      resolve(JSON.parse(responseData));
    });
  });
};

const allPools = async () => {
  return (
    await Promise.all(
      Object.keys(mapChainIdToChainName).map(async (chainId) => {
        const response = await axios.get(
          `https://api.myso.finance/chainIds/${chainId}/pools`,
          {
            decompress: false,
            responseType: 'stream',
            transformResponse: (data) => {
              return data.pipe(zlib.createBrotliDecompress());
            },
          }
        );

        const chainPools = (await brotliDecode(response.data)).pools;

        if (!chainPools.length) return [];

        const { pricesByAddress: prices } = await utils.getPrices(
          chainPools
            .map((pool) => {
              return [pool.loanTokenAddress, pool.collTokenAddress];
            })
            .flat(),
          mapChainIdToChainName[chainId]
        );

        for (const key in prices) {
          prices[key.toLowerCase()] = prices[key];
        }

        chainPools.forEach((pool) => {
          pool.collTokenPrice = prices[pool.collTokenAddress.toLowerCase()];
          pool.loanTokenPrice = prices[pool.loanTokenAddress.toLowerCase()];
        });

        return chainPools;
      })
    )
  ).flat();
};

const main = async () => {
  const pools = await Promise.all(
    (
      await allPools()
    ).map(async (pool, i) => {
      const chain = mapChainIdToChainName[pool.chainId];

      const poolInfo = await getPoolInfo({
        poolAddress: pool.poolAddress,
      });

      const currentTotalLiquidityBalance =
        poolInfo._totalLiquidity / 10 ** pool.loanTokenDecimals;

      const currentTotalLiquidityBalanceInUsd =
        currentTotalLiquidityBalance * pool.loanTokenPrice;

      const currentCollTokenBalance = await getBalances({
        poolAddress: pool.poolAddress,
        chain,
        tokenAddress: pool.collTokenAddress,
        tokenDecimals: pool.collTokenDecimals,
      });

      const currentCollTokenBalanceInUsd =
        currentCollTokenBalance * pool.collTokenPrice;

      const loanTokenSymbol = await getTokenSymbolByAddress({
        address: pool.loanTokenAddress,
        chain,
      });

      const collTokenSymbol = await getTokenSymbolByAddress({
        address: pool.collTokenAddress,
        chain,
      });

      const ltv =
        Number(
          ethers.utils.formatUnits(
            getLTV(
              poolInfo._maxLoanPerColl,
              pool.loanTokenDecimals,
              pool.loanTokenPrice,
              pool.collTokenPrice
            ),
            1
          )
        ) / 100;

      const apyBaseBorrow = calculateBorrowApr(poolInfo._totalLiquidity, pool);

      return [
        {
          pool: pool.poolAddress.toLowerCase(),
          chain: utils.formatChain(chain),
          project: PROJECT_NAME,
          symbol: loanTokenSymbol,
          tvlUsd: currentTotalLiquidityBalanceInUsd,
          apyBase: Number(calculateApr(poolInfo._totalLiquidity, pool)),
          underlyingTokens: [pool.loanTokenAddress, pool.collTokenAddress],
          poolMeta: `Fixed interest for borrowers, ${
            Math.round(Number(pool.loanTenor) / (360 * 24)) / 10
          }days loan tenor`,
          // borrow fields
          totalSupplyUsd:
            currentTotalLiquidityBalanceInUsd + currentCollTokenBalanceInUsd,
          totalBorrowUsd: currentCollTokenBalanceInUsd,
          apyBaseBorrow,
          ltv,
          borrowable: pool.loanVersion > '1.0',
        },
        {
          pool: `${pool.poolAddress.toLowerCase()}-borrow`,
          chain: utils.formatChain(chain),
          project: PROJECT_NAME,
          symbol: collTokenSymbol,
          tvlUsd: currentCollTokenBalanceInUsd,
          apyBase: 0,
          underlyingTokens: [pool.collTokenAddress],
          poolMeta: `Fixed interest for borrowers, ${
            Math.round(Number(pool.loanTenor) / (360 * 24)) / 10
          }days loan tenor`,
          totalSupplyUsd: currentCollTokenBalanceInUsd,
          totalBorrowUsd: 0,
          apyBaseBorrow,
          ltv,
          mintedCoin: loanTokenSymbol,
        },
      ];
    })
  );

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.myso.finance',
};
