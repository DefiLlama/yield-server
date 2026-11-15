const sdk = require('@defillama/sdk');
const axios = require('axios');

const CHAIN = 'base';
const SUPPLY = 1_000_000n * 10n ** 18n;
const EPOCHS_PER_YEAR = 96 * 365; // 15-minute epochs
const EPOCHS_PER_DAY = 96;

const NARA = '0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';

const PRINCIPAL_LEDGER_V5 = '0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2';
const EPOCH_ENGINE_V5 = '0xd93FbEbFb33FAc9288125074625D4750573B1a53';
const REWARD_LEDGER_V5 = '0xC72671D9438388638547444524F6542b650C9264';
const UNIV3_NARA_USDC_POOL = '0xEEd718D239C5508775e312F60Eb12792a49d4Bba';

const ABI = {
  principalAccounting:
    'function principalAccounting() view returns ((bool initialized, uint64 openedEpoch, uint256 principalInventory, uint256 principalSnapshot, uint256 activeModelWeight, uint256 activeRewardWeight, int256 pendingPrincipalDelta, uint256 positionCount))',
  bindings:
    'function bindings() view returns ((uint256 schemaVersion, address nara, address reserve, address emissionModel, address positionNFT, address bootstrapAuthority, bool bindingsSealed, bool activated, uint256 expectedGenesisFunding))',
  emissionConfig:
    'function emissionConfig() view returns ((uint256 eMax, uint256 beta0Wad, uint256 mWad, uint256 aWad, uint256 bWad, uint256 cWad, uint256 dWad, uint256 dripSplitWad, uint256 growthFactorWad, uint256 minBaseEmission, uint256 maxBaseEmission, uint256 warmupRateWad, uint256 bootstrapDecayWad))',
  emissionState:
    'function emissionState() view returns ((uint256 baseEmission, uint256 warmupFactorWad, uint256 stressWad, uint256 bootstrapWeight))',
  fundingState:
    'function fundingState() view returns ((bool initialFundingRecognized, uint256 eligibleReserve, uint256 futureReserve, uint256 lastFundingSequence, uint256 cumulativeRecognized, uint256 cumulativeReleased, uint32 releaseGasLimit, uint32 minimumGasBeforeRelease))',
  calculateNext:
    'function calculateNext((uint256 eMax, uint256 beta0Wad, uint256 mWad, uint256 aWad, uint256 bWad, uint256 cWad, uint256 dWad, uint256 dripSplitWad, uint256 growthFactorWad, uint256 minBaseEmission, uint256 maxBaseEmission, uint256 warmupRateWad, uint256 bootstrapDecayWad) config, (uint256 baseEmission, uint256 warmupFactorWad, uint256 stressWad, uint256 bootstrapWeight) previous, (uint256 modelFloat, uint256 modelWeight) inputs) view returns (((uint256 baseEmission, uint256 warmupFactorWad, uint256 stressWad, uint256 bootstrapWeight) nextState, uint256 weightedLockShareWad, uint256 betaWad, uint256 horizon, uint256 retentionWad, uint256 emission, uint256 admittedNara, uint256 targetNara, uint256 retainedAdmittedNara, uint256 heartbeat))',
  rewardState:
    'function rewardState() view returns ((bool initialized, uint64 openedEpoch, uint64 nextCheckpoint, uint256 protectedNaraSnapshot, int256 pendingNaraDelta, uint256 naraAdmissionHeadroom, bool receiptPrepared))',
  indicesAt:
    'function indicesAt(uint8 asset, uint64 boundary) view returns (bool exists, uint256 baseIndex, uint256 rarityIndex)',
  slot0:
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
};

/**
 * Convert a decoded Solidity struct object into a positional string tuple array.
 * @param {Record<string, unknown>} obj Decoded struct return value.
 * @param {string[]} keys Ordered struct field names.
 * @returns {string[]} Positional stringified tuple elements.
 */
const toPlainTuple = (obj, keys) => keys.map((k) => String(obj[k]));

/**
 * Fetch current token USD prices from the DefiLlama coins API.
 * @param {string[]} keys Chain-prefixed token identifiers (`chain:address`).
 * @returns {Promise<Record<string, { price?: number }>>} Price map keyed by coin identifier.
 */
