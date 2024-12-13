const { gql, request } = require('graphql-request');
const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const KAI = '0x52369B1539EA8F4e1eadEEF18D85462Dcf9a3658';

const STEER_POOLS_URL =
  'https://mv-platform.vercel.app/liquidity/vaults?dex=Kinetix&chain=2222&provider=steer';

const chain = 'kava';

const getApy = async () => {
  const { data: steerPoolsWithTokens } = await axios.get(STEER_POOLS_URL);

  const poolsValues = steerPoolsWithTokens.map((p, i) => {
    const { address: poolAddress, apr, feeTier, decimals, token0, token1 } = p;

    const { feeApr, farmApr } = apr;

    const {
      address: token0Address,
      symbol: token0Symbol,
      decimals: token0Decimals,
      balance: token0Balance,
      price: token0Price,
    } = token0;

    const {
      address: token1Address,
      symbol: token1Symbol,
      decimals: token1Decimals,
      balance: token1Balance,
      price: token1Price,
    } = token1;

    const tvlUsd =
      Number(token0Balance) * token0Price + Number(token1Balance) * token1Price;

    const apyBase = utils.aprToApy(feeApr);
    const apyReward = utils.aprToApy(farmApr);

    return {
      pool: poolAddress,
      chain: utils.formatChain('kava'),
      project: 'kinetix-amm-v3',
      symbol: `${token0Symbol}-${token1Symbol}`,
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: apyReward ? [KAI] : [],
      underlyingTokens: [token0Address, token1Address],
    };
  });

  return poolsValues.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://kinetix.finance/pool/v3',
};
