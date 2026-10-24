const sdk = require('@defillama/sdk');
const utils = require('../utils');

// RNT Lend — Reental's Aave V3 fork on Polygon
const chain = 'polygon';
const POOL_DATA_PROVIDER = '0x5542ac41138f6a52a13c644f1db56bada71a4021';
const AAVE_ORACLE = '0x9e313d8cda997dceea20bea444720702958cd0f3';

// Only the stablecoin reserves are listed: anyone can supply them and they are the only borrowable assets.
// The other reserves are Reental property tokens (whitelisted RWA collateral that earns no supply yield).
const STABLES = [
  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT0
  '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC
];

const abi = {
  getReserveTokensAddresses:
    'function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)',
  getReserveData:
    'function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
  getReserveConfigurationData:
    'function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
  getPaused: 'function getPaused(address asset) view returns (bool isPaused)',
  getAssetsPrices:
    'function getAssetsPrices(address[] assets) view returns (uint256[])',
};

const multi = async (abiStr, calls) =>
  (await sdk.api.abi.multiCall({ abi: abiStr, calls, chain })).output.map(
    (o) => o.output
  );

const apy = async () => {
  const withPdp = STABLES.map((a) => ({ target: POOL_DATA_PROVIDER, params: [a] }));

  const [tokens, data, configs, paused, symbols, decimals, prices] = await Promise.all([
    multi(abi.getReserveTokensAddresses, withPdp),
    multi(abi.getReserveData, withPdp),
    multi(abi.getReserveConfigurationData, withPdp),
    multi(abi.getPaused, withPdp),
    multi('erc20:symbol', STABLES.map((target) => ({ target }))),
    multi('erc20:decimals', STABLES.map((target) => ({ target }))),
    // pool's AaveOracle (USD, 8 decimals)
    sdk.api.abi
      .call({ target: AAVE_ORACLE, abi: abi.getAssetsPrices, params: [STABLES], chain })
      .then((r) => r.output),
  ]);
  const liquidity = await multi(
    'erc20:balanceOf',
    STABLES.map((target, i) => ({ target, params: [tokens[i].aTokenAddress] }))
  );

  return STABLES.map((asset, i) => {
    // paused reserves block supply and borrow entirely, so they are skipped like frozen ones
    if (!configs[i].isActive || configs[i].isFrozen || paused[i]) return null;
    const price = Number(prices[i]) / 1e8;
    const scale = 10 ** Number(decimals[i]);
    const tvlUsd = (Number(liquidity[i]) / scale) * price;
    const totalBorrowUsd =
      ((Number(data[i].totalVariableDebt) + Number(data[i].totalStableDebt)) / scale) * price;
    return {
      pool: `${tokens[i].aTokenAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'rnt-lend',
      symbol: utils.formatSymbol(symbols[i]),
      tvlUsd,
      apyBase: Number(data[i].liquidityRate) / 1e25,
      underlyingTokens: [asset],
      totalSupplyUsd: tvlUsd + totalBorrowUsd,
      totalBorrowUsd,
      apyBaseBorrow: Number(data[i].variableBorrowRate) / 1e25,
      ltv: Number(configs[i].ltv) / 1e4,
      borrowable: configs[i].borrowingEnabled,
      url: 'https://app.reental.co',
    };
  }).filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  protocolId: '9188',
  url: 'https://app.reental.co',
};
