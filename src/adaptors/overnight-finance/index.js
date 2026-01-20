const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const xUSD = '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65';
const xUSD_EXCHANGE = '0x73cb180bf0521828d8849bc8CF2B920918e23032';

const EVENTS = {
  PayoutEvent: 'event PayoutEvent(uint256 profit, uint256 newLiquidityIndex, uint256 excessProfit, uint256 insurancePremium, uint256 insuranceLoss)',
};

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: xUSD,
        abi: 'erc20:totalSupply',
        chain: 'arbitrum',
      })
    ).output / 1e6;

  const priceKey = `arbitrum:${xUSD}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const tvlUsd = totalSupply * price;

  const currentBlock = await sdk.api.util.getLatestBlock('arbitrum');
  const toBlock = currentBlock.number;
  const logs = (
    await sdk.getEventLogs({
      target: xUSD_EXCHANGE,
      eventAbi: EVENTS.PayoutEvent,
      fromBlock: 63102109,
      toBlock,
      chain: 'arbitrum',
    })
  ).sort((a, b) => b.blockNumber - a.blockNumber);

  const elapsedTime =
    (await sdk.api.util.getTimestamp(logs[0].blockNumber, 'arbitrum')) -
    (await sdk.api.util.getTimestamp(logs[1].blockNumber, 'arbitrum'));

  const rewardsReceived = Number(logs[0].args.profit) / 1e6;
  // daily compounding
  const apyBase = calcApy(rewardsReceived, tvlUsd, elapsedTime);
  return [
    {
      pool: xUSD,
      symbol: 'xUSD',
      project: 'overnight-finance',
      chain: 'arbitrum',
      tvlUsd,
      apyBase,
    },
  ];
};

function calcApy(profit, totalSupply, elapsedTime) {
  if (profit == 0) {
    return 0;
  }
  const hourlyRate = (profit / totalSupply / elapsedTime) * 3600;
  const dailyRate = hourlyRate * 24;
  const apy = (dailyRate + 1) ** 365 - 1;
  return apy * 100;
}

module.exports = {
  apy,
  url: 'https://app.overnight.fi/',
};
