const stellarSdk = require('@stellar/stellar-sdk');
const { formatChain, getPrices } = require('../utils');

const BLNT_ID = 'CCBNWP5L7ZSXA3DBWCMFAVKFVRW3ZHWO7B5J557W42O64DDZNPJP7VDS';
const USDC_ID = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const BLNT_USDC_COMET_ID =
  'CDQMIKIHKA5UY3FQJ2UDTLNX3GOPD3GPNZWSPTOBVOHEUMQJQXOPC7Y3';
// The production Comet pool weights BLNT:USDC at 80:20.
const BLNT_TO_USDC_WEIGHT_RATIO = 4;
const COMET_SNAPSHOT_MAX_ATTEMPTS = 3;
const POOLS = [
  {
    id: 'CACSQWCMKG45TUHCQ3LXHOB7YEEJH4W376ZHQPXH2IZ3TE4NJHFZMCY7',
    name: 'Fixed Pool V3',
  },
  {
    id: 'CAUTPSQDAJEUV5XEU3EXFVYRGDJLEJGVTFJCFZCSPTDCREAMZ573VF4D',
    name: 'YieldBlent Pool',
  },
];
const RPC_URL = 'https://soroban-rpc.creit.tech/';
const SECONDS_PER_YEAR = 31_536_000;
const SCALAR_7 = 10_000_000n;
const SCALAR_12 = 1_000_000_000_000n;
const PROTOCOL_INTEREST_FEE_RATE = 20_000n;
const MIN_OPERATIONAL_B_RATE = SCALAR_12 / 10n;
const UTIL_95_PERCENT = 9_500_000n;
const UTIL_5_PERCENT = 500_000n;

const stellarRpc = new stellarSdk.rpc.Server(RPC_URL);
const simulationAccount = stellarSdk.StrKey.encodeEd25519PublicKey(
  Buffer.alloc(32)
);
const symbolCache = new Map();

const mulFloor = (x, y, denominator) => (x * y) / denominator;
const mulCeil = (x, y, denominator) => {
  const product = x * y;
  return product / denominator + (product % denominator > 0n ? 1n : 0n);
};
const divCeil = (x, y, scalar) => mulCeil(x, scalar, y);
const toFloat = (value, decimals) => Number(value) / 10 ** decimals;

const callContract = async (contractId, method, args = []) => {
  const account = new stellarSdk.Account(simulationAccount, '0');
  const transaction = new stellarSdk.TransactionBuilder(account, {
    fee: stellarSdk.BASE_FEE,
    networkPassphrase: stellarSdk.Networks.PUBLIC,
  })
    .addOperation(new stellarSdk.Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const simulation = await stellarRpc.simulateTransaction(transaction);

  if (
    stellarSdk.rpc.Api.isSimulationError(simulation) ||
    !simulation.result?.retval
  ) {
    throw new Error(
      `Unable to simulate ${method} on ${contractId}: ${
        simulation.error ?? 'unknown error'
      }`
    );
  }
  return {
    value: stellarSdk.scValToNative(simulation.result.retval),
    ledger: simulation.latestLedger,
  };
};

const getBlntPriceInUsdc = async () => {
  let blntReserve;
  let usdcReserve;
  let lastLedgers;
  for (let attempt = 0; attempt < COMET_SNAPSHOT_MAX_ATTEMPTS; attempt++) {
    // Keep this pair concurrent so both values can come from one ledger.
    const [blntResult, usdcResult] = await Promise.all([
      callContract(BLNT_USDC_COMET_ID, 'get_balance', [
        new stellarSdk.Address(BLNT_ID).toScVal(),
      ]),
      callContract(BLNT_USDC_COMET_ID, 'get_balance', [
        new stellarSdk.Address(USDC_ID).toScVal(),
      ]),
    ]);
    if (blntResult.ledger === usdcResult.ledger) {
      blntReserve = blntResult.value;
      usdcReserve = usdcResult.value;
      break;
    }
    lastLedgers = [blntResult.ledger, usdcResult.ledger];
  }
  if (blntReserve === undefined || usdcReserve === undefined) {
    throw new Error(
      `Unable to read BLNT:USDC Comet reserves from one ledger after ${COMET_SNAPSHOT_MAX_ATTEMPTS} attempts (last ledgers: ${
        lastLedgers?.join(', ') ?? 'unknown'
      })`
    );
  }
  if (blntReserve <= 0n || usdcReserve <= 0n) {
    throw new Error('Canonical BLNT:USDC Comet pool has no reserves');
  }
  const price =
    (Number(usdcReserve) * BLNT_TO_USDC_WEIGHT_RATIO) / Number(blntReserve);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(
      'Unable to derive BLNT price from the BLNT:USDC Comet pool'
    );
  }
  return price;
};

