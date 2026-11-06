const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const { getPriceApiData } = require('../utils');

const chain = 'hyperliquid';
const sthype = '0xffaa4a3d97fe9107cef8a3f48c069f577ff76cc1';
const whype = '0x5555555555555555555555555555555555555555';
const deploymentBlock = 25412;
const rawShares = '1000000000000000000000000';
const day = 86400;

// A fixed raw-share balance captures rebase yield without counting deposits.
const rateAt = async (block) =>
  BigInt(
    (
      await sdk.api.abi.call({
        chain,
        block,
        target: sthype,
        abi: 'function sharesToBalance(uint256) view returns (uint256)',
        params: [rawShares],
      })
    ).output
  );

function annualized(before, after, elapsed) {
  if (before <= 0n || after <= 0n || elapsed <= 0)
    throw new Error('Invalid stHYPE yield baseline');
  const change = new BigNumber(after.toString())
    .div(before.toString())
    .minus(1)
    .toNumber();
  const apy = Math.expm1((Math.log1p(change) * 31536000) / elapsed) * 100;
  if (!Number.isFinite(apy)) throw new Error('Invalid stHYPE APY');
  return apy;
}

const apy = async (timestamp) => {
  const now =
    timestamp === undefined
      ? Math.floor(Date.now() / 1000) - 60
      : Number(timestamp);
  if (!Number.isInteger(now) || now <= 7 * day)
    throw new Error('Invalid stHYPE timestamp');
  const [current, previous, week] = await Promise.all(
    [now, now - day, now - 7 * day].map((time) =>
      sdk.api.util.lookupBlock(time, { chain })
    )
  );
  if (previous.block < deploymentBlock)
    throw new Error('Insufficient stHYPE yield history');
  const [rate, rate1d, rate7d, supply, prices] = await Promise.all([
    rateAt(current.block),
    rateAt(previous.block),
    week.block >= deploymentBlock ? rateAt(week.block) : undefined,
    sdk.api.abi.call({
      chain,
      block: current.block,
      target: sthype,
      abi: 'uint256:totalSupply',
    }),
    getPriceApiData(
      `/prices/historical/${current.timestamp}/${chain}:${whype}`
    ),
  ]);
  const price = prices.coins?.[`${chain}:${whype}`]?.price;
  if (!Number.isFinite(price) || price <= 0)
    throw new Error('Missing HYPE price');
  const tvlUsd = new BigNumber(supply.output)
    .div('1e18')
    .times(price)
    .toNumber();
  if (!Number.isFinite(tvlUsd)) throw new Error('Invalid stHYPE TVL');
  return [
    {
      pool: `${sthype}-${chain}`,
      chain: 'Hyperliquid L1',
      project: 'sthype',
      symbol: 'stHYPE',
      token: sthype,
      underlyingTokens: [whype],
      isIntrinsicSource: true,
      searchTokenOverride: sthype,
      tvlUsd,
      apyBase: annualized(rate1d, rate, current.timestamp - previous.timestamp),
      ...(rate7d === undefined
        ? {}
        : {
            apyBase7d: annualized(
              rate7d,
              rate,
              current.timestamp - week.timestamp
            ),
          }),
      url: 'https://app.valantis.xyz/vaults',
    },
  ];
};

module.exports = { protocolId: '6457', timetravel: true, apy };
