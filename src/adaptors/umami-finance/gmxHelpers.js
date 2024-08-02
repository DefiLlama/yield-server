const sdk = require('@defillama/sdk');
const { gql, default: request } = require('graphql-request');
const fetch = require('node-fetch');
const { ethers } = require('ethers');
const { sub } = require('date-fns');
const { default: BigNumber } = require('bignumber.js');

const arbitrumConstants = require('./arbitrum/umamiConstants.js');
const avalancheConstants = require('./avalanche/umamiConstants.js');

const { ABI: GmxDataStoreAbi } = require('./abis/gmxDataStore.js');
const {
  ABI: GmxSyntheticsReaderAbi,
} = require('./abis/gmxSyntheticsReader.js');

const { keccak256 } = require('ethers/lib/utils.js');
const { default: axios } = require('axios');

const SYNTHS_STATS_SUBGRAPH_URL = {
  arbitrum: 'https://gmx.squids.live/gmx-synthetics-arbitrum/graphql',
  avax: 'https://gmx.squids.live/gmx-synthetics-avalanche/graphql',
};

const CONTRACTS = {
  arbitrum: {
    syntheticsReader: '0x5ca84c34a381434786738735265b9f3fd814b824',
    dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
  },
  avax: {
    syntheticsReader: '0xbad04ddcc5cc284a86493afa75d2beb970c72216',
    dataStore: '0x2f0b22339414aded7d5f06f9d604c7ff5b2fe3f6',
  },
};

const SIGNED_PRICES_API_URL = {
  arbitrum: 'https://arbitrum-api.gmxinfra.io/signed_prices/latest',
  avax: 'https://avalanche-api.gmxinfra.io/signed_prices/latest',
};

const marketFeesQuery = (marketAddress) => {
  return `
    _${marketAddress}_lte_start_of_period_: collectedMarketFeesInfos(
        orderBy: timestampGroup_DESC,
        where: {
          marketAddress_containsInsensitive: "${marketAddress}",
          period_eq: "1h",
          timestampGroup_lte: ${Math.floor(
            sub(new Date(), { days: 7 }).valueOf() / 1000
          )}
        },
        limit: 1
      ) {
        cumulativeFeeUsdPerPoolValue
        cumulativeBorrowingFeeUsdPerPoolValue
      }

    _${marketAddress}_recent: collectedMarketFeesInfos(
      orderBy: timestampGroup_DESC,
      where: {
        marketAddress_containsInsensitive: "${marketAddress}",
        period_eq: "1h"
      },
      limit: 1
    ) {
      cumulativeFeeUsdPerPoolValue
      cumulativeBorrowingFeeUsdPerPoolValue
    }

    _${marketAddress}_poolValue: poolValues(where: { marketAddress_containsInsensitive: "${marketAddress}" }) {
      poolValue
    } 
  `;
};

const hashData = (dataTypes, dataValues) => {
  const bytes = ethers.utils.defaultAbiCoder.encode(dataTypes, dataValues);
  const hash = ethers.utils.keccak256(ethers.utils.arrayify(bytes));

  return hash;
};

const hashString = (string) => {
  return hashData(['string'], [string]);
};

const bigNumberify = (n) => {
  try {
    return BigNumber(n);
  } catch (e) {
    console.error('bigNumberify error', e);
    return undefined;
  }
};

const expandDecimals = (n, decimals) => {
  return BigInt(n) * BigInt(10 ** decimals);
};

const getBorrowingFactorPerPeriod = (marketInfo, isLong) => {
  const factorPerSecond = isLong
    ? marketInfo.borrowingFactorPerSecondForLongs
    : marketInfo.borrowingFactorPerSecondForShorts;
  const oneYearInSeconds = 60 * 60 * 24 * 365;
  return BigInt(factorPerSecond) * BigInt(oneYearInSeconds);
};

const calcAprByBorrowingFee = (marketInfo, poolValue) => {
  const precision = expandDecimals(1, 30);
  const longOi = marketInfo.longInterestUsd;
  const shortOi = marketInfo.shortInterestUsd;
  const isLongPayingBorrowingFee = longOi > shortOi;
  const borrowingFactorPerYear = getBorrowingFactorPerPeriod(
    marketInfo,
    isLongPayingBorrowingFee
  );

  const borrowingFeeUsdForPoolPerYear =
    (borrowingFactorPerYear *
      (isLongPayingBorrowingFee ? longOi : shortOi) *
      BigInt(63)) /
    precision /
    BigInt(100);

  const borrowingFeeUsdPerPoolValuePerYear =
    (borrowingFeeUsdForPoolPerYear * precision) / poolValue;

  return borrowingFeeUsdPerPoolValuePerYear;
};

