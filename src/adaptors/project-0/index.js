const axios = require('axios');
const utils = require('../utils');

// P0 public API (p0-monitor). Override the host via P0_PUBLIC_API_BASE if needed.
const BASE_URL = process.env.P0_PUBLIC_API_BASE || 'https://api.0.xyz';
const METRICS_ENDPOINT = `${BASE_URL}/v0/bankMetrics`;

const getApy = async () => {
  let response;
  try {
    response = await axios.get(METRICS_ENDPOINT, { timeout: 30000 });
  } catch (e) {
    console.error('project-0 adapter: failed to fetch /v0/bankMetrics', e);
    return [];
  }

  if (!response.data || !Array.isArray(response.data.banks)) {
    console.warn('project-0 adapter: unexpected /v0/bankMetrics shape', response.data);
    return [];
  }

  const pools = response.data.banks
    // Skip empty banks: no supplied liquidity, and their supply APY is undefined.
    .filter((bank) => bank.priced && (Number(bank.totalDepositsUsd) || 0) > 0)
    .map((bank) => {
      const mint = bank.mint;
      const totalSupplyUsd = Number(bank.totalDepositsUsd) || 0;
      const totalBorrowUsd = Number(bank.totalBorrowsUsd) || 0;
      // Pool TVL = liquidity not lent out (DefiLlama lending convention).
      // Use the API value only when it's a finite number; otherwise compute it.
      const availableLiquidityUsd =
        bank.availableLiquidityUsd == null ? null : Number(bank.availableLiquidityUsd);
      const liquidityUsd = Number.isFinite(availableLiquidityUsd)
        ? Math.max(availableLiquidityUsd, 0)
        : Math.max(totalSupplyUsd - totalBorrowUsd, 0);

      const borrowLimitUsd =
        bank.borrowLimitUsd == null ? null : Number(bank.borrowLimitUsd);
      const availableBorrowUsd = Number.isFinite(borrowLimitUsd)
        ? Math.max(Math.min(liquidityUsd, borrowLimitUsd - totalBorrowUsd), 0)
        : liquidityUsd;

      // depositApy / borrowApy are decimal fractions; DefiLlama wants percent.
      const apyBase = (Number(bank.depositApy) || 0) * 100;
      const apyBaseBorrow = (Number(bank.borrowApy) || 0) * 100;

      return {
        pool: `project-0-${bank.bank}`,
        chain: 'Solana',
        project: 'project-0',
        symbol: bank.symbol || 'UNKNOWN',
        underlyingTokens: mint ? [mint] : undefined,
        tvlUsd: liquidityUsd,
        url: mint ? `https://app.0.xyz/markets/${mint}` : 'https://app.0.xyz/',
        apyBase,
        apyBaseBorrow,
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd,
        ...(mint && { borrowToken: mint }),
        borrowable: availableBorrowUsd > 0,
      };
    });

  return utils.removeDuplicates(pools);
};

module.exports = {
  protocolId: '7184',
  apy: getApy,
  url: 'https://app.0.xyz/',
};