const fetchPrices = async (keys) => {
  try {
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/current/${keys.join(',')}`
    );
    return data?.coins || {};
  } catch {
    return {};
  }
};

/**
 * Resolve the current NARA USD spot price from DefiLlama coins API with on-chain Uniswap v3 fallback.
 * @param {Record<string, { price?: number }>} coins Price map returned by DefiLlama coins API.
 * @param {number} usdcPrice Current USD price of Base USDC.
 * @returns {Promise<number>} NARA price in USD.
 */
const getNaraSpotPriceUsd = async (coins, usdcPrice) => {
  const coinKey = `${CHAIN}:${NARA}`;
  if (coins[coinKey]?.price > 0) return coins[coinKey].price;
  const lowerKey = coinKey.toLowerCase();
  if (coins[lowerKey]?.price > 0) return coins[lowerKey].price;

  // Fallback: read spot price from the Base Uniswap v3 NARA/USDC pool (token0 = USDC 6d, token1 = NARA 18d)
  const { output: s0 } = await sdk.api.abi.call({
    chain: CHAIN,
    target: UNIV3_NARA_USDC_POOL,
    abi: ABI.slot0,
  });
  const sqrtPrice = Number(s0.sqrtPriceX96) / 2 ** 96;
  const naraPerUsdcRaw = sqrtPrice * sqrtPrice; // NARA(1e18) per USDC(1e6)
  if (!Number.isFinite(naraPerUsdcRaw) || naraPerUsdcRaw <= 0) return 0;
  return (1e12 / naraPerUsdcRaw) * usdcPrice;
};

/**
 * Compute live TVL, realized 24h fee APY, and forward 1.00x lower-bound NARA emission APY for NARA Protocol V5 on Base.
 * @returns {Promise<Array<Record<string, unknown>>>} DefiLlama yield pool descriptor array.
 */
const apy = async () => {
  const [
    { output: acct },
    { output: bindings },
    { output: eCfg },
    { output: eState },
    { output: fState },
    { output: rState },
    coins,
  ] = await Promise.all([
    sdk.api.abi.call({
      chain: CHAIN,
      target: PRINCIPAL_LEDGER_V5,
      abi: ABI.principalAccounting,
    }),
    sdk.api.abi.call({
      chain: CHAIN,
      target: EPOCH_ENGINE_V5,
      abi: ABI.bindings,
    }),
    sdk.api.abi.call({
      chain: CHAIN,
      target: EPOCH_ENGINE_V5,
      abi: ABI.emissionConfig,
    }),
    sdk.api.abi.call({
      chain: CHAIN,
      target: EPOCH_ENGINE_V5,
      abi: ABI.emissionState,
    }),
    sdk.api.abi.call({
      chain: CHAIN,
      target: EPOCH_ENGINE_V5,
      abi: ABI.fundingState,
    }),
    sdk.api.abi.call({
      chain: CHAIN,
      target: REWARD_LEDGER_V5,
      abi: ABI.rewardState,
    }),
    fetchPrices([`${CHAIN}:${NARA}`, `${CHAIN}:${USDC}`, `${CHAIN}:${WETH}`]),
  ]);

  const usdcPrice =
    coins[`${CHAIN}:${USDC}`]?.price ||
    coins[`${CHAIN}:${USDC}`.toLowerCase()]?.price ||
    1;
  const ethPrice =
    coins[`${CHAIN}:${WETH}`]?.price ||
    coins[`${CHAIN}:${WETH}`.toLowerCase()]?.price ||
    0;
  const naraPrice = await getNaraSpotPriceUsd(coins, usdcPrice);

  const totalPrincipalNara = Number(acct.principalInventory) / 1e18;
  const activeWeightNara = Number(acct.activeModelWeight) / 1e18;
  const tvlUsd = totalPrincipalNara * naraPrice;

  // 1. Unboosted (1.00x lower-bound) NARA emission APY from NARAEmissionModelV5
  const modelFloat =
    SUPPLY -
    BigInt(acct.principalSnapshot) -
    BigInt(rState.protectedNaraSnapshot) -
    BigInt(fState.eligibleReserve);

  const cfgTuple = toPlainTuple(eCfg, [
    'eMax',
    'beta0Wad',
    'mWad',
    'aWad',
    'bWad',
    'cWad',
    'dWad',
    'dripSplitWad',
    'growthFactorWad',
    'minBaseEmission',
    'maxBaseEmission',
    'warmupRateWad',
    'bootstrapDecayWad',
  ]);
  const stateTuple = toPlainTuple(eState, [
    'baseEmission',
    'warmupFactorWad',
    'stressWad',
    'bootstrapWeight',
  ]);

  const { output: quote } = await sdk.api.abi.call({
    chain: CHAIN,
    target: bindings.emissionModel,
    abi: ABI.calculateNext,
    params: [cfgTuple, stateTuple, [String(modelFloat), String(acct.activeModelWeight)]],
  });

  const targetNaraWei = BigInt(quote.targetNara);
  const eligibleReserveWei = BigInt(fState.eligibleReserve);
  const deliveredPerEpochNara =
    Number(targetNaraWei <= eligibleReserveWei ? targetNaraWei : eligibleReserveWei) /
    1e18;

  const apyReward =
    activeWeightNara > 0
      ? ((deliveredPerEpochNara * EPOCHS_PER_YEAR) / activeWeightNara) * 100
      : 0;

  // 2. Realized 24h (96 epochs) ETH + USDC protocol fee APY (1.00x lower-bound)
  const curBoundary = Number(rState.nextCheckpoint);
  const prevBoundary = Math.max(0, curBoundary - EPOCHS_PER_DAY);
  let apyBase = 0;

  if (curBoundary > prevBoundary && naraPrice > 0) {
    const [ethNow, ethPrev, usdcNow, usdcPrev] = await Promise.all([
      sdk.api.abi.call({
        chain: CHAIN,
        target: REWARD_LEDGER_V5,
        abi: ABI.indicesAt,
        params: [1, curBoundary],
      }),
      sdk.api.abi.call({
        chain: CHAIN,
        target: REWARD_LEDGER_V5,
        abi: ABI.indicesAt,
        params: [1, prevBoundary],
      }),
      sdk.api.abi.call({
        chain: CHAIN,
        target: REWARD_LEDGER_V5,
        abi: ABI.indicesAt,
        params: [2, curBoundary],
      }),
      sdk.api.abi.call({
        chain: CHAIN,
        target: REWARD_LEDGER_V5,
        abi: ABI.indicesAt,
        params: [2, prevBoundary],
      }),
    ]);

    const deltaEthIndex =
      ethNow.output.exists && ethPrev.output.exists
        ? BigInt(ethNow.output.baseIndex) -
          BigInt(ethPrev.output.baseIndex) +
          (BigInt(ethNow.output.rarityIndex) - BigInt(ethPrev.output.rarityIndex))
        : 0n;
    const deltaUsdcIndex =
      usdcNow.output.exists && usdcPrev.output.exists
        ? BigInt(usdcNow.output.baseIndex) -
          BigInt(usdcPrev.output.baseIndex) +
          (BigInt(usdcNow.output.rarityIndex) - BigInt(usdcPrev.output.rarityIndex))
        : 0n;

    // SCALE = 1e27; per 1e18 weight -> raw units = deltaIndex / 1e9
    const ethPerNara24h = Number(deltaEthIndex) / 1e27;
    const usdcPerNara24h = Number(deltaUsdcIndex) / 1e15; // 1e9 * 1e6 decimals
    const feeUsdPerNara24h = ethPerNara24h * ethPrice + usdcPerNara24h * usdcPrice;

    apyBase = ((feeUsdPerNara24h * 365) / naraPrice) * 100;
  }

  return [
    {
      pool: `${PRINCIPAL_LEDGER_V5.toLowerCase()}-${CHAIN}`,
      chain: 'Base',
      project: 'nara-protocol',
      symbol: 'NARA',
      token: NARA.toLowerCase(),
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: [NARA],
      underlyingTokens: [NARA],
      poolMeta: '1d-365d lock (1x min APY; up to 4x)',
      url: 'https://naraprotocol.io',
    },
  ];
};

module.exports = {
  protocolId: '7839',
  timetravel: false,
  apy,
  url: 'https://naraprotocol.io',
};
