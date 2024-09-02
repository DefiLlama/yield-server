const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abiLockup = require('./abiLockup');

const calcYield = async (chain, lockupAddress, extStableAddress) => {
  const latestBlock = await sdk.api.util.getLatestBlock(chain);

  const SECONDS_IN_DAY = 86400;
  const DAYS_IN_YEAR = 365;

  const oldBlock = await sdk.api.util.lookupBlock(
    latestBlock.timestamp - SECONDS_IN_DAY,
    { chain: chain }
  );
  const oldBlock7d = await sdk.api.util.lookupBlock(
    latestBlock.timestamp - SECONDS_IN_DAY * 7,
    { chain: chain }
  );

  const valueOld =
    (
      await sdk.api.abi.call({
        target: lockupAddress,
        abi: abiLockup.find((m) => m.name === 'value'),
        chain: chain,
        block: oldBlock.block,
      })
    ).output /
    10 ** 18;

  const valueOld7d =
    (
      await sdk.api.abi.call({
        target: lockupAddress,
        abi: abiLockup.find((m) => m.name === 'value'),
        chain: chain,
        block: oldBlock7d.block,
      })
    ).output /
    10 ** 18;

  const totalSupply =
    (
      await sdk.api.abi.call({
        target: lockupAddress,
        abi: abiLockup.find((m) => m.name === 'totalSupply'),
        chain: chain,
        block: latestBlock.number,
      })
    ).output /
    10 ** 18;

  const value =
    (
      await sdk.api.abi.call({
        target: lockupAddress,
        abi: abiLockup.find((m) => m.name === 'value'),
        chain: chain,
        block: latestBlock.number,
      })
    ).output /
    10 ** 18;

  const apy = ((value / valueOld) ** DAYS_IN_YEAR - 1) * 100;
  const apy7d = ((value / valueOld7d) ** (DAYS_IN_YEAR / 7) - 1) * 100;

  return {
    pool: lockupAddress + '-' + chain,
    chain: utils.formatChain(chain),
    project: 'yama-finance',
    symbol: utils.formatSymbol('USDT'),
    tvlUsd: totalSupply * value,
    apyBase: apy,
    apyBase7d: apy7d,
    underlyingTokens: [extStableAddress],
    poolMeta: 'USDT PSM LP',
  };
};

const main = async () => {
  return [
    await calcYield(
      'arbitrum',
      '0x3296EE4Fa62D0D78B1999617886E969a22653383',
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
    ),
    await calcYield(
      'polygon_zkevm',
      '0xd34296f80676A9F3AF103c3acE6BCCFF8E26a92c',
      '0x1E4a5963aBFD975d8c9021ce480b42188849D41d'
    ),
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://yama.finance/app/lend',
};
