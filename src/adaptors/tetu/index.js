const utils = require('../utils');
const sdk = require("@defillama/sdk");
const { default: BigNumber } = require('bignumber.js');
const TETU_Reward_Token_FTM = '0x65c9d9d080714cDa7b5d58989Dc27f897F165179';
const TETU_Reward_Token_MATIC = '0x255707B70BF90aa112006E1b07B9AeA6De021424';

const chainMap = {
  'MATIC': 'polygon',
  'FANTOM': 'fantom',
};

const rewardMap = {
  'MATIC': TETU_Reward_Token_MATIC,
  'FANTOM': TETU_Reward_Token_FTM,
};

async function fetchApyByNetwork(network) {
  const data = await utils.getData(`https://api.tetu.io/api/v1/reader/vaultInfos?network=${network}`);
  const poolData = data
    .filter(e => e.active === true)
    .filter(e => e.ppfsApr !== 0)
    const lpSymbol = await Promise.all(
      poolData.map(async (pool, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: pool.assets.map((assetsAddress) => ({
            target: assetsAddress,
          })),
          abi: 'erc20:symbol',
          chain: chainMap[network],
        })
        ).output.map(({ output }) => output)
        )
  );
  const result = poolData.map((pool, index) => {
    const tvlUsd = BigNumber(pool.tvlUsdc).div(BigNumber('10').pow(18));
    const apyBase = utils.aprToApy(Number(pool.swapFeesAprDaily || 0));

    const ppfsApr = BigNumber(pool.ppfsApr || '0')
      .div(BigNumber('10').pow(18))
    const rewardApr = pool.rewardsApr
      .reduce((acc, pev) =>  acc.plus(BigNumber(pev)) , BigNumber('0'))
      .div(BigNumber('10').pow(18));

    const apr = ppfsApr.plus(rewardApr).toNumber();
    const apyReward = utils.aprToApy(apr)
    return {
      pool: pool.addr,
      chain: utils.formatChain(chainMap[network]),
      project: 'tetu',
      symbol: lpSymbol[index].join('-'),
      tvlUsd: tvlUsd.toNumber(),
      apyBase: apyBase,
      apyReward: apyReward,
      rewardTokens: pool.rewardTokens.length ? pool.rewardTokens : [rewardMap[network]]
    }
  });
  return result;
}

async function apy() {
  const maticData =  await fetchApyByNetwork('MATIC');
  const fantomData =  await fetchApyByNetwork('FANTOM');
  return maticData.concat(fantomData);
}


module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://tetu.io/',
};
