const axios = require('axios');
const utils = require('../utils');

const MARGINFI_URL = 'https://app.marginfi.com';
const BANK_METADATA_URL =
  'https://storage.googleapis.com/mrgn-public/mrgn-bank-metadata-cache.json';
const RPC_URL = 'https://api.mainnet-beta.solana.com';

// Bank account field offsets, derived from the marginfi-v2 IDL (0.1.7,
// bytemuck / repr(C) layout with explicit padding). Offsets include the
// 8-byte anchor account discriminator.
const OFFSET = {
  mint: 8,
  mintDecimals: 40,
  assetShareValue: 80,
  liabilityShareValue: 96,
  totalLiabilityShares: 256,
  totalAssetShares: 272,
  assetWeightInit: 296,
  optimalUtilizationRate: 368,
  plateauInterestRate: 384,
  maxInterestRate: 400,
  insuranceFeeFixedApr: 416,
  insuranceIrFee: 432,
  protocolFixedFeeApr: 448,
  protocolIrFee: 464,
  operationalState: 608,
  cacheLendingRate: 1380,
  cacheBorrowingRate: 1384,
};

const OPERATIONAL = 1;
const U32_MAX = 4294967295;
// BankCache rates are u32-scaled APRs where u32::MAX represents 1000%
const CACHE_RATE_SCALE = 10;
const HOURS_PER_YEAR = 365.25 * 24;
// Highest offset read is cacheBorrowingRate (u32)
const MIN_BANK_DATA_SIZE = OFFSET.cacheBorrowingRate + 4;
const RPC_TIMEOUT_MS = 30000;
const RPC_RETRIES = 3;

// I80F48 fixed point: 16 bytes little-endian, two's complement, 48 fraction bits
const readI80F48 = (buf, offset) => {
  let value = 0n;
  for (let i = 15; i >= 0; i--) {
    value = (value << 8n) | BigInt(buf[offset + i]);
  }
  if (value >= 1n << 127n) value -= 1n << 128n;
  return Number(value) / 2 ** 48;
};

const aprToApy = (apr) => (1 + apr / HOURS_PER_YEAR) ** HOURS_PER_YEAR - 1;

// Interest curve fallback for banks whose on-chain rate cache is empty
const computeRates = (bank, utilization) => {
  const {
    optimalUtilizationRate,
    plateauInterestRate,
    maxInterestRate,
    insuranceFeeFixedApr,
    insuranceIrFee,
    protocolFixedFeeApr,
    protocolIrFee,
  } = bank;

  // Banks migrated to the newer points-based curve have these zeroed;
  // their rates come from the on-chain cache instead
  if (optimalUtilizationRate <= 0 || optimalUtilizationRate >= 1) {
    return { lendingApr: 0, borrowingApr: 0 };
  }

  const baseRate =
    utilization <= optimalUtilizationRate
      ? (utilization / optimalUtilizationRate) * plateauInterestRate
      : plateauInterestRate +
        ((utilization - optimalUtilizationRate) /
          (1 - optimalUtilizationRate)) *
          (maxInterestRate - plateauInterestRate);

  const lendingApr = baseRate * utilization;
  const borrowingApr =
    baseRate * (1 + insuranceIrFee + protocolIrFee) +
    insuranceFeeFixedApr +
    protocolFixedFeeApr;

  return { lendingApr, borrowingApr };
};

const decodeBank = (data, bankAddress) => {
  const buf = Buffer.from(data, 'base64');
  if (buf.length < MIN_BANK_DATA_SIZE) {
    throw new Error(
      `Bank ${bankAddress}: account data too short (${buf.length} < ${MIN_BANK_DATA_SIZE} bytes)`
    );
  }
  return {
    mint: buf.subarray(OFFSET.mint, OFFSET.mint + 32),
    mintDecimals: buf.readUInt8(OFFSET.mintDecimals),
    assetShareValue: readI80F48(buf, OFFSET.assetShareValue),
    liabilityShareValue: readI80F48(buf, OFFSET.liabilityShareValue),
    totalAssetShares: readI80F48(buf, OFFSET.totalAssetShares),
    totalLiabilityShares: readI80F48(buf, OFFSET.totalLiabilityShares),
    assetWeightInit: readI80F48(buf, OFFSET.assetWeightInit),
    optimalUtilizationRate: readI80F48(buf, OFFSET.optimalUtilizationRate),
    plateauInterestRate: readI80F48(buf, OFFSET.plateauInterestRate),
    maxInterestRate: readI80F48(buf, OFFSET.maxInterestRate),
    insuranceFeeFixedApr: readI80F48(buf, OFFSET.insuranceFeeFixedApr),
    insuranceIrFee: readI80F48(buf, OFFSET.insuranceIrFee),
    protocolFixedFeeApr: readI80F48(buf, OFFSET.protocolFixedFeeApr),
    protocolIrFee: readI80F48(buf, OFFSET.protocolIrFee),
    operationalState: buf.readUInt8(OFFSET.operationalState),
    cacheLendingRate:
      (buf.readUInt32LE(OFFSET.cacheLendingRate) / U32_MAX) * CACHE_RATE_SCALE,
    cacheBorrowingRate:
      (buf.readUInt32LE(OFFSET.cacheBorrowingRate) / U32_MAX) *
      CACHE_RATE_SCALE,
  };
};

