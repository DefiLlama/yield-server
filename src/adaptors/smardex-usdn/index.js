const sdk = require('@defillama/sdk');
const utils = require('../utils');
const {
  usdnABI,
  wUsdnABI,
} = require('./abis');

const DAYS_IN_YEAR = 365;
const SECONDS_IN_DAY = 86400;
const SECONDS_IN_A_YEAR = DAYS_IN_YEAR * SECONDS_IN_DAY;

const CONFIGS = [
  {
    chain: 'ethereum',
    USDN_TOKEN_ADDRESS: '0xde17a000BA631c5d7c2Bd9FB692EFeA52D90DEE2',
    WUSDN_TOKEN_ADDRESS: '0x99999999999999Cc837C997B882957daFdCb1Af9',
    USDN_PROTOCOL_ADDRESS: '0x656cB8C6d154Aad29d8771384089be5B5141f01a',
    USDN_PROTOCOL_FIRST_DEPOSIT: 1737663167,
  },
];

const getUsdnPriceAtTimestamp = async (chainConfig, timestamp) => {
  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/historical/${timestamp}/${chainConfig.chain}:${chainConfig.USDN_TOKEN_ADDRESS}`
    )
  ).coins;
  const usdnResult = prices[`${chainConfig.chain}:${chainConfig.USDN_TOKEN_ADDRESS}`];
  if (usdnResult === undefined) {
    throw new Error('No price data found for USDN');
  }
  return usdnResult.price;
};

async function fetchUSDNData(chainConfig, timestamp) {
  const [block] = await utils.getBlocksByTime([timestamp], chainConfig.chain);

  const usdnDivisorCall = sdk.api.abi.call({
    target: chainConfig.USDN_TOKEN_ADDRESS,
    abi: usdnABI.find((m) => m.name === 'divisor'),
    chain: chainConfig.chain,
    block,
  });

  const usdnTotalSupplyCall = sdk.api.abi.call({
    target: chainConfig.USDN_TOKEN_ADDRESS,
    abi: usdnABI.find((m) => m.name === 'totalSupply'),
    chain: chainConfig.chain,
    block,
  });

  const wUsdnSharesRatioCall = sdk.api.abi.call({
    target: chainConfig.WUSDN_TOKEN_ADDRESS,
    abi: wUsdnABI.find((m) => m.name === 'SHARES_RATIO'),
    chain: chainConfig.chain,
    block,
  });

  const [
    usdnDivisor,
    usdnTotalSupply,
    wUsdnSharesRatio,
  ] = await Promise.all([
    usdnDivisorCall,
    usdnTotalSupplyCall,
    wUsdnSharesRatioCall,
  ]);

  const usdnPrice = await getUsdnPriceAtTimestamp(chainConfig, timestamp);
  const formattedUsdnPrice = BigInt(Math.round(usdnPrice * 10 ** 18));
  const usdnDivisorOutput = BigInt(usdnDivisor.output);

  return {
    usdnDivisor: usdnDivisorOutput,
    usdnTotalSupply: BigInt(usdnTotalSupply.output),
    wusdnPrice:
      (BigInt(wUsdnSharesRatio.output) * formattedUsdnPrice) /
      usdnDivisorOutput,
  };
}

const computeUsdnApr = async (chainConfig, timestampNow) => {
  const timestampOneYearAgo = Math.max(
    timestampNow - SECONDS_IN_A_YEAR,
    chainConfig.USDN_PROTOCOL_FIRST_DEPOSIT,
  );

  const [yearAgo, now] = await Promise.all([
    fetchUSDNData(chainConfig, timestampOneYearAgo),
    fetchUSDNData(chainConfig, timestampNow),
  ]);

  const timePeriodInDays =
    (timestampNow - timestampOneYearAgo) / SECONDS_IN_DAY;

  const totalYield =
    Number(
      ((now.wusdnPrice - yearAgo.wusdnPrice) * BigInt(10 ** 18)) /
        yearAgo.wusdnPrice
    ) /
    10 ** 18;

  return (Math.pow(1 + totalYield, 365 / timePeriodInDays) - 1) * 100;
};

const computeYield = async (
  chainConfig,
  timestamp,
) => {
    const evaluatedTimestamp = timestamp || Math.floor(Date.now() / 1000);
    const [evaluatedBlock] = await utils.getBlocksByTime([evaluatedTimestamp], chainConfig.chain);
    const totalSupply =
    (
      await sdk.api.abi.call({
        target: chainConfig.USDN_TOKEN_ADDRESS,
        abi: 'erc20:totalSupply',
        chain: chainConfig.chain,
        block: evaluatedBlock,
      })
    ).output / 1e18;

  const apyBase = await computeUsdnApr(chainConfig, evaluatedTimestamp);

  return {
    pool: chainConfig.USDN_TOKEN_ADDRESS,
    symbol: 'USDN',
    project: 'smardex-usdn',
    chain: utils.formatChain(chainConfig.chain),
    tvlUsd: totalSupply,
    apyBase,
  };
}

const main = async (timestamp = null) => {
  const resultData = await Promise.allSettled(
    CONFIGS.map(async (chainConfig) => {
      const data = await computeYield(
        chainConfig,
        timestamp
      );
      return data;
    })
  );

  return resultData
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter(utils.keepFinite);
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://smardex.io/liquidity',
};
