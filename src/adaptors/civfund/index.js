const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const utils = require('../utils');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');

const CIV_TOKEN = '0x37fE0f067FA808fFBDd12891C0858532CFE7361d';
const MASTERCHEF_ADDRESS = '0x8a774F790aBEAEF97b118112c790D0dcccA61099';
const POOLS_ONE_TOKEN = [
  '0x73a83269b9bbafc427e76be0a2c1a1db2a26f4c2',
  '0x37fe0f067fa808ffbdd12891c0858532cfe7361d'
];
const API_POOL_DATA = (poolId) => `https://api.civfund.org/getPoolData/${poolId}/?chainId=1`;

const getApy = async () => {
  const poolLength = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'ethereum',
    abi: masterChefABI.find((e) => e.name === 'poolLength'),
  });

  const poolRes = await Promise.all([...Array(Number(poolLength.output)).keys()].map((i) => utils.getData(API_POOL_DATA(i))));
  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpABI.filter(({ name }) => name === method)[0],
        calls: poolRes.filter(e => !POOLS_ONE_TOKEN.includes(e.lpToken)).map(({lpToken}) => ({
          target: lpToken,
        })),
        chain: 'ethereum',
        requery: true,
      })
    )
  );
  let tokens0 = underlyingToken0.output.map((res) => res.output);
  let tokens1 = underlyingToken1.output.map((res) => res.output);

  tokens0 = [
    ...POOLS_ONE_TOKEN,
    ...tokens0,
  ];
  tokens1 = [undefined, undefined, ...tokens0];

  const poolApy = poolRes.map((pool, i) => {
    const apy = pool.roiPerYearPerc;
    return {
      pool: `ethereum:${pool.lpToken}`,
      chain: utils.formatChain('ethereum'),
      project: 'civfund',
      symbol: `${pool.symbol1}${pool.symbol2 ? '-' + pool.symbol2 : ''}`,
      tvlUsd: Number(pool.tvlUSD),
      apy,
      underlyingTokens: !pool.symbol2 ? [pool.lpToken]  : [tokens0[i], tokens1[i]],
      rewardTokens: ['0x73a83269b9bbafc427e76be0a2c1a1db2a26f4c2'] // ONE
    }
  });

  return poolApy;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://civfund.org/',
};