const getTokenSymbol = (assetId) => {
  if (!symbolCache.has(assetId)) {
    const request = callContract(assetId, 'symbol')
      .then(({ value }) => (value === 'native' ? 'XLM' : value))
      .catch((error) => {
        symbolCache.delete(assetId);
        throw error;
      });
    symbolCache.set(assetId, request);
  }
  return symbolCache.get(assetId);
};

const getPoolAuthorized = async (assetId, poolId) => {
  try {
    const { value } = await callContract(assetId, 'authorized', [
      new stellarSdk.Address(poolId).toScVal(),
    ]);
    return Boolean(value);
  } catch {
    // Non-SAC SEP-41 tokens do not expose the `authorized` extension.
    return undefined;
  }
};

const totalSupply = (reserve) =>
  mulFloor(reserve.data.b_supply, reserve.data.b_rate, SCALAR_12);
const totalLiabilities = (reserve) =>
  mulCeil(reserve.data.d_supply, reserve.data.d_rate, SCALAR_12);

const getUtilization = (supply, liabilities) => {
  if (liabilities === 0n) return 0n;
  if (liabilities >= supply) return SCALAR_7;
  return divCeil(liabilities, supply, SCALAR_7);
};

// Mirrors Blend Reserve.setRates, including its fixed-point rounding.
const getRates = (reserve, backstopTakeRate) => {
  const supply = totalSupply(reserve);
  const liabilities = totalLiabilities(reserve);
  const utilization = getUtilization(supply, liabilities);
  const config = reserve.config;
  const targetUtil = BigInt(config.util);
  const interestRateModifier = BigInt(reserve.data.ir_mod);
  let borrowRate;

  if (utilization <= targetUtil) {
    const utilScalar =
      targetUtil === 0n ? 0n : divCeil(utilization, targetUtil, SCALAR_7);
    const baseRate =
      mulCeil(utilScalar, BigInt(config.r_one), SCALAR_7) +
      BigInt(config.r_base);
    borrowRate = mulCeil(baseRate, interestRateModifier, SCALAR_7);
  } else if (utilization <= UTIL_95_PERCENT) {
    const utilScalar = divCeil(
      utilization - targetUtil,
      UTIL_95_PERCENT - targetUtil,
      SCALAR_7
    );
    const baseRate =
      mulCeil(utilScalar, BigInt(config.r_two), SCALAR_7) +
      BigInt(config.r_one) +
      BigInt(config.r_base);
    borrowRate = mulCeil(baseRate, interestRateModifier, SCALAR_7);
  } else {
    const utilScalar = divCeil(
      utilization - UTIL_95_PERCENT,
      UTIL_5_PERCENT,
      SCALAR_7
    );
    const extraRate = mulCeil(
      utilScalar,
      BigInt(config.r_three),
      SCALAR_7
    );
    const intersection = mulCeil(
      interestRateModifier,
      BigInt(config.r_two) + BigInt(config.r_one) + BigInt(config.r_base),
      SCALAR_7
    );
    borrowRate = extraRate + intersection;
  }

  // The protocol fee comes off first; the backstop takes its share of the rest.
  const supplierShare = mulFloor(
    SCALAR_7 - PROTOCOL_INTEREST_FEE_RATE,
    SCALAR_7 - BigInt(backstopTakeRate),
    SCALAR_7
  );
  const supplyCapture = mulFloor(
    supplierShare,
    utilization,
    SCALAR_7
  );
  const supplyRate = mulFloor(borrowRate, supplyCapture, SCALAR_7);
  const borrowApr = toFloat(borrowRate, 7);
  const supplyApr = toFloat(supplyRate, 7);
  return {
    borrowApy: (1 + borrowApr / 365) ** 365 - 1,
    supplyApy: (1 + supplyApr / 52) ** 52 - 1,
  };
};

const getEmissionsApr = (
  emissions,
  supply,
  decimals,
  blntPrice,
  assetPrice
) => {
  if (!emissions) return undefined;
  if (Number(emissions.expiration) <= Math.floor(Date.now() / 1000)) return 0;
  const supplyFloat = toFloat(supply, decimals);
  if (supplyFloat === 0) return 0;
  const emissionsPerYear =
    toFloat(BigInt(emissions.eps), 14) * SECONDS_PER_YEAR;
  return (emissionsPerYear * blntPrice) / supplyFloat / assetPrice;
};

