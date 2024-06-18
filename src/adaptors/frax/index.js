const sdk = require('@defillama/sdk');

const utils = require('../utils');

const { farmAbi, pairAbi } = require('./abi');
const { vstFraxStaking } = require('./vstFraxStaking');
const { getERC4626Info } = require('../../helper/erc4626');

const FRAXSWAP_POOLS_URL = 'https://api.frax.finance/v2/fraxswap/pools';
const STAKING_URL = 'https://api.frax.finance/v1/pools';

const STAKING_CONTRACTS = {
  'Fraxswap FRAX/FPIS': '0x9bDBe31bB011D99c55b17455ACBe71814065E718',
  'Fraxswap FRAX/FXS': '0x06b7C6E8d22ecE102fb282C41075Bcc968b6E046',
  'Fraxswap FRAX/IQ': '0x5e15E40A3AA06bECA711EdE9F3F76E1d80C34490',
  'Fraxswap FRAX/IQ V2': '0xBF33B67F243a4DAbED494Ff5840f113B2E202a0d',
  'Fraxswap FRAX/IQ V3': '0x35678017e1D252dA1CdD6745b147E3e75d1f9C27',
  'Fraxswap FRAX/pitchFXS': '0x9E66E7811fEacf5402B65021475d1A293f7ea797',
  'Fraxswap FRAX/pitchFXS V2': '0x899Aa575E0e46344D18471f69337663C48b76e35',
  'Fraxswap FRAX/pitchFXS V3': '0x24C66Ba25ca2A53bB97B452B9F45DD075b07Cf55',
  'Fraxswap FRAX/SYN': '0xE8453a2e8E97cba69365A1d727Fde3768b18d814',
};

const apy = async (timestamp) => {
  const sfrax = await getERC4626Info(
    '0xA663B02CF0a4b149d2aD41910CB81e23e1c41c32',
    'ethereum',
    timestamp
  );
  const sfraxvault = {
    ...sfrax,
    project: 'frax',
    symbol: `sFRAX`,
    tvlUsd: sfrax.tvl / 1e18,
    underlyingTokens: ['0x853d955acef822db058eb8505911ed77f175b99e'],
  };
  const { pools: fxswapData } = await utils.getData(FRAXSWAP_POOLS_URL);
  const stakingData = await utils
    .getData(STAKING_URL)
    .then((data) => data.filter((el) => el.platform === 'frax'));

  const [underlyingContracts, rewardTokens] = await Promise.all(
    ['stakingToken', 'getAllRewardTokens'].map(
      async (method) =>
        await Promise.all(
          Object.values(STAKING_CONTRACTS).map(
            async (contract) =>
              (
                await sdk.api.abi.call({
                  target: contract,
                  chain: 'ethereum',
                  abi: farmAbi.find(({ name }) => name === method),
                })
              ).output
          )
        )
    )
  );
  const [underlyingTokens0, underlyingTokens1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      utils.makeMulticall(
        pairAbi.find(({ name }) => name === method),
        underlyingContracts,
        'ethereum'
      )
    )
  );
  const stakingRes = Object.entries(STAKING_CONTRACTS).map(([name, lp], i) => {
    const data = stakingData.find(({ identifier }) => identifier === name);
    if (!data) return;

    return {
      pool: lp,
      project: 'frax',
      chain: 'ethereum',
      symbol: data.pool_tokens.join('-'),
      tvlUsd: data.liquidity_locked,
      apyReward: data.apy,
      underlyingTokens: [underlyingTokens0[i], underlyingTokens1[i]],
      rewardTokens: rewardTokens[i],
    };
  });

  const fraxSwapRes = fxswapData.map((pool) => {
    return {
      pool: pool.poolAddress,
      project: 'frax',
      chain: utils.formatChain(pool.chain),
      symbol: `${pool.token0Symbol}-${pool.token1Symbol}`,
      tvlUsd: pool.tvl || 0,
      apyBase: (((pool.fees7D / 7) * 365) / (pool.tvl || 1)) * 100,
      underlyingTokens: [pool.token0Address, pool.token1Address],
    };
  });

  const vstFraxStakingRes = await vstFraxStaking();

  return fraxSwapRes
    .concat(stakingRes)
    .concat(vstFraxStakingRes)
    .concat([sfraxvault])
    .filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.frax.finance/staking/overview',
};
