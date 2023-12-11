const axios = require('axios');
const ethers = require('ethers');
const { differenceInDays, isBefore, parseISO, startOfDay, subDays } = require('date-fns');

const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const UNIETH_CONTRACT_ADDRESS = '0xF1376bceF0f78459C0Ed0ba5ddce976F1ddF51F4';

/**
 * tvlUsd = CurrentReserve / ExchangeRatio * uniETHPrice
 */
async function useTvlUsd() {
  const priceKey = `ethereum:${UNIETH_CONTRACT_ADDRESS}`;
  const uniETHPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;

  // CurrentReserve / ExchangeRatio * uniETHPrice
  const data = await useE2LSServerLatestQuarterly();
  const exchangeRatios = data?.data.data ?? [];
  const lastItem = exchangeRatios.at(-1);
  const currentReserve = ethers.utils.parseUnits(lastItem.currentReserve, 'wei');
  const exchangeRatio = ethers.utils.parseUnits(lastItem.exchangeRatio, 'wei');
  const tvlUsd = currentReserve.mul(ethers.utils.parseEther(String(uniETHPrice))).div(exchangeRatio);
  return tvlUsd;
}
async function useE2LSServerLatestQuarterly() {
  const url = 'https://app.bedrock.technology/unieth/api/v1/e2ls/latest/quarterly';
  return axios.get(url);
}
async function useE2LSServerLatestQuarterlyDailyEarnExchangeRatios() {
  const data = await useE2LSServerLatestQuarterly();
  const exchangeRatios = data?.data.data ?? [];
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
/**
 * @param {number} limit 
 */
async function useE2LSServerDailyEarnExchangeRatios(limit) {
  const exchangeRatios = await useE2LSServerLatestQuarterlyDailyEarnExchangeRatios();
  const lastItem = exchangeRatios.at(-1);
  if (lastItem) {
    const firstCreatedAt = subDays(
      startOfDay(parseISO(lastItem.createdAt)),
      limit
    );
    return exchangeRatios.filter(val =>
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

async function useE2LSServerAPY(
  limit
) {
  const exchangeRatios = await useE2LSServerDailyEarnExchangeRatios(limit);
  const returnAsBigNumber = useE2LSServerReturn(exchangeRatios);

  if (exchangeRatios.length <= 2) {
    return ethers.constants.Zero;
  }
  // const pDays = exchangeRatios.length - 1;
  const firstItem = exchangeRatios.at(0);
  const lastItem = exchangeRatios.at(-1);
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
  const apyAsBigNumber30 = await useE2LSServerAPY(30);
  const tvlUsd = await useTvlUsd();
  return [
    {
      pool: UNIETH_CONTRACT_ADDRESS,
      chain: 'ethereum',
      project: 'bedrock-unieth',
      symbol: 'uniETH',
      tvlUsd: Number(ethers.utils.formatEther(tvlUsd)),
      apyBase: Number(ethers.utils.formatEther(apyAsBigNumber30)),
      underlyingTokens: [weth],
    }
  ];
};
module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.bedrock.technology/unieth',
};
