const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const CHAIN = 'hyperliquid';
const PROJECT = 'purrlend';
const POOL_ADDRESS = '0xb61218d3efE306f7579eE50D1a606d56bc222048';

const reserveDataAbi =
  'function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))';

const RAY = 1e27;

const apy = async () => {
  const reservesList = (
    await sdk.api.abi.call({
      target: POOL_ADDRESS,
      chain: CHAIN,
      abi: 'function getReservesList() view returns (address[])',
    })
  ).output;

  const [reserveData, symbols, decimals, aTokenSupply, debtTokenSupply] =
    await Promise.all([
      sdk.api.abi.multiCall({
        calls: reservesList.map((asset) => ({
          target: POOL_ADDRESS,
          params: [asset],
        })),
        chain: CHAIN,
        abi: reserveDataAbi,
      }),
      sdk.api.abi.multiCall({
        calls: reservesList.map((asset) => ({ target: asset })),
        chain: CHAIN,
        abi: 'erc20:symbol',
      }),
      sdk.api.abi.multiCall({
        calls: reservesList.map((asset) => ({ target: asset })),
        chain: CHAIN,
        abi: 'erc20:decimals',
      }),
      // totalSupply of aToken = total deposits
      sdk.api.abi.multiCall({
        calls: reservesList.map((_, i) => ({ target: null })), // placeholder, filled below
        chain: CHAIN,
        abi: 'erc20:totalSupply',
      }).catch(() => null),
      // totalSupply of variableDebtToken = total borrows
      sdk.api.abi.multiCall({
        calls: reservesList.map((_, i) => ({ target: null })),
        chain: CHAIN,
        abi: 'erc20:totalSupply',
      }).catch(() => null),
    ]);

  // Get aToken and debtToken addresses, then query their supplies
  const aTokenAddresses = reserveData.output.map((r) => r.output.aTokenAddress);
  const debtTokenAddresses = reserveData.output.map(
    (r) => r.output.variableDebtTokenAddress
  );

  const [aSupplies, debtSupplies] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: aTokenAddresses.map((a) => ({ target: a })),
      chain: CHAIN,
      abi: 'erc20:totalSupply',
    }),
    sdk.api.abi.multiCall({
      calls: debtTokenAddresses.map((a) => ({ target: a })),
      chain: CHAIN,
      abi: 'erc20:totalSupply',
    }),
  ]);

  const coins = reservesList.map((a) => `${CHAIN}:${a}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  const pools = [];
  for (let i = 0; i < reservesList.length; i++) {
    const asset = reservesList[i];
    const data = reserveData.output[i].output;
    const symbol = symbols.output[i].output;
    const dec = Number(decimals.output[i].output);
    const price = prices[asset.toLowerCase()];
    if (!price) continue;

    const totalSupply = Number(aSupplies.output[i].output) / 10 ** dec;
    const totalBorrow = Number(debtSupplies.output[i].output) / 10 ** dec;
    const tvlUsd = (totalSupply - totalBorrow) * price;
    const totalSupplyUsd = totalSupply * price;
    const totalBorrowUsd = totalBorrow * price;

    const apyBase = (Number(data.currentLiquidityRate) / RAY) * 100;
    const apyBaseBorrow = (Number(data.currentVariableBorrowRate) / RAY) * 100;

    pools.push({
      pool: `${data.aTokenAddress}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: utils.formatSymbol(symbol),
      tvlUsd,
      apyBase,
      apyBaseBorrow,
      totalSupplyUsd,
      totalBorrowUsd,
      underlyingTokens: [asset],
      url: 'https://app.purrlend.io/',
    });
  }

  return addMerklRewardApy(
    pools.filter((p) => utils.keepFinite(p)),
    'purrlend',
    (p) => p.pool.split('-')[0]
  );
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.purrlend.io/',
};
