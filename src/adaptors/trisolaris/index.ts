const utils = require('../utils');
const sdk = require('@defillama/sdk');

const { token0, token1, name } = require('./abi');

const API_URL = 'https://cdn.trisolaris.io/datav2.json';

const TRI_TOKEN = '0xFa94348467f64D5A457F75F8bc40495D33c65aBB';

const makeCall = async (targets, abi) => {
  return (
    await sdk.api.abi.multiCall({
      abi,
      calls: targets.map((target) => ({ target })),
      chain: 'aurora',
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const apy = async () => {
  const farms = await utils.getData(API_URL);
  const lpAddresses = farms.map(({ lpAddress }) => lpAddress);

  const tokens0 = await makeCall(lpAddresses, token0);
  const tokens1 = await makeCall(lpAddresses, token1);
  const names = await makeCall(lpAddresses, name);
  const token0Symbols = await makeCall(tokens0, 'erc20:symbol');
  const token1Symbols = await makeCall(tokens1, 'erc20:symbol');

  const pools = farms.map((farm, i) => {
    const isStablePool = token0Symbols[i] === null;
    const name = isStablePool
      ? names[i].replace('Trisolaris ', '')
      : `${token0Symbols[i]}-${token1Symbols[i]}`;
    const extraApr = farm.nonTriAPRs.reduce((acc, val) => acc + val.apr, 0);

    return {
      pool: `${farm.lpAddress}-${farm.id}`,
      chain: utils.formatChain('aurora'),
      project: 'trisolaris',
      symbol: utils.formatSymbol(name),
      tvlUsd: farm.totalStakedInUSD,
      apyReward: farm.apr + extraApr,
      underlyingTokens: isStablePool
        ? [farm.lpAddress]
        : [tokens0[i], tokens1[i]],
      rewardTokens: [
        TRI_TOKEN,
        ...(extraApr ? farm.nonTriAPRs.map(({ address }) => address) : []),
      ],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://www.trisolaris.io/#/farm',
};
