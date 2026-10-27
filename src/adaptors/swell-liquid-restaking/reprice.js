const sdk = require('@defillama/sdk');
const { BigNumber } = require('ethers');

const { getPriceApiData } = require('../utils');

const WAD = 10n ** 18n;

const repriceEvent = (rateField) =>
  `event Reprice(uint256 newEthReserves, uint256 ${rateField}, uint256 nodeOperatorRewards, uint256 swellTreasuryRewards, uint256 totalETHDeposited)`;

async function getRepriceEvents(token, rateField) {
  const timestampNow = Math.floor(Date.now() / 1000);
  const timestamp14dayAgo = timestampNow - 86400 * 14;

  const blockNow = await sdk.api.util.getLatestBlock('ethereum');
  const block14dayAgo = (await getPriceApiData(`/block/ethereum/${timestamp14dayAgo}`)).height;

  const [repriceEvents, treasuryPct, nodeOperatorPct] = await Promise.all([
    sdk.getEventLogs({
      target: token,
      eventAbi: repriceEvent(rateField),
      fromBlock: block14dayAgo,
      toBlock: blockNow.number,
      chain: 'ethereum',
    }),
    ...['swellTreasuryRewardPercentage', 'nodeOperatorRewardPercentage'].map(async (name) =>
      BigInt((await sdk.api.abi.call({ target: token, abi: `uint256:${name}` })).output)
    ),
  ]);
  const chargesFees = treasuryPct + nodeOperatorPct > 0n;

  repriceEvents.sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber));
  let prevRate;
  let unbacked = WAD;
  return repriceEvents.map((ev) => {
    const rate = BigInt(ev.args[rateField]);
    const feeShares = BigInt(ev.args.nodeOperatorRewards) + BigInt(ev.args.swellTreasuryRewards);
    if (prevRate !== undefined && chargesFees && feeShares === 0n) unbacked = (unbacked * rate) / prevRate;
    prevRate = rate;
    ev.backedRate = ((rate * WAD) / unbacked).toString();
    return ev;
  });
}

function calcRate(eventNow, eventPrev) {
  const rateDelta = Number(eventNow.backedRate) / Number(eventPrev.backedRate) - 1;
  const blockDelta = Number(eventNow.blockNumber) - Number(eventPrev.blockNumber);
  const timeDeltaSeconds = blockDelta * 12;
  return (rateDelta * 365 * 100) / (timeDeltaSeconds / 86400);
}

async function getClosestTo7dAgo(repriceEvents) {
  const timestampNow = Math.floor(Date.now() / 1000);
  const timestamp7DaysAgo = timestampNow - 86400 * 7;

  let closestBefore = null;
  let closestAfter = null;
  let minDiffBefore = Infinity;
  let minDiffAfter = Infinity;

  for (const repriceEvent of repriceEvents) {
    const eventTimestamp = await sdk.api.util.getTimestamp(repriceEvent.blockNumber, 'ethereum');
    const timeDiff = eventTimestamp - timestamp7DaysAgo;

    if (timeDiff <= 0 && Math.abs(timeDiff) < minDiffBefore) {
      minDiffBefore = Math.abs(timeDiff);
      closestBefore = repriceEvent;
    } else if (timeDiff > 0 && timeDiff < minDiffAfter) {
      minDiffAfter = timeDiff;
      closestAfter = repriceEvent;
    }
  }

  return { closestBefore, closestAfter, timestamp7DaysAgo };
}

async function interpolate7d(closestBefore, closestAfter, timestamp7DaysAgo) {
  const beforeTimestamp = await sdk.api.util.getTimestamp(closestBefore.blockNumber, 'ethereum');
  const afterTimestamp = await sdk.api.util.getTimestamp(closestAfter.blockNumber, 'ethereum');

  const timeDiff = afterTimestamp - beforeTimestamp;
  const rateBefore = BigNumber.from(closestBefore.backedRate);
  const rateAfter = BigNumber.from(closestAfter.backedRate);

  const rateDiff = rateAfter.sub(rateBefore);
  const timeRatio = BigNumber.from(Math.floor((timestamp7DaysAgo - beforeTimestamp) / timeDiff * 1e18).toString());

  return rateBefore.add(rateDiff.mul(timeRatio).div(BigNumber.from(10).pow(18)));
}

async function getRepriceApy(token, rateField) {
  const repriceEvents = await getRepriceEvents(token, rateField);
  if (repriceEvents.length < 2) return { apyBase: 0 };
  repriceEvents.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

  const eventNow = repriceEvents[0];
  const apyBase = calcRate(eventNow, repriceEvents[1]);

  const { closestBefore, closestAfter, timestamp7DaysAgo } = await getClosestTo7dAgo(repriceEvents);
  if (!closestBefore || !closestAfter) return { apyBase };

  const interpolatedRate = await interpolate7d(closestBefore, closestAfter, timestamp7DaysAgo);
  const endTime = await sdk.api.util.getTimestamp(eventNow.blockNumber, 'ethereum');
  const currentRate = BigNumber.from(eventNow.backedRate);
  const sevenDayRateChange = currentRate.mul(WAD.toString()).div(interpolatedRate).sub(WAD.toString());
  const timeElapsed = BigNumber.from(endTime - timestamp7DaysAgo);
  const apyBase7d = sevenDayRateChange.mul(365 * 86400).div(timeElapsed).mul(100).toString() / 1e18;

  return { apyBase, apyBase7d };
}

async function getTvl(token) {
  const [totalSupply, rate] = await Promise.all(
    ['totalSupply', 'getRate'].map(async (name) =>
      (await sdk.api.abi.call({ target: token, abi: `uint256:${name}` })).output / 1e18
    )
  );
  const ethPrice = (await getPriceApiData('/prices/current/coingecko:ethereum')).coins['coingecko:ethereum'].price;
  return { tvlUsd: totalSupply * rate * ethPrice, rate };
}

module.exports = { getRepriceApy, getTvl };
