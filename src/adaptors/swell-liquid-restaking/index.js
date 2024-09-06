const axios = require('axios');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');

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
  repriceEvents.sort((a,b) => (a.blockNumber<b.blockNumber ? 1: -1));

  eventNow = repriceEvents[0];
  eventPrev = repriceEvents[1];
  event7dayAgo = repriceEvents[repriceEvents.length-1];

  apr1d = await calcRate(eventNow, eventPrev);
  apr7d = await calcRate(eventNow, event7dayAgo);

  const priceKey = `ethereum:${rswETH}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const rate = (await sdk.api.abi.call({
    target: rswETH,
    abi: abi.find((m) => m.name === 'getRate'),
  })).output / 1e18
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
  // going with 8 days to allow buffer
  const timestamp7dayAgo = timestampNow - 86400 * 8;

  const blockNow = await sdk.api.util.getLatestBlock("ethereum")
  const block7dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7dayAgo}`)
  ).data.height;

  const iface = new ethers.utils.Interface([
    'event Reprice (uint256 newEthReserves, uint256 newRswETHToETHRate, uint256 nodeOperatorRewards, uint256 swellTreasuryRewards, uint256 totalETHDeposited)',
  ]);

  const repriceEvents = (
    await sdk.api2.util.getLogs({
      target: rswETH,
      topic: '',
      fromBlock: block7dayAgo,
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
  const rateDelta = (eventNow.decoded[1] - eventPrev.decoded[1])/1e18;
  const blockDelta = (eventNow.blockNumber - eventPrev.blockNumber);
  const timeDeltaSeconds = blockDelta*12; // assuming 12 seconds per block
  const apr1d = (rateDelta*365*100)/(timeDeltaSeconds/86400);

  return apr1d;
}
