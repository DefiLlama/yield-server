// deprecated v2 apy implementations using subgraph

// Calculate daily APY given a start and end time in seconds since epoch
// APY should only be calculated with data from a full day. To calculate today's
// APY, use the complete data from the previous 2 days.
async function calcApy(cellarAddress, startEpochSecs, endEpochSecs) {
  // Returns hourData in desc order, current hour is index 0
  const hrData = await queries.getHourData(
    cellarAddress,
    startEpochSecs,
    endEpochSecs
  );

  // How many seconds have elapsed today
  const remainder = endEpochSecs % dayInSec;
  // Start of the 2nd day
  const startOfEnd =
    remainder === 0 ? endEpochSecs - dayInSec : endEpochSecs - remainder;

  // Bucket hr datas by date
  const dayBefore = hrData.filter((data) => data.date >= startOfEnd);
  const twoDaysBefore = hrData.filter((data) => data.date < startOfEnd);

  // Sum hourly price of the last 2 days individually
  let sumPrice = dayBefore.reduce((memo, data) => {
    return memo.plus(data.shareValue);
  }, new BigNumber(0));

  let sumPrevPrice = twoDaysBefore.reduce((memo, data) => {
    return memo.plus(data.shareValue);
  }, new BigNumber(0));

  // Calculate yesterday's yield
  const price = sumPrice.div(dayBefore.length);
  const prevPrice = sumPrevPrice.div(twoDaysBefore.length);
  const yieldRatio = price.minus(prevPrice).div(prevPrice);

  const result = yieldRatio.times(365).times(100).toNumber();

  return Number.isNaN(result) ? 0 : result;
}

// Use the change in avg daily price between the last 2 days to calculate an APR
async function getApy(cellarAddress) {
  const now = Math.floor(Date.now() / 1000);
  const remainder = now % dayInSec;
  const end = now - remainder - 1;
  const start = end - dayInSec - dayInSec + 1;

  return calcApy(cellarAddress, start, end);
}

const windowInDays = 7;

async function getApy7d(cellarAddress) {
  // Returns dayData in desc order, today is index 0
  const dayData = await queries.getDayData(cellarAddress, windowInDays);

  // Need a minimum of 7 days to calculate yield
  if (dayData.length < 7) {
    return 0;
  }

  const price = new BigNumber(dayData[0].shareValue); // Now price
  const prevPrice = new BigNumber(dayData[dayData.length - 1].shareValue); // Comparison price
  const yieldRatio = price.minus(prevPrice).div(prevPrice);

  const result = yieldRatio.times(52).times(100).toNumber();
  return Number.isNaN(result) ? 0 : result;
}
