const axios = require('axios');
const ethers = require('ethers');
const { differenceInDays, isBefore, parseISO, startOfDay, subDays } = require('date-fns');

const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const UNIETH_CONTRACT_ADDRESS = '0xF1376bceF0f78459C0Ed0ba5ddce976F1ddF51F4';

/**
 * tvlUsd = CurrentReserve / ExchangeRatio * uniETHPrice
 */
async function useTvlUsd(totalSupply) {
  const priceKey = `ethereum:${UNIETH_CONTRACT_ADDRESS}`;
  const uniETHPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;
  return totalSupply.mul(ethers.utils.parseEther(String(uniETHPrice)));
}
async function useE2LSServerLatestQuarterly() {
  const url = 'https://app.bedrock.technology/unieth/api/v1/e2ls/latest/quarterly';
  return axios.get(url);
}
async function useE2LSServerLatestQuarterlyDailyEarnExchangeRatios(exchangeRatios) {
  const result = [];
  for (let i = 0; i <= exchangeRatios.length - 1; i++) {
    const prevItem = exchangeRatios[i - 1];
    const item = exchangeRatios[i];
    if (prevItem != null) {
      const dailyEarn = ethers.utils.parseUnits(item.exchangeRatio, 'wei').sub(
        prevItem.exchangeRatio
      );
      result.push({
        ...item,
        dailyEarn: ethers.utils.formatUnits(dailyEarn, 'wei'),
      });
    } else {
      result.push({
        ...item,
        dailyEarn: '0',
      });
    }
  }
  return result;
}
async function useE2LSServerDailyEarnExchangeRatios(exchangeRatios, limit) {
  const dailyEarnExchangeRatios = await useE2LSServerLatestQuarterlyDailyEarnExchangeRatios(exchangeRatios);
  const lastItem = dailyEarnExchangeRatios.at(-1);
  if (lastItem) {
    const firstCreatedAt = subDays(
      startOfDay(parseISO(lastItem.createdAt)),
      limit
    );
    return dailyEarnExchangeRatios.filter(val =>
      isBefore(firstCreatedAt, startOfDay(parseISO(val.createdAt)))
    );
  }
  return [];
}
function useE2LSServerEarn(
  exchangeRatios
) {
  return exchangeRatios.reduce(
    (acc, item) => acc.add(item.dailyEarn),
    ethers.constants.Zero
  );
}
function useE2LSServerReturn(
  exchangeRatios
) {
  const earnAsBigNumber = useE2LSServerEarn(exchangeRatios);
  if (exchangeRatios.length == 0) {
    return ethers.constants.Zero;
  }
  const initialExchangeRatio = ethers.utils.parseUnits(
    exchangeRatios[0].exchangeRatio, 'wei'
  ).sub(exchangeRatios[0].dailyEarn);
  return earnAsBigNumber
    .mul(ethers.constants.WeiPerEther)
    .div(initialExchangeRatio);
}
/**
 * 年化收益率
 * @param {number} limit 时间周期（天）
 */
async function useE2LSServerAPY(exchangeRatios,
  limit
) {
  const limitExchangeRatios = await useE2LSServerDailyEarnExchangeRatios(exchangeRatios, limit);
  const returnAsBigNumber = useE2LSServerReturn(limitExchangeRatios);
  if (limitExchangeRatios.length <= 2) {
    return ethers.constants.Zero;
  }
  const firstItem = limitExchangeRatios.at(0);
  const lastItem = limitExchangeRatios.at(-1);
  const pDays = differenceInDays(
    startOfDay(parseISO(lastItem.createdAt)),
    startOfDay(parseISO(firstItem.createdAt))
  );
  const daysInYear = 365;
  const apyAsBigNumber = returnAsBigNumber
    .div(pDays + 1)
    .add(ethers.constants.WeiPerEther)
    .pow(daysInYear)
    .div(ethers.constants.WeiPerEther.pow(daysInYear - 1))
    .sub(ethers.constants.WeiPerEther);
  return apyAsBigNumber;
}

const getApy = async () => {
  const data = await useE2LSServerLatestQuarterly();
  const exchangeRatios = data?.data.data ?? [];
  const lastItem = exchangeRatios.at(-1);
  const currentReserve = ethers.utils.parseUnits(lastItem.currentReserve, 'wei');
  const exchangeRatio = ethers.utils.parseUnits(lastItem.exchangeRatio, 'wei');
  const totalSupply = currentReserve.div(exchangeRatio);
  const tvlUsd = await useTvlUsd(totalSupply);
  const apyAsBigNumber30 = await useE2LSServerAPY(exchangeRatios, 30);
  return [
    {
      pool: UNIETH_CONTRACT_ADDRESS,
      chain: 'ethereum',
      project: 'bedrock-unieth',
      symbol: 'uniETH',
      tvlUsd: Number(ethers.utils.formatEther(tvlUsd)),
      apyBase: 100 * Number(ethers.utils.formatEther(apyAsBigNumber30)),
      underlyingTokens: [weth],
    }
  ];
};
module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.bedrock.technology/unieth',
};
