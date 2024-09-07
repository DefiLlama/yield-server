const axios = require('axios');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const { BigNumber } = require('ethers');

const abi = require('./abi.json');

const rswETH = '0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: rswETH,
        abi: abi.find((m) => m.name === 'totalSupply'),
      })
    ).output / 1e18;

  const repriceEvents = await get7dRepriceEvents()
  // sort by blockNumber descending
  repriceEvents.sort((a,b) => (b.blockNumber - a.blockNumber));

  const eventNow = repriceEvents[0];
  const eventPrev = repriceEvents[1];
  const { closestBefore, closestAfter, timestamp7DaysAgo } = await getCloseestTo7dAgo(repriceEvents);

  const interpolatedRate = await interpolate7d(closestBefore, closestAfter, timestamp7DaysAgo);
  const startTime = await sdk.api.util.getTimestamp(eventPrev.blockNumber, "ethereum");
  const endTime = await sdk.api.util.getTimestamp(eventNow.blockNumber, "ethereum");

  const apr1d = await calcRate(eventNow, eventPrev);

  // Calculate 7-day APR using BigNumber operations
  const currentRate = BigNumber.from(eventNow.decoded.newRswETHToETHRate.toString());
  const sevenDayRateChange = currentRate.mul(BigNumber.from(10).pow(18)).div(interpolatedRate).sub(BigNumber.from(10).pow(18));
  const timeElapsed = BigNumber.from(endTime - timestamp7DaysAgo);
  const apr7d = sevenDayRateChange.mul(365 * 86400).div(timeElapsed).mul(100).toString() / 1e18;

  const priceKey = `ethereum:${rswETH}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const rate = (await sdk.api.abi.call({
    target: rswETH,
    abi: abi.find((m) => m.name === 'getRate'),
  })).output / 1e18;
  const tvlUsd = totalSupply * rate * ethPrice;

  return [
    {
      pool: rswETH,
      project: 'swell-liquid-restaking',
      chain: 'Ethereum',
      symbol: 'rswETH',
      tvlUsd: tvlUsd,
      apyBase: apr1d,
      apyBase7d: apr7d,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    },
  ];
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.swellnetwork.io/stake/rsweth',
};

async function get7dRepriceEvents() {

  const timestampNow = Math.floor(Date.now() / 1000);
  // going with 14 days to allow buffer
  const timestamp14dayAgo = timestampNow - 86400 * 14;

  const blockNow = await sdk.api.util.getLatestBlock("ethereum")
  const block14dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp14dayAgo}`)
  ).data.height;

  const iface = new ethers.utils.Interface([
    'event Reprice (uint256 newEthReserves, uint256 newRswETHToETHRate, uint256 nodeOperatorRewards, uint256 swellTreasuryRewards, uint256 totalETHDeposited)',
  ]);

  const repriceEvents = (
    await sdk.api2.util.getLogs({
      target: rswETH,
      topic: '',
      fromBlock: block14dayAgo,
      toBlock: blockNow.number,
      keys: [],
      topics: [iface.getEventTopic('Reprice')],
      chain: "ethereum",
      entireLog: true,
    })
  ).output
    .filter((ev) => !ev.removed)
    .map((ev) => {
        ev.decoded = iface.parseLog(ev).args
        return ev
      }
    );

  return repriceEvents;
}

async function calcRate(
  eventNow,
  eventPrev
) {
  const rateDelta = (eventNow.decoded[1]/eventPrev.decoded[1]) - 1;
  const blockDelta = (eventNow.blockNumber - eventPrev.blockNumber);
  const timeDeltaSeconds = blockDelta*12; // assuming 12 seconds per block
  const apr1d = (rateDelta*365*100)/(timeDeltaSeconds/86400);

  return apr1d;
}


async function getCloseestTo7dAgo(repriceEvents) {
  const timestampNow = Math.floor(Date.now() / 1000);
  const timestamp7DaysAgo = timestampNow - 86400 * 7;

  let closestBefore = null;
  let closestAfter = null;
  let minDiffBefore = Infinity;
  let minDiffAfter = Infinity;

  for (const repriceEvent of repriceEvents) {
    const eventTimestamp = await sdk.api.util.getTimestamp(repriceEvent.blockNumber, "ethereum");
    const timeDiff = eventTimestamp - timestamp7DaysAgo;

    if (timeDiff <= 0 && Math.abs(timeDiff) < minDiffBefore) {
      minDiffBefore = Math.abs(timeDiff);
      closestBefore = repriceEvent;
    } else if (timeDiff > 0 && timeDiff < minDiffAfter) {
      minDiffAfter = timeDiff;
      closestAfter = repriceEvent;
    }
  }

  //console.log("Closest event before 7 days ago:", closestBefore);
  //console.log("Closest event after 7 days ago:", closestAfter);

  return { closestBefore, closestAfter, timestamp7DaysAgo };
}

async function interpolate7d(closestBefore, closestAfter, timestamp7DaysAgo) {
  const beforeTimestamp = await sdk.api.util.getTimestamp(closestBefore.blockNumber, "ethereum");
  const afterTimestamp = await sdk.api.util.getTimestamp(closestAfter.blockNumber, "ethereum");

  const timeDiff = afterTimestamp - beforeTimestamp;
  const rateBefore = BigNumber.from(closestBefore.decoded.newRswETHToETHRate.toString());
  const rateAfter = BigNumber.from(closestAfter.decoded.newRswETHToETHRate.toString());

  const rateDiff = rateAfter.sub(rateBefore);
  const timeRatio = BigNumber.from(Math.floor((timestamp7DaysAgo - beforeTimestamp) / timeDiff * 1e18).toString());

  const interpolatedRateBN = rateBefore.add(
    rateDiff.mul(timeRatio).div(BigNumber.from(10).pow(18))
  );

 //console.log("Interpolated rate:", interpolatedRateBN.toString());
  return interpolatedRateBN;
}