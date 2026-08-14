const utils = require('../utils');
const { BigNumber, utils: ethersUtils } = require('ethers');
const SDK = require('@defillama/sdk');

// PayPal Incentives and T-bill Yield

const USDAI = '0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef'; // contract holding PYUSD
const PYUSD_ADDRESS = '0x46850aD61C2B7d64d08c9C754F45254596696984';
const PYUSD_DECIMALS = 6;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

// baseYieldAdminFeeRate and loanRouterAdminFeeRate are both 1000 bps, set as
// internal immutables in the StakedUSDai constructor (no on-chain getter)
const ADMIN_FEE_RATE = 0.1;

// BaseYieldAccrual struct is stored at BASE_YIELD_ACCRUAL_STORAGE_LOCATION:
//   slot +0: accrued (uint256)
//   slot +1: timestamp (uint64)
//   slot +2: rateTiers[].length  (elements at keccak256(slot+2))
// Each RateTier occupies 2 consecutive slots: rate (uint256), threshold (uint256)
const BASE_YIELD_ACCRUAL_STORAGE_LOCATION =
  '0xad76c5b481cb106971e0ae4c23a09cb5b1dc9dba5fad96d9694630df5e853900';

// SDK doesn't expose eth_getStorageAt; access underlying JSON-RPC provider
const getRpcProvider = () => SDK.getProvider('arbitrum').rpcs[0].provider;

const getStorageAt = async (target: string, slot: BigNumber): Promise<BigNumber> => {
  const result = await getRpcProvider().send('eth_getStorageAt', [
    target,
    ethersUtils.hexZeroPad(slot.toHexString(), 32),
    'latest',
  ]);
  return BigNumber.from(result);
};

const getRateTiersFromStorage = async () => {
  // BaseYieldAccrual struct layout: { RateTier[] rateTiers; uint256 accrued; uint64 timestamp; }
  // rateTiers array length is at BASE+0; elements start at keccak256(BASE+0).
  // RateTier struct layout: { uint256 rate; uint256 threshold; }
  const base = BigNumber.from(BASE_YIELD_ACCRUAL_STORAGE_LOCATION);

  const length = await getStorageAt(USDAI, base);
  if (length.isZero()) throw new Error('rateTiers array is empty');

  const arrayDataStart = BigNumber.from(
    ethersUtils.keccak256(ethersUtils.hexZeroPad(base.toHexString(), 32))
  );

  const tiers = await Promise.all(
    Array.from({ length: length.toNumber() }, (_, i) =>
      Promise.all([
        getStorageAt(USDAI, arrayDataStart.add(i * 2)),
        getStorageAt(USDAI, arrayDataStart.add(i * 2 + 1)),
      ]).then(([rate, threshold]) => ({ rate, threshold }))
    )
  );

  return tiers;
};

const getUnderlyingYields = async (): Promise<{ tvlUsd: number; apyBase: number }[]> => {
  const [result, prices, rateTiers] = await Promise.all([
    SDK.api.abi.call({
      abi: 'erc20:balanceOf',
      target: PYUSD_ADDRESS,
      params: [USDAI],
      chain: 'arbitrum',
    }),
    utils.getPrices([PYUSD_ADDRESS], 'arbitrum'),
    getRateTiersFromStorage(),
  ]);

  const price = prices.pricesByAddress[PYUSD_ADDRESS.toLowerCase()] ?? 1;
  const balanceUsd = Number(result.output) * price / 10 ** PYUSD_DECIMALS;

  const pools: { tvlUsd: number; apyBase: number }[] = [];
  let remainingTvl = balanceUsd;

  for (let i = 0; i < rateTiers.length; i++) {
    const capUsd = Number(rateTiers[i].threshold) / 1e18;
    const tvlUsd = Math.min(capUsd, remainingTvl);
    const apyBase = Math.round(Number(rateTiers[i].rate) * SECONDS_PER_YEAR * 100 * 100 / 1e18) / 100;
    pools.push({ tvlUsd, apyBase });
    remainingTvl -= tvlUsd;
  }

  return pools;
};

// Loan Yields

const SUSDAI_ADDRESS = '0x0B2b2B2076d95dda7817e785989fE353fe955ef9';