// Public RPC throttles; retry transient failures with backoff
const rpcRequest = async (body) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await axios.post(RPC_URL, body, {
        timeout: RPC_TIMEOUT_MS,
      });
      if (response.data.error) {
        throw new Error(`RPC error: ${response.data.error.message}`);
      }
      return response.data.result;
    } catch (err) {
      const status = err.response?.status;
      const transient =
        status === 429 || status >= 500 || err.code === 'ECONNABORTED';
      if (!transient || attempt >= RPC_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
};

const getBankAccounts = async (addresses) => {
  const accounts = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const batch = addresses.slice(i, i + 100);
    const result = await rpcRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'getMultipleAccounts',
      params: [batch, { encoding: 'base64' }],
    });
    accounts.push(...result.value);
  }
  return accounts;
};

const main = async () => {
  const bankMetadata = (await axios.get(BANK_METADATA_URL)).data;

  const accounts = await getBankAccounts(
    bankMetadata.map((b) => b.bankAddress)
  );

  const banks = bankMetadata.flatMap((meta, i) => {
    const account = accounts[i];
    if (!account?.data?.[0]) return [];
    try {
      const bank = decodeBank(account.data[0], meta.bankAddress);
      return bank.operationalState === OPERATIONAL ? [{ meta, bank }] : [];
    } catch (err) {
      // Skip undecodable accounts (e.g. stale metadata entries) rather
      // than failing the whole run
      console.error(`marginfi-lending: ${err.message}`);
      return [];
    }
  });

  // coins.llama.fi keys are case-sensitive for Solana mints
  const priceKeys = banks.map(({ meta }) => `solana:${meta.tokenAddress}`);
  const prices = {};
  for (let i = 0; i < priceKeys.length; i += 50) {
    const { coins } = await utils.getPriceApiData(
      `/prices/current/${priceKeys.slice(i, i + 50).join(',')}`
    );
    Object.assign(prices, coins);
  }

  const pools = banks.flatMap(({ meta, bank }) => {
    const price = prices[`solana:${meta.tokenAddress}`]?.price;
    // No price -> no meaningful TVL; skip instead of emitting $0 pools
    if (price == null) return [];
    const scale = 10 ** bank.mintDecimals;

    const totalAssets = (bank.totalAssetShares * bank.assetShareValue) / scale;
    const totalBorrows =
      (bank.totalLiabilityShares * bank.liabilityShareValue) / scale;
    const utilization = totalAssets > 0 ? totalBorrows / totalAssets : 0;

    // Prefer the program's own cached spot rates; fall back to the
    // interest curve for banks whose cache has not been touched yet
    let lendingApr = bank.cacheLendingRate;
    let borrowingApr = bank.cacheBorrowingRate;
    if (lendingApr === 0 && borrowingApr === 0) {
      ({ lendingApr, borrowingApr } = computeRates(bank, utilization));
    }

    const totalSupplyUsd = totalAssets * price;
    const totalBorrowUsd = totalBorrows * price;

    return {
      pool: meta.bankAddress,
      chain: utils.formatChain('solana'),
      project: 'marginfi-lending',
      symbol: meta.tokenSymbol,
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: aprToApy(lendingApr) * 100,
      apyBaseBorrow: aprToApy(borrowingApr) * 100,
      totalSupplyUsd,
      totalBorrowUsd,
      ltv: bank.assetWeightInit,
      underlyingTokens: [meta.tokenAddress],
    };
  });

  return pools.filter((pool) => utils.keepFinite(pool));
};

module.exports = {
  protocolId: '2570',
  timetravel: false,
  apy: main,
  url: MARGINFI_URL,
};
