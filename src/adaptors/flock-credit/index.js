const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'flock-credit';
const CHAIN = 'robinhood';
const URL = 'https://www.ravenhood.xyz/flock-credit';

const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const VEUP_VAULT = '0xd42174d3Db28B0fA2BD25381c3521b18AE9dB490';

const ASSET_DECIMALS = 6;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const asNumber = (value) => Number(String(value));
const toUsd = (value) => asNumber(value) / 10 ** ASSET_DECIMALS;

const apy = async () => {
  const [
    totalAssets,
    totalManagedDebt,
    lockedProfit,
    lastYieldAt,
    yieldVestingPeriod,
  ] = await Promise.all([
    sdk.api2.abi.call({
      target: VEUP_VAULT,
      abi: 'uint256:totalAssets',
      chain: CHAIN,
    }),
    sdk.api2.abi.call({
      target: VEUP_VAULT,
      abi: 'uint256:totalManagedDebt',
      chain: CHAIN,
    }),
    sdk.api2.abi.call({
      target: VEUP_VAULT,
      abi: 'uint256:lockedProfit',
      chain: CHAIN,
    }),
    sdk.api2.abi.call({
      target: VEUP_VAULT,
      abi: 'uint256:lastYieldAt',
      chain: CHAIN,
    }),
    sdk.api2.abi.call({
      target: VEUP_VAULT,
      abi: 'uint256:yieldVestingPeriod',
      chain: CHAIN,
    }),
  ]);

  const tvlUsd = toUsd(totalAssets);
  const debtUsd = toUsd(totalManagedDebt);
  const period = asNumber(yieldVestingPeriod);
  const elapsed = Math.floor(Date.now() / 1000) - asNumber(lastYieldAt);
  const isVesting = period > 0 && elapsed >= 0 && elapsed < period;

  const apyBase =
    isVesting && tvlUsd > 0
      ? ((toUsd(lockedProfit) / period) * SECONDS_PER_YEAR * 100) / tvlUsd
      : 0;

  return [
    {
      pool: `${VEUP_VAULT}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'USDG',
      tvlUsd,
      apyBase,
      totalSupplyUsd: tvlUsd,
      totalBorrowUsd: debtUsd,
      underlyingTokens: [USDG],
      token: VEUP_VAULT,
      poolMeta: 'veUP lending vault',
      url: URL,
    },
  ];
};

module.exports = {
  protocolId: '8644',
  timetravel: false,
  apy,
  url: URL,
};