const bigintToNumber = (value, decimals) => {
  let myValue = value;
  const negative = myValue < 0;
  if (negative) {
    myValue *= -1n;
  }
  const precision = BigInt(10) ** BigInt(decimals);
  const int = myValue / precision;
  const frac = myValue % precision;

  const num = parseFloat(`${int}.${frac.toString().padStart(decimals, '0')}`);
  return negative ? -num : num;
};

const numberToBigint = (value, decimals) => {
  let myValue = value;
  const negative = value < 0;
  if (negative) {
    myValue *= -1;
  }

  const int = Math.trunc(myValue);
  let frac = myValue - int;

  let res = BigInt(int);

  for (let i = 0; i < decimals; i++) {
    res *= 10n;
    if (frac !== 0) {
      frac *= 10;
      const fracInt = Math.trunc(frac);
      res += BigInt(fracInt);
      frac -= fracInt;
    }
  }

  return negative ? -res : res;
};

const calculateGmMarketAPY = (apr) => {
  const aprNumber = bigintToNumber(apr, 30);
  const apyNumber = Math.exp(aprNumber) - 1;
  if (apyNumber !== Infinity) {
    return numberToBigint(apyNumber, 30);
  }
  return apr;
};

// Get GMX tokens prices from their API
const getGmxRealtimePrices = async (chain) => {
  const apiUrl = SIGNED_PRICES_API_URL[chain];

  const {
    data: { signedPrices },
  } = await axios.get(apiUrl, {
    headers: {
      'accept-encoding': 'gzip',
    },
  });

  return signedPrices.map(({ tokenSymbol, maxPriceFull, minPriceFull }) => ({
    tokenSymbol,
    maxPriceFull,
    minPriceFull,
  }));
};

// Get the price of a specific GMX token
const getGmxRealtimePriceForToken = async (chain, tokenName) => {
  const prices = await getGmxRealtimePrices(chain);

  const find = (symbol) => {
    const priceObj = prices.find(
      (priceObject) =>
        priceObject.tokenSymbol.toLowerCase() === symbol.toLowerCase()
    );
    if (priceObj === undefined) {
      throw new Error(`price not found for ${symbol}`);
    }

    const minPrice = BigInt(priceObj.minPriceFull);
    const maxPrice = BigInt(priceObj.maxPriceFull);
    const avgPrice = (minPrice + maxPrice) / BigInt(2);

    return avgPrice;
  };

  return find(tokenName);
};

// Gets the open interest informations from GMX for a given GM market
const getGmMarketOiFromDataStore = async (
  chain,
  gmMarketTokensPrices,
  addresses
) => {
  const oiKey = hashString('OPEN_INTEREST');
  const callsHashedParams = {
    longInterestUsingLongToken: hashData(
      ['bytes32', 'address', 'address', 'bool'],
      [oiKey, addresses.gmMarket, addresses.longToken, true]
    ),
    longInterestUsingShortToken: hashData(
      ['bytes32', 'address', 'address', 'bool'],
      [oiKey, addresses.gmMarket, addresses.shortToken, true]
    ),
    shortInterestUsingLongToken: hashData(
      ['bytes32', 'address', 'address', 'bool'],
      [oiKey, addresses.gmMarket, addresses.longToken, false]
    ),
    shortInterestUsingShortToken: hashData(
      ['bytes32', 'address', 'address', 'bool'],
      [oiKey, addresses.gmMarket, addresses.shortToken, false]
    ),
  };

  const oiInformationsForGmMarket = (
    await sdk.api.abi.multiCall({
      chain,
      abi: GmxDataStoreAbi.find((abiItem) => abiItem.name === 'getUint'),
      calls: [
        {
          target: addresses.dataStore,
          params: callsHashedParams.longInterestUsingLongToken,
        },
        {
          target: addresses.dataStore,
          params: callsHashedParams.longInterestUsingShortToken,
        },
        {
          target: addresses.dataStore,
          params: callsHashedParams.shortInterestUsingLongToken,
        },
        {
          target: addresses.dataStore,
          params: callsHashedParams.shortInterestUsingShortToken,
        },
      ],
    })
  ).output.map((o) => o.output);

  const gmMarketInfos = (
    await sdk.api.abi.call({
      chain,
      target: addresses.syntheticsReader,
      abi: GmxSyntheticsReaderAbi.find(
        (abiItem) => abiItem.name === 'getMarketInfo'
      ),
      params: [
        addresses.dataStore,
        {
          indexTokenPrice: {
            min: gmMarketTokensPrices.indexTokenPrice,
            max: gmMarketTokensPrices.indexTokenPrice,
          },
          longTokenPrice: {
            min: gmMarketTokensPrices.longTokenPrice,
            max: gmMarketTokensPrices.longTokenPrice,
          },
          shortTokenPrice: {
            min: gmMarketTokensPrices.shortTokenPrice,
            max: gmMarketTokensPrices.shortTokenPrice,
          },
        },
        addresses.gmMarket,
      ],
    })
  ).output;

  const isSameCollaterals = addresses.longToken === addresses.shortToken;
  const marketDivisor = isSameCollaterals ? BigInt(2) : BigInt(1);

  const longInterestUsingLongToken =
    BigInt(oiInformationsForGmMarket[0]) / marketDivisor;
  const longInterestUsingShortToken =
    BigInt(oiInformationsForGmMarket[1]) / marketDivisor;
  const shortInterestUsingLongToken =
    BigInt(oiInformationsForGmMarket[2]) / marketDivisor;
  const shortInterestUsingShortToken =
    BigInt(oiInformationsForGmMarket[3]) / marketDivisor;

  const marketInfoResult = gmMarketInfos;

  const longInterestUsd =
    longInterestUsingLongToken + longInterestUsingShortToken;
  const shortInterestUsd =
    shortInterestUsingLongToken + shortInterestUsingShortToken;

  return {
    longInterestUsd,
    shortInterestUsd,
    borrowingFactorPerSecondForLongs: BigInt(
      marketInfoResult.borrowingFactorPerSecondForLongs
    ),
    borrowingFactorPerSecondForShorts: BigInt(
      marketInfoResult.borrowingFactorPerSecondForShorts
    ),
  };
};

