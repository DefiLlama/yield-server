const { FixedMath, PoolV3, TokenMetadata } = require('@blnt-protocol/blnt-sdk');
const {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
  scValToNative,
} = require('@stellar/stellar-sdk');
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
const NETWORK = {
  rpc: 'https://soroban-rpc.creit.tech/',
  passphrase: 'Public Global Stellar Network ; September 2015',
};
const SIMULATION_ACCOUNT =
  'GDMVSPSKEUOTRFSJH2SXVUNB2JGORKDTWBMOP5OZJZP4GKRQUQWFJO4Y';

const stellarRpc = new rpc.Server(NETWORK.rpc);
const metadataCache = new Map();

const callContract = async (contractId, method, addressArgs = []) => {
  const account = new Account(SIMULATION_ACCOUNT, '123');
  const operation = new Contract(contractId).call(
    method,
    ...addressArgs.map((address) => new Address(address).toScVal())
  );
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
    timebounds: { minTime: 0, maxTime: 0 },
  })
    .addOperation(operation)
    .build();
  const simulation = await stellarRpc.simulateTransaction(transaction);

  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result?.retval) {
    throw new Error(
      `Unable to simulate ${method} on ${contractId}: ${
        simulation.error ?? 'unknown error'
      }`
    );
  }
  return {
    value: scValToNative(simulation.result.retval),
    ledger: simulation.latestLedger,
  };
};

const getBlntPriceInUsdc = async () => {
  let blntReserve;
  let usdcReserve;
  let lastLedgers;
  for (let attempt = 0; attempt < COMET_SNAPSHOT_MAX_ATTEMPTS; attempt++) {
    const [blntResult, usdcResult] = await Promise.all([
      callContract(BLNT_USDC_COMET_ID, 'get_balance', [BLNT_ID]),
      callContract(BLNT_USDC_COMET_ID, 'get_balance', [USDC_ID]),
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

const getTokenMetadata = (assetId) => {
  if (!metadataCache.has(assetId)) {
    const request = TokenMetadata.load(NETWORK, assetId).catch((error) => {
      metadataCache.delete(assetId);
      throw error;
    });
    metadataCache.set(assetId, request);
  }
  return metadataCache.get(assetId);
};

const getEmissionsApr = (
  emissions,
  supply,
  decimals,
  blntPrice,
  assetPrice
) => {
  if (!emissions) return undefined;
  const emissionsPerAsset = emissions.emissionsPerYearPerToken(
    supply,
    decimals
  );
  return (emissionsPerAsset * blntPrice) / assetPrice;
};

const getPoolApys = async (poolConfig, pool, prices, blntPrice) => {
  const results = [];
  for (const reserve of pool.reserves.values()) {
    const price = prices[reserve.assetId.toLowerCase()];
    if (!Number.isFinite(price) || price <= 0) continue;

    const tokenMetadata = await getTokenMetadata(reserve.assetId);
    const supplyEmissionsApr = getEmissionsApr(
      reserve.supplyEmissions,
      reserve.totalSupply(),
      reserve.config.decimals,
      blntPrice,
      price
    );
    const borrowEmissionsApr = getEmissionsApr(
      reserve.borrowEmissions,
      reserve.totalLiabilities(),
      reserve.config.decimals,
      blntPrice,
      price
    );
    const totalSupplyUsd = reserve.totalSupplyFloat() * price;
    const totalBorrowUsd = reserve.totalLiabilitiesFloat() * price;
    const maxUtil =
      reserve.config.max_util !== undefined
        ? FixedMath.toFloat(BigInt(reserve.config.max_util), 7)
        : 1;
    const availableBorrowUsd = Math.max(
      Math.min(
        totalSupplyUsd - totalBorrowUsd,
        totalSupplyUsd * maxUtil - totalBorrowUsd
      ),
      0
    );
    const hasRewards =
      (supplyEmissionsApr ?? 0) > 0 || (borrowEmissionsApr ?? 0) > 0;

    results.push({
      pool: `${pool.id}-${reserve.assetId}-stellar`.toLowerCase(),
      chain: formatChain('stellar'),
      project: 'blnt-v3',
      symbol: tokenMetadata.symbol,
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: reserve.supplyApr * 100,
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
        pool.metadata.status >= 4 ||
        !reserve.config.enabled ||
        reserve.poolAuthorized === false,
      apyBaseBorrow: reserve.estBorrowApy * 100,
      ...(borrowEmissionsApr !== undefined && {
        apyRewardBorrow: borrowEmissionsApr * 100,
      }),
      borrowToken: reserve.assetId,
      ltv: FixedMath.toFloat(BigInt(reserve.config.c_factor), 7),
      poolMeta: poolConfig.name,
      url: `https://blnt.trade/dashboard/?poolId=${pool.id}`,
    });
  }
  return results;
};

const apy = async () => {
  const [pools, blntPriceInUsdc] = await Promise.all([
    Promise.all(POOLS.map(({ id }) => PoolV3.load(NETWORK, id))),
    getBlntPriceInUsdc(),
  ]);
  const assets = [
    ...new Set(pools.flatMap((pool) => Array.from(pool.reserves.keys()))),
  ];
  const { pricesByAddress } = await getPrices(assets, 'stellar');
  const usdcPrice = pricesByAddress[USDC_ID.toLowerCase()];
  if (!Number.isFinite(usdcPrice) || usdcPrice <= 0) {
    throw new Error(
      'Unable to load the USDC price used to value BLNT emissions'
    );
  }
  const blntPrice = blntPriceInUsdc * usdcPrice;
  const results = await Promise.all(
    pools.map((pool, index) =>
      getPoolApys(POOLS[index], pool, pricesByAddress, blntPrice)
    )
  );
  return results.flat();
};

module.exports = {
  protocolId: '9451',
  apy,
};
