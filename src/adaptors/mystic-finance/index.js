const sdk = require('@defillama/sdk');
const { formatChain, getERC4626Info, getPrices } = require('../utils');

const PROJECT_NAME = 'mystic-finance';
const CHAIN = 'flare';

const VAULTS = [
  {
    address: '0xe8dd6a1e13244a27bdaa19ccbf33013647c675d1',
    underlyingToken: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
    decimals: 6,
    symbol: 'COREUSDT0',
  },
  {
    address: '0x1aeada3c251215f1294720b80fcb3d1d005f3585',
    underlyingToken: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
    decimals: 18,
    symbol: 'COREWFLR',
  },
  {
    address: '0x53184adabf312b490bf1ebcfdc896feff6019a14',
    underlyingToken: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE',
    decimals: 6,
    symbol: 'CSXRP',
  },
];

const apy = async (timestamp) => {
  const vaultInfos = await Promise.all(
    VAULTS.map((vault) =>
      getERC4626Info(vault.address, CHAIN, timestamp)
    )
  );

  // Fetch underlying token prices
  const priceKeys = VAULTS.map(
    (vault) => vault.underlyingToken
  );
  const { pricesByAddress } = await getPrices(priceKeys, CHAIN);

  return VAULTS.map((vault, i) => {
    const { tvl, apyBase } = vaultInfos[i];
    const tokenAmount = tvl / 10 ** vault.decimals;
    const price =
      pricesByAddress[vault.underlyingToken.toLowerCase()] || 0;
    const tvlUsd = tokenAmount * price;

    return {
      pool: `${vault.address}-${CHAIN}`,
      chain: formatChain(CHAIN),
      project: PROJECT_NAME,
      symbol: vault.symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [vault.underlyingToken],
      url: `https://app.mysticfinance.xyz/vault?vaultAddress=${vault.address}&chainId=14`,
    };
  });
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.mysticfinance.xyz',
};
