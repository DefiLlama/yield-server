const utils = require('../utils');
const { v1VaultAbi } = require('./abi');
const { Web3 } = require('web3');
const dayjs = require('dayjs');
const duration = require('dayjs/plugin/duration');
const { compact, isEmpty, last } = require('lodash');

dayjs.extend(duration);

const RPC_URL = 'https://arb1.arbitrum.io/rpc';
const APR_BASE_DAYS = 30;
const V1_VAULTS = [
  {
    name: 'ETH-USDC.e',
    address: '0xB9c5425084671221d7D5A547dBf1Bdcec26C8B7d',
    yieldStart: 1689033600000,
    showApy: true,
  },
];
const web3 = new Web3(RPC_URL);

const getAprFromActionEvents = async (address, yieldStart, block) => {
  const v1Contract = new web3.eth.Contract(v1VaultAbi, address);

  const events = await v1Contract.getPastEvents('Action', {
    filter: { actionType: [0] },
    fromBlock: block,
  });

  const tokenValueList = await Promise.all(
    events.map(async (event) => {
      const block = await web3.eth.getBlock(event.blockNumber);
      const blockTime = dayjs.unix(block.timestamp);

      if (blockTime.valueOf() < yieldStart) {
        return null;
      }
      const totalAssets = event.returnValues.totalAssets;
      const totalSupply = event.returnValues.totalSupply;
      const tokenValue = totalSupply !== 0 ? totalAssets / totalSupply : 0;
      return {
        timestamp: blockTime.valueOf(),
        tokenValue,
      };
    })
  );

  const tokenValues = compact(tokenValueList);
  const lastSnapshot = last(tokenValues);
  const lastSnapshotTime = lastSnapshot?.timestamp ?? yieldStart;
  const yearDays = dayjs.duration(1, 'years').asDays();

  if (tokenValues.length >= APR_BASE_DAYS) {
    const baseSnapshot = tokenValues[tokenValues.length - APR_BASE_DAYS];
    const gainValue = lastSnapshot.tokenValue - baseSnapshot.tokenValue;
    return (
      (gainValue / baseSnapshot.tokenValue) * 100 * (yearDays / APR_BASE_DAYS)
    );
  } else {
    const period = dayjs
      .duration(lastSnapshotTime - yieldStart, 'milliseconds')
      .asDays();
    return lastSnapshot.tokenValue * (yearDays / period);
  }
};

const getApy = async () => {
  const totalDepositList = await Promise.all(
    ['totalAssets', 'decimals', 'token0'].map((method) =>
      utils.makeMulticall(
        v1VaultAbi.find(({ name }) => name === method),
        V1_VAULTS.map(({ address }) => address),
        'arbitrum'
      )
    )
  );

  const startTimestamp = dayjs()
    .subtract(APR_BASE_DAYS + 5, 'days')
    .unix();
  const blocks = await utils.getBlocksByTime([startTimestamp], 'arbitrum');

  const res = await Promise.all(
    V1_VAULTS.map(async ({ name, address, yieldStart, showApy }, idx) => {
      const apyBase = showApy
        ? await getAprFromActionEvents(address, yieldStart, blocks[0])
        : 0;
      const pool = {
        pool: address,
        chain: utils.formatChain('arbitrum'),
        project: 'orange-finance',
        symbol: name,
        tvlUsd:
          Number(totalDepositList[0][idx]) / 10 ** totalDepositList[1][idx],
        apyBase,
        underlyingTokens: [totalDepositList[2][idx]],
        poolMeta: 'v1',
      };
      return pool;
    })
  );

  return res;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://alpha.orangefinance.io',
};
