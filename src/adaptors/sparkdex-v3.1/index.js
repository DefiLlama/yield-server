const axios = require('axios');
const sdk = require('@defillama/sdk');

const rFLR = '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e'; // Reward FLR

const calculateApy = (_apr) => {
  const APR = _apr / 100;
  const n = 365;

  // APY calculation
  const APY = (1 + APR / n) ** n - 1;
  const APYPercentage = APY * 100;

  return APYPercentage;
};

// with the fee switch on, the pool sends 1/feeProtocol of each swap fee to the
// protocol (feeProtocol reads 68, i.e. 1/4, on the large pools), so lps only earn the
// rest. token0's cut is the low nibble, token1's the high one; take the larger,
// as uniswap-v3 does. a pool whose slot0 read fails gets null, so it is dropped
// rather than shown at the gross fee
const getLpFeeShares = async (poolIds) => {
  const { output } = await sdk.api.abi.multiCall({
    abi: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    calls: poolIds.map((target) => ({ target })),
    chain: 'flare',
    permitFailure: true,
  });
  const share = (n) => (n ? 1 / n : 0);
  return output.map(({ output: slot0 }) => {
    if (!slot0) return null;
    const feeProtocol = Number(slot0.feeProtocol);
    return 1 - Math.max(share(feeProtocol & 0xf), share(feeProtocol >> 4));
  });
};

const apy = async () => {
  const pools = (
    await axios.get(
      'https://api.sparkdex.ai/dex/v3/pairs?chainId=14&dex=SparkDEX&version=v3_1'
    )
  ).data[0].data;

  const chain = 'Flare';
  const lpFeeShares = await getLpFeeShares(pools.map((lp) => lp.id));

  const i = pools.map((lp, idx) => {
    if (!lp.apr) return;
    if (lpFeeShares[idx] === null) return;

    const tvlUsd = lp.tvlUSD;
    // feesUSDDay is the gross swap fee (volume x fee tier)
    const feeUsd = lp.feesUSDDay * lpFeeShares[idx];

    const baseApy = (feeUsd / tvlUsd) * 365 * 100;

    let pool = {
      pool: `${lp.id}-${chain}`.toLowerCase(),
      symbol: `${lp.token0.symbol}-${lp.token1.symbol}`,
      project: 'sparkdex-v3.1',
      chain,
      tvlUsd,
      apyBase: baseApy,
      underlyingTokens: [lp.token0.address, lp.token1.address],
    };

    // Extract rFLR reward APRs
    const rFlrRewardAprs = lp.aprs.filter(
      (apr) => apr.provider === 'rFLR Rewards'
    );

    // Extract other reward APRs
    const rewardAprs = lp.aprs.filter(
      (apr) => !apr.isPoolApr && apr.provider !== 'rFLR Rewards'
    );

    // Calculate total reward APY from all sources
    const totalRewardApy = calculateApy(
      rewardAprs.reduce((sum, apr) => sum + apr.apr, 0)
    );
    const rFlrRewardApy = calculateApy(
      rFlrRewardAprs.reduce((sum, apr) => sum + apr.apr, 0)
    );

    // Add remaing rewards
    if (totalRewardApy > 0) {
      // Rewards can be swapped instantly to wFLR
      pool.apyReward = totalRewardApy;
      pool.rewardTokens = [rFLR]; // rFLR
    }

    // Add rFLR apr
    if (rFlrRewardApy > 0) {
      // rFLR can be swapped with 50% penalty instantly to wFLR or linear 12 months
      // so taking care to lower bund %50
      pool.apyReward = (pool.apyReward || 0) + rFlrRewardApy / 2;
      pool.rewardTokens = [rFLR]; // rFLR
    }

    return pool;
  });

  const result = i.filter(Boolean);

  console.log(result);

  return result;
};

module.exports = {
  protocolId: '5223',
  timetravel: false,
  apy,
  url: 'https://sparkdex.ai/pool',
};
