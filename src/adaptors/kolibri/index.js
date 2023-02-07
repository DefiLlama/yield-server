const axios = require('axios');
const utils = require('../utils');

const poolsFunction = async () => {
  const kolibriContracts = [
    'KT1AjBcyTFsLWtyJfEuPtS55fyybR7ArJCa7', //KUSD_XTZ
    'KT1HHAEMSBtuQb1HBRLdjCby9Fa11st2RZpA', //kUSD_USDt
  ];

  const { data: pools } = await axios.get(
    'https://staking-api-mainnet.prod.quipuswap.com/v3/all-farms'
  );

  return pools.list
    .filter(
      ({ item: pool }) =>
        kolibriContracts.includes(pool.contractAddress) &&
        pool.stakeStatus === 'ACTIVE'
    )
    .map(({ item: pool }) => ({
      pool: pool.contractAddress,
      chain: utils.formatChain('Tezos'),
      project: 'kolibri',
      symbol: utils.formatSymbol('XTZ'),
      tvlUsd: parseFloat(pool.tvlInUsd),
      apy: pool.apy,
      rewardTokens: [pool.rewardToken.contractAddress],
      underlyingTokens: pool.tokens.map((token) => token.contractAddress),
      url: `https://quipuswap.com/farming/v3/${pool.id}`,
    }));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};