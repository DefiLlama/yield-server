const sdk = require('@defillama/sdk');
const utils = require('../utils');

const STETH = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84';
const TOKEN_REBASED =
  'event TokenRebased(uint256 indexed reportTimestamp, uint256 timeElapsed, uint256 preTotalShares, uint256 preTotalEther, uint256 postTotalShares, uint256 postTotalEther, uint256 sharesMintedAsFees)';

// https://docs.lido.fi/integrations/api#last-lido-apr-for-steth
const getApr = async () => {
  const now = Math.floor(Date.now() / 1000);
  const logs = await sdk.getEventLogs({
    target: STETH,
    eventAbi: TOKEN_REBASED,
    chain: 'ethereum',
    fromTimestamp: now - 3 * 86400,
    toTimestamp: now,
  });
  if (!logs.length) throw new Error('lido: no TokenRebased event in 3 days');

  // logs are unordered
  const { args } = logs.reduce((a, b) =>
    Number(b.args.reportTimestamp) > Number(a.args.reportTimestamp) ? b : a
  );
  const pre = Number(args.preTotalEther) / Number(args.preTotalShares);
  const post = Number(args.postTotalEther) / Number(args.postTotalShares);
  return ((post - pre) / pre) * (31536000 / Number(args.timeElapsed)) * 100;
};

const topLvl = async () => {
  const [apr, { output: totalSupply }, { pricesByAddress }] = await Promise.all(
    [
      getApr(),
      sdk.api.erc20.totalSupply({ target: STETH, chain: 'ethereum' }),
      utils.getPrices([STETH], 'ethereum'),
    ]
  );

  return {
    pool: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84-ethereum',
    chain: utils.formatChain('ethereum'),
    project: 'lido',
    symbol: 'stETH',
    tvlUsd: (totalSupply / 1e18) * pricesByAddress[STETH],
    apyBase: apr,
    underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    isIntrinsicSource: true
  };
};

const main = async () => [await topLvl()];

module.exports = {
  protocolId: '182',
  timetravel: false,
  apy: main,
  url: 'https://lido.fi/#networks',
};