const loadPool = async (poolConfig) => {
  const { value: config } = await callContract(poolConfig.id, 'get_config');
  const { value: reserveList } = await callContract(
    poolConfig.id,
    'get_reserve_list'
  );
  const reserves = [];

  // Keep RPC reads sequential to avoid throttling the public Creit endpoint.
  for (const [index, assetId] of reserveList.entries()) {
    const { value: reserve } = await callContract(poolConfig.id, 'get_reserve', [
      new stellarSdk.Address(assetId).toScVal(),
    ]);
    const { value: borrowEmissions } = await callContract(
      poolConfig.id,
      'get_reserve_emissions',
      [stellarSdk.xdr.ScVal.scvU32(index * 2)]
    );
    const { value: supplyEmissions } = await callContract(
      poolConfig.id,
      'get_reserve_emissions',
      [stellarSdk.xdr.ScVal.scvU32(index * 2 + 1)]
    );
    const symbol = await getTokenSymbol(assetId);
    const poolAuthorized = await getPoolAuthorized(assetId, poolConfig.id);
    reserves.push({
      ...reserve,
      assetId,
      borrowEmissions,
      supplyEmissions,
      symbol,
      poolAuthorized,
    });
  }
  return { id: poolConfig.id, config, reserves };
};

const getPoolApys = (poolConfig, pool, prices, blntPrice) => {
  const results = [];
  for (const reserve of pool.reserves) {
    const price = prices[reserve.assetId.toLowerCase()];
    if (!Number.isFinite(price) || price <= 0) continue;

    const supply = totalSupply(reserve);
    const liabilities = totalLiabilities(reserve);
    const supplyEmissionsApr = getEmissionsApr(
      reserve.supplyEmissions,
      supply,
      reserve.config.decimals,
      blntPrice,
      price
    );
    const borrowEmissionsApr = getEmissionsApr(
      reserve.borrowEmissions,
      liabilities,
      reserve.config.decimals,
      blntPrice,
      price
    );
    const totalSupplyUsd = toFloat(supply, reserve.config.decimals) * price;
    const totalBorrowUsd =
      toFloat(liabilities, reserve.config.decimals) * price;
    const maxUtil =
      reserve.config.max_util === undefined
        ? 1
        : toFloat(BigInt(reserve.config.max_util), 7);
    const availableBorrowUsd = Math.max(
      Math.min(
        totalSupplyUsd - totalBorrowUsd,
        totalSupplyUsd * maxUtil - totalBorrowUsd
      ),
      0
    );
    const rates = getRates(reserve, pool.config.bstop_rate);
    const hasRewards =
      (supplyEmissionsApr ?? 0) > 0 || (borrowEmissionsApr ?? 0) > 0;

    results.push({
      pool: `${pool.id}-${reserve.assetId}-stellar`.toLowerCase(),
      chain: formatChain('stellar'),
      project: 'blnt-v3',
      symbol: reserve.symbol,
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: rates.supplyApy * 100,
      ...(supplyEmissionsApr !== undefined && {
        apyReward: supplyEmissionsApr * 100,
      }),
      underlyingTokens: [reserve.assetId],
      token: null,
      rewardTokens: hasRewards ? [BLNT_ID] : [],
      totalSupplyUsd,
      totalBorrowUsd,
      availableBorrowUsd,
      borrowable: reserve.config.enabled && reserve.config.l_factor > 0,
      frozen:
        pool.config.status >= 4 ||
        !reserve.config.enabled ||
        reserve.data.b_rate < MIN_OPERATIONAL_B_RATE ||
        reserve.poolAuthorized === false,
      apyBaseBorrow: rates.borrowApy * 100,
      ...(borrowEmissionsApr !== undefined && {
        apyRewardBorrow: borrowEmissionsApr * 100,
      }),
      borrowToken: reserve.assetId,
      ltv: toFloat(BigInt(reserve.config.c_factor), 7),
      poolMeta: poolConfig.name,
      url: `https://blnt.trade/dashboard/?poolId=${pool.id}`,
    });
  }
  return results;
};

const apy = async () => {
  const blntPriceInUsdc = await getBlntPriceInUsdc();
  const pools = [];
  for (const poolConfig of POOLS) {
    pools.push(await loadPool(poolConfig));
  }
  const assets = [
    ...new Set(pools.flatMap((pool) => pool.reserves.map(({ assetId }) => assetId))),
  ];
  const { pricesByAddress } = await getPrices(assets, 'stellar');
  const usdcPrice = pricesByAddress[USDC_ID.toLowerCase()];
  if (!Number.isFinite(usdcPrice) || usdcPrice <= 0) {
    throw new Error(
      'Unable to load the USDC price used to value BLNT emissions'
    );
  }
  const blntPrice = blntPriceInUsdc * usdcPrice;
  return pools.flatMap((pool, index) =>
    getPoolApys(POOLS[index], pool, pricesByAddress, blntPrice)
  );
};

module.exports = {
  protocolId: '9451',
  apy,
};
