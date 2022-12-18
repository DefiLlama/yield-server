const sdk = require('@defillama/sdk');

const utils = require('../utils');

const { fraxCrvFarmAbi, crvPairAbi } = require('./abi');

const STAKING_URL = 'https://api.frax.finance/v1/pools';

const STAKING_CONTRACTS = {
  'Curve VSTFRAX-f': '0x127963A74c07f72D862F2Bdc225226c3251BD117',
};

const vstFraxStaking = async () => {
  const stakingData = await utils
    .getData(STAKING_URL)
    .then((data) => data.filter((el) => el.platform === 'curve_arbi_vstfrax'));

  const [underlyingContracts, rewardTokens] = await Promise.all(
    ['stakingToken', 'rewardsToken0'].map(
      async (method) =>
        await Promise.all(
          Object.values(STAKING_CONTRACTS).map(
            async (contract) =>
              (
                await sdk.api.abi.call({
                  target: contract,
                  chain: 'arbitrum',
                  abi: fraxCrvFarmAbi.find(({ name }) => name === method),
                })
              ).output
          )
        )
    )
  );

  const [underlyingTokens0, underlyingTokens1] = await Promise.all(
    [0, 1].map((param) =>
      utils.makeMulticall(
        crvPairAbi.find(({ name }) => name === 'coins'),
        underlyingContracts,
        'arbitrum',
        param
      )
    )
  );
  const stakingRes = Object.entries(STAKING_CONTRACTS).map(([name, lp], i) => {
    const data = stakingData.find(({ identifier }) => identifier === name);
    if (!data) return;

    return {
      pool: lp,
      project: 'frax',
      chain: 'arbitrum',
      symbol: 'VST-FRAX',
      tvlUsd: data.liquidity_locked,
      apyReward: data.apy,
      underlyingTokens: [underlyingTokens0[i], underlyingTokens1[i]],
      rewardTokens: rewardTokens[i],
    };
  });

  return stakingRes;
};

module.exports = {
  vstFraxStaking,
};