const TOTAL_SHARES_ABI = {
  inputs: [],
  name: 'totalShares',
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const REDEMPTION_SHARE_PRICE_ABI = {
  inputs: [],
  name: 'redemptionSharePrice',
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

// Loan and escrow interest accrue continuously at a blended per-second rate.
// StakedUSDai's LoanRouterPositionManager tracks one rate per currency in its
// interestAccruals mapping, which already folds in every loan across loan router
// v1, v2. The escrow timelock keeps its own rate for the
// USDai it holds. Reading these rates gives the instantaneous interest the vault
// earns without walking the loan routers.
const STAKED_USDAI_DEPLOY_TIMESTAMP = 1747128556;
const ESCROW_TIMELOCK_DEPLOY_TIMESTAMP = 1782483721;

const ESCROW_TIMELOCK_ADDRESS = '0x1E710CC0b64E1D7572d35E43AD261587789B6438';

// erc7201:stakedUSDai.loans. Loans struct field order:
//   slot +0/+1: currencyTokens (EnumerableSet.AddressSet)
//   slot +2: repaymentBalances
//   slot +3: pendingBalances
//   slot +4: interestAccruals  (mapping(address => Accrual))
//   slot +5: loan
const LOANS_STORAGE_LOCATION =
  '0xeedf9bea8709bd441d5da250df505e80fc82bec74f9f1df28edf19fa1ed4bd00';
const INTEREST_ACCRUALS_FIELD_OFFSET = 4;

// erc7201:escrowTimelock.accrual
const ESCROW_ACCRUAL_STORAGE_LOCATION =
  '0xd0ce944f67547cded3d5848ee065c96cab977ea6922f5f134a261a7de7bf4b00';

// Accrual struct is { uint256 accrued; uint256 rate; uint64 timestamp; }, so the
// per-second rate sits one slot past the struct base. The rate is scaled by 1e18.
const ACCRUAL_RATE_SLOT_OFFSET = 1;
const FIXED_POINT_SCALE = 10n ** 18n;

// Annualize a per-second accrual rate into native token base units.
const annualInterestBaseUnits = (rate: BigNumber): bigint =>
  (BigInt(rate.toString()) * BigInt(SECONDS_PER_YEAR)) / FIXED_POINT_SCALE;

const getLoanAccrualInterestUsd = async (timestamp: number): Promise<number> => {
  let interestUsd = 0;

  // Loan interest: one blended rate per currency on the sUSDai proxy
  if (timestamp >= STAKED_USDAI_DEPLOY_TIMESTAMP) {
    const loansBase = BigNumber.from(LOANS_STORAGE_LOCATION);

    // currencyTokens is an EnumerableSet: _values array length at the base slot,
    // elements packed from keccak256(base)
    const setLength = (await getStorageAt(SUSDAI_ADDRESS, loansBase)).toNumber();
    if (setLength > 0) {
      const valuesStart = BigNumber.from(
        ethersUtils.keccak256(ethersUtils.hexZeroPad(loansBase.toHexString(), 32))
      );
      const accrualsSlot = loansBase.add(INTEREST_ACCRUALS_FIELD_OFFSET);

      const tokenWords = await Promise.all(
        Array.from({ length: setLength }, (_, i) =>
          getStorageAt(SUSDAI_ADDRESS, valuesStart.add(i))
        )
      );
      const tokens = tokenWords.map((word) =>
        ethersUtils.getAddress(
          ethersUtils.hexDataSlice(ethersUtils.hexZeroPad(word.toHexString(), 32), 12)
        )
      );

      // interestAccruals[token] lives at keccak256(abi.encode(token, accrualsSlot))
      const rates = await Promise.all(
        tokens.map((token) => {
          const accrualBase = BigNumber.from(
            ethersUtils.keccak256(
              ethersUtils.defaultAbiCoder.encode(['address', 'uint256'], [token, accrualsSlot])
            )
          );
          return getStorageAt(SUSDAI_ADDRESS, accrualBase.add(ACCRUAL_RATE_SLOT_OFFSET));
        })
      );

      const [decimals, prices] = await Promise.all([
        SDK.api.abi.multiCall({
          abi: 'erc20:decimals',
          calls: tokens.map((token) => ({ target: token })),
          chain: 'arbitrum',
        }),
        utils.getPrices(tokens, 'arbitrum'),
      ]);

      tokens.forEach((token, i) => {
        const annual = annualInterestBaseUnits(rates[i]);
        const tokenDecimals = Number(decimals.output[i].output);
        const price = prices.pricesByAddress[token.toLowerCase()] ?? 1;
        interestUsd += (Number(annual) / 10 ** tokenDecimals) * price;
      });
    }
  }

  // Escrow interest: a single blended rate for the USDai held in escrow
  if (timestamp >= ESCROW_TIMELOCK_DEPLOY_TIMESTAMP) {
    const escrowRate = await getStorageAt(
      ESCROW_TIMELOCK_ADDRESS,
      BigNumber.from(ESCROW_ACCRUAL_STORAGE_LOCATION).add(ACCRUAL_RATE_SLOT_OFFSET)
    );
    const prices = await utils.getPrices([USDAI], 'arbitrum');
    const usdaiPrice = prices.pricesByAddress[USDAI.toLowerCase()] ?? 1;
    // USDai has 18 decimals
    interestUsd += (Number(annualInterestBaseUnits(escrowRate)) / 1e18) * usdaiPrice;
  }

  return interestUsd;
};

// --- Entry point ---

const apy = async (timestamp: number) => {
  try {
    const ts = timestamp || Math.floor(Date.now() / 1000);

    const [fixedPools, loanInterestPerYear, prices, totalSharesResult, pricePerShareResult] =
      await Promise.all([
        getUnderlyingYields(),
        getLoanAccrualInterestUsd(ts),
        utils.getPrices([PYUSD_ADDRESS], 'arbitrum'),
        SDK.api.abi.call({
          abi: TOTAL_SHARES_ABI,
          target: SUSDAI_ADDRESS,
          chain: 'arbitrum',
        }),
        SDK.api.abi.call({
          abi: REDEMPTION_SHARE_PRICE_ABI,
          target: SUSDAI_ADDRESS,
          chain: 'arbitrum',
        }),
      ]);

    const pyusdPrice = prices.pricesByAddress[PYUSD_ADDRESS.toLowerCase()] ?? 1;

    // Price of 1 sUSDai derived on-chain: redemptionSharePrice() returns value scaled to 1e18
    const sUSDaiPrice = Number(pricePerShareResult.output) * pyusdPrice / 1e18;

    // TVL and APY denominator are both the on-chain redemption value
    const redemptionValueUsd = Number(totalSharesResult.output) * sUSDaiPrice / 1e18;

    if (redemptionValueUsd === 0) return [];

    // Total interest earned per year: fixed (T-bill) pools plus loan and escrow accrual
    const fixedInterestPerYear = fixedPools
      .filter((p) => p.tvlUsd > 0)
      .reduce((sum, p) => sum + (p.tvlUsd * p.apyBase) / 100, 0);
    const totalInterestPerYear = fixedInterestPerYear + loanInterestPerYear;
    const netInterestPerYear = totalInterestPerYear * (1 - ADMIN_FEE_RATE);

    // APY to sUSDai holders = interest earned net of admin fees / on-chain redemption value
    const apyBase = Math.round((netInterestPerYear / redemptionValueUsd) * 100 * 100) / 100;

    return [
      {
        pool: SUSDAI_ADDRESS,
        chain: utils.formatChain('arbitrum'),
        project: 'usd-ai',
        symbol: 'sUSDai',
        tvlUsd: redemptionValueUsd,
        apyBase,
        ...(Number(pricePerShareResult.output) / 1e18 > 0 && { pricePerShare: Number(pricePerShareResult.output) / 1e18 }),
        underlyingTokens: [PYUSD_ADDRESS, USDAI],
        poolMeta: '30d unlock',
        url: 'https://app.usd.ai',
        isIntrinsicSource: true,
      },
    ];
  } catch (error) {
    console.error('Error fetching usdai data:', error);
    return [];
  }
};

module.exports = {
  protocolId: '6190',
  timetravel: false,
  apy,
  url: 'https://app.usd.ai',
};
