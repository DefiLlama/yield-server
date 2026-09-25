const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'robinhood';
const PROJECT = 'nukes-fun';
const NUKE = '0x0000000005aCa17e8bd5779Fc87E13cb433aEd24';
const STAKED_NUKE = '0x4BEF5C76A50bc68f63B8E2628CDB3b33cB445934';
const STAKING = '0x9c648d57e929f59b483b2903390725449F990CB8';
const DISTRIBUTOR = '0xcc7C542c2e3Ad3Fa2BF939c1F92260f86C5b8F9E';
const NUKE_USDG_POOL = '0x459B6f6F038CcEFfB6B10Ad0D38C80a64ec70B04';

const NUKE_DECIMALS = 9;
const USDG_DECIMALS = 6;
const EPOCHS_PER_YEAR = 365 * 24 * 60 * 60 / 28800;

const stakingAbi = {
  enabled: 'bool:enabled',
  totalStaked: 'uint256:totalStaked',
};

const slot0Abi =
  'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)';

const getNukePrice = (sqrtPriceX96) => {
  // The pool is NUKE/USDG with NUKE as token0. USDG is the protocol's dollar unit.
  const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
  return sqrtPrice ** 2 * 10 ** (NUKE_DECIMALS - USDG_DECIMALS);
};

const apy = async () => {
  const block = await sdk.api.util.getLatestBlock(CHAIN);
  const blockNumber = block.number;

  const [enabled, totalStaked, totalSupply, ratePerEpoch, slot0] =
    await Promise.all([
      sdk.api.abi.call({
        target: STAKING,
        abi: stakingAbi.enabled,
        chain: CHAIN,
        block: blockNumber,
      }),
      sdk.api.abi.call({
        target: STAKING,
        abi: stakingAbi.totalStaked,
        chain: CHAIN,
        block: blockNumber,
      }),
      sdk.api.abi.call({
        target: NUKE,
        abi: 'uint256:totalSupply',
        chain: CHAIN,
        block: blockNumber,
      }),
      sdk.api.abi.call({
        target: DISTRIBUTOR,
        abi: 'uint256:ratePerEpochWad',
        chain: CHAIN,
        block: blockNumber,
      }),
      sdk.api.abi.call({
        target: NUKE_USDG_POOL,
        abi: slot0Abi,
        chain: CHAIN,
        block: blockNumber,
      }),
    ]);

  if (!enabled.output) return [];

  const totalStakedRaw = Number(totalStaked.output);
  const totalSupplyRaw = Number(totalSupply.output);
  const ratePerEpochWadRaw = Number(ratePerEpoch.output);
  const nukePrice = getNukePrice(slot0.output[0]);

  if (
    !Number.isFinite(totalStakedRaw) ||
    !Number.isFinite(totalSupplyRaw) ||
    !Number.isFinite(ratePerEpochWadRaw) ||
    !Number.isFinite(nukePrice) ||
    totalStakedRaw <= 0 ||
    nukePrice <= 0
  ) {
    throw new Error(`Invalid NUKES.FUN staking data at block ${blockNumber}`);
  }

  const perEpochRate =
    (ratePerEpochWadRaw / 1e18) * (totalSupplyRaw / totalStakedRaw);
  const apyValue = Math.expm1(EPOCHS_PER_YEAR * Math.log1p(perEpochRate)) * 100;
  const tvlUsd = (totalStakedRaw / 10 ** NUKE_DECIMALS) * nukePrice;

  return [
    {
      pool: `${STAKING.toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'sNUKE',
      tvlUsd,
      apy: apyValue,
      underlyingTokens: [NUKE],
      token: STAKED_NUKE,
      poolMeta: 'Auto-rebasing NUKE staking',
      url: 'https://nukes.fun/stake',
    },
  ];
};

module.exports = {
  protocolId: '8578',
  timetravel: false,
  apy,
  url: 'https://nukes.fun/stake',
};
