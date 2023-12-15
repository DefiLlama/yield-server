const utils = require('../utils');

const networks = {
  1: 'Ethereum',
  137: 'Polygon',
  501404: 'Solana',
  122: 'Fuse',
  250: 'Fantom',
};

const CDP_URL = 'https://api.angle.money/v1/vaultManagers';
const cdpNetworksSupport = {
  1: 'ethereum',
  137: 'polygon',
  42161: 'arbitrum',
  10: 'optimism',
};

let symbol;
const getPoolsData = async () => {
  const apyData = await utils.getData('https://api.angle.money//v1/incentives');

  const result = [];
  for (const staking of Object.keys(apyData)) {
    // the identifier is the voting gauge address and not the address of the staking pool
    if (apyData[staking].deprecated) continue;
    // changing the symbols so they fit the Defillama framework
    symbol = apyData[staking]?.name.replace('/', '-').split(' ');
    // san token symbols
    if (symbol.length == 1) {
      symbol = symbol[0].replace('san', '').split('_')[0];
      // perp token symbols (keep as is)
    } else if (symbol.length == 2) {
      symbol = symbol[0] + ' ' + symbol[1];
      // LP token symbols
    } else {
      symbol = symbol[1] + ' ' + symbol[2];
    }

    const pool = {
      pool: `${apyData[staking]?.address}-angle`, // address of the staking pool
      chain: networks[apyData[staking]?.network] || 'Other',
      project: 'angle',
      symbol: symbol,
      tvlUsd: apyData[staking]?.tvl || 0,
      apyBase:
        apyData[staking]['apr']?.value ||
        apyData[staking]['apr']?.details?.['ANGLE'] ||
        0,
    };
    result.push(pool);
  }

  return result.filter((p) => p.chain !== 'Other');
};

const AGEUR = 'ageur';

const cdpData = async () => {
  const queryChainId = (chainId) => `?chainId=${chainId}`;

  const vaultCall = (
    await Promise.all(
      Object.keys(cdpNetworksSupport).map((id) =>
        utils.getData(`${CDP_URL}${queryChainId(id)}`)
      )
    )
  ).map((pool) => Object.keys(pool).map((key) => pool[key]));
  const result = [];
  const mintedCoinPrice = (await utils.getPrices([`coingecko:${AGEUR}`]))
    .pricesBySymbol[AGEUR.toLowerCase()];

  for (const [index, vault] of vaultCall.entries()) {
    const stableAdress = vault.map((e) => e.stablecoin);
    const collateralAdrees = vault.map((e) => e.collateral);
    const chain = Object.values(cdpNetworksSupport)[index];
    const coins = collateralAdrees.map((address) => `${chain}:${address}`);
    const prices = (
      await utils.getPrices([...coins, `${chain}:${stableAdress[0]}`])
    ).pricesByAddress;

    const _result = vault.map((_vault) => {
      const totalSupplyUsd =
        Number(_vault.totalCollateral) *
        prices[_vault.collateral.toLowerCase()];
      const totalBorrowUsd = Number(_vault.totalDebt) * mintedCoinPrice;

      return {
        pool: `${_vault.address}-${chain}`,
        project: 'angle',
        chain: chain,
        symbol: _vault.symbol.split('-')[0],
        apy: 0,
        tvlUsd: totalSupplyUsd,
        apyBaseBorrow: ((_vault.stabilityFee - 1) / 1) * 100,
        totalSupplyUsd: totalSupplyUsd,
        totalBorrowUsd: totalBorrowUsd,
        ltv: Number(_vault.maxLTV),
        mintedCoin: 'agEUR',
        debtCeilingUsd:
          (Number(_vault.debtCeiling) / 10 ** 18) * mintedCoinPrice,
      };
    });

    result.push(_result);
  }
  return result.flat();
};

const main = async () => {
  const apy = await getPoolsData();
  const cdp = await cdpData();
  return [...apy, ...cdp].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.angle.money/earn',
};
