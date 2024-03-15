const sdk = require('@defillama/sdk5');
const axios = require('axios');
const utils = require('../utils');

const USDe = '0x4c9edd5852cd905f086c759e8383e09bff1e68b3';
const sUSDe = '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497';

const getWeekNb = (timestamp) => {
  const date = new Date(timestamp * 1000);
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - startOfYear) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);

  return weekNumber;
};

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: sUSDe,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const priceKey = `ethereum:${USDe}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const tvlUsd = totalSupply * price;

  // for apr, fetch rewards received from logs
  // rewards are currently emitted weekly on thursday (though sometimes there are multiple tx within the same
  // week)

  // grab the last 7days of rewards
  const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
  const toBlock = currentBlock.number;
  const secondsInWeek = 7 * 60 * 60 * 24;
  const timestampWeekAgo = currentBlock.timestamp - secondsInWeek;
  const [fromBlock] = await utils.getBlocksByTime(
    [timestampWeekAgo],
    'ethereum'
  );
  const topic =
    '0xbb28dd7cd6be6f61828ea9158a04c5182c716a946a6d2f31f4864edb87471aa6';
  let logs = (
    await sdk.api.util.getLogs({
      target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
      topic: '',
      toBlock,
      fromBlock,
      keys: [],
      topics: [topic],
      chain: 'ethereum',
    })
  ).output.sort((a, b) => b.blockNumber - a.blockNumber);
  // get the timestamp
  logs = await Promise.all(
    logs.map(async (i) => ({
      ...i,
      timestamp: await sdk.api.util.getTimestamp(i.blockNumber),
    }))
  );

  // extract the week
  logs = logs.map((i) => ({ ...i, week: getWeekNb(i.timestamp) }));

  // sum up all received rewards within the latest week
  const maxWeek = Math.max(...logs.map((i) => i.week));
  const rewardsReceived = logs.filter((i) => i.week === maxWeek);
  const rewardsReceivedSum = rewardsReceived.reduce(
    (acc, i) => acc + parseInt(i.data / 1e18),
    0
  );

  const aprBase = (rewardsReceivedSum / tvlUsd) * 52 * 100;
  // weekly compoounding
  const apyBase = utils.aprToApy(aprBase, 52);
  return [
    {
      pool: sUSDe,
      symbol: 'sUSDe',
      project: 'ethena',
      chain: 'Ethereum',
      tvlUsd,
      apyBase,
      poolMeta: '7 days unstaking',
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.ethena.fi/',
};
