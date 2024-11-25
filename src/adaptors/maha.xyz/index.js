const axios = require('axios');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');
const poolHelperAbi = require('./uiHelper.json');
const ethers = require('ethers');

const rpcBase =
  'https://base-mainnet.infura.io/v3/13902f653ad545cc8ceeca9fa941cacd';
const poolHelper = '0x1bC8d0b4CaAC1Fc95C8564897A0DE2bAeE40dCda';
const stakingPools = {
  // ethereum: [
  //   '0x154F52B347D8E48b8DbD8D8325Fe5bb45AAdCCDa',
  //   '0x237efE587f2cB44597063DC8403a4892a60A5a4f',
  //   '0xeF12d1614eb0e2bC8E8884c7d4C7f15E34164F40',
  // ],
  base: ['0x1097dFe9539350cb466dF9CA89A5e61195A520B0'],
};

const underlyingTokens = {
  'base:0x1097dFe9539350cb466dF9CA89A5e61195A520B0': [
    '0x0A27E060C0406f8Ab7B64e3BEE036a37e5a62853',
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ],
};

const chainId = {
  base: '8453',
};

const getMahaPrice = async () => {
  try {
    const mahaPrice = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=mahadao&vs_currencies=usd'
    );

    return mahaPrice.data.mahadao.usd;
  } catch (error) {
    console.log('error fetching maha price');
  }
};

const getPoolsData = async () => {
  const pools = [];

  for (const [key, value] of Object.entries(stakingPools)) {
    const chain = key;

    await Promise.all(
      value.map(async (poolAddress) => {
        const symbol = (
          await sdk.api.abi.call({
            chain: chain,
            abi: abi.find(({ name }) => name === 'symbol'),
            target: poolAddress,
          })
        ).output;

        const rewardToken1 = (
          await sdk.api.abi.call({
            chain: chain,
            abi: abi.find(({ name }) => name === 'rewardToken1'),
            target: poolAddress,
          })
        ).output;

        const rewardToken2 = (
          await sdk.api.abi.call({
            chain: chain,
            abi: abi.find(({ name }) => name === 'rewardToken2'),
            target: poolAddress,
          })
        ).output;

        const receivedTokenAddress = poolAddress;

        const mahaPrice = await getMahaPrice();

        const res = (
          await sdk.api.abi.call({
            chain: chain,
            abi: poolHelperAbi.find(({ name }) => name === 'getPoolInfo'),
            params: [
              poolAddress,
              mahaPrice * 1e8,
              '0x0000000000000000000000000000000000000000',
            ],
            target: poolHelper,
          })
        ).output;

        const apyReward = (Number(res.mahaAprE8) + Number(res.usdcAprE8)) / 1e6;

        const pool = {
          pool: `${receivedTokenAddress}-${chain}`.toLowerCase(),
          chain: chain,
          project: 'maha.xyz',
          symbol: symbol,
          tvlUsd: res.poolUsdTVLE8 / 1e8,
          apyBase: 0,
          apyReward: apyReward,
          rewardTokens: [rewardToken1, rewardToken2],
          underlyingTokens: underlyingTokens[`${chain}:${poolAddress}`],
          url: `https://app.maha.xyz/earn/pool/${chainId[chain]}/${poolAddress}/`,
        };

        pools.push(pool);
      })
    );
  }
  return pools;
  // console.log(pools);
};

const apy = async () => {
  const pools = await getPoolsData();

  return pools;
};

module.exports = {
  apy,
};