const getGmMarketsForUmami = async (chain) => {
  const gmMarketsForChain =
    chain === 'arbitrum'
      ? arbitrumConstants.GM_MARKETS
      : avalancheConstants.GM_MARKETS;

  const feesQuery = gmMarketsForChain.reduce(
    (acc, market) => acc + marketFeesQuery(market.address),
    ''
  );

  const feesQueryResponse = await request(
    SYNTHS_STATS_SUBGRAPH_URL[chain],
    gql`query M {
      ${feesQuery}
      }`
  );

  const marketTokensAPRData = await Promise.all(
    gmMarketsForChain.map(async (market) => {
      const [indexTokenPrice, longTokenPrice, shortTokenPrice] =
        await Promise.all([
          getGmxRealtimePriceForToken(chain, market.indexTokenName),
          getGmxRealtimePriceForToken(chain, market.longTokenName),
          getGmxRealtimePriceForToken(chain, market.shortTokenName),
        ]);

      const oiInfos = await getGmMarketOiFromDataStore(
        chain,
        {
          indexTokenPrice,
          longTokenPrice,
          shortTokenPrice,
        },
        {
          dataStore: CONTRACTS[chain].dataStore,
          syntheticsReader: CONTRACTS[chain].syntheticsReader,
          gmMarket: market.address,
          longToken: market.longToken,
          shortToken: market.shortToken,
        }
      );
      const lteStartOfPeriodFees =
        feesQueryResponse[`_${market.address}_lte_start_of_period_`];
      const recentFees = feesQueryResponse[`_${market.address}_recent`];
      const poolValueRaw = feesQueryResponse[`_${market.address}_poolValue`];

      const poolValue = BigInt(poolValueRaw[0].poolValue);
      const startFees = lteStartOfPeriodFees[0];
      const currentFees = recentFees[0];

      const startTotal =
        BigInt(startFees.cumulativeFeeUsdPerPoolValue) -
        BigInt(startFees.cumulativeBorrowingFeeUsdPerPoolValue);
      const currentTotal =
        BigInt(currentFees.cumulativeFeeUsdPerPoolValue) -
        BigInt(currentFees.cumulativeBorrowingFeeUsdPerPoolValue);

      const incomePercentageForPeriod = currentTotal - startTotal;

      const yearMultiplier = BigInt(Math.floor(365 / 7));

      const aprByFees = incomePercentageForPeriod * yearMultiplier;
      const aprByBorrowingFee = calcAprByBorrowingFee(oiInfos, poolValue);
      const completeApy =
        calculateGmMarketAPY(aprByFees + aprByBorrowingFee) / BigInt(10 ** 28);

      return {
        pool: market.address,
        apyBase: completeApy.toString(),
      };
    })
  );

  return marketTokensAPRData.filter(Boolean);
};

module.exports = {
  getGmMarketsForUmami,
};
