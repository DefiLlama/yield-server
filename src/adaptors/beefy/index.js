const {
  formatChain,
  formatSymbol,
  getData,
  removeDuplicates,
} = require('../utils');

const url = 'https://api.beefy.finance';
const urlApy = `${url}/apy`;
const urlTvl = `${url}/tvl`;
const urlVaults = `${url}/harvestable-vaults`;
const urlGovVaults = `${url}/gov-vaults`;
const urlAddressbook = `${url}/tokens`;

const urlVaultsStatus = `${url}/vaults`;

const networkMapping = {
  1: 'ethereum',
  10: 'optimism',
  25: 'cronos',
  56: 'bsc',
  100: 'gnosis',
  122: 'fuse',
  128: 'heco',
  137: 'polygon',
  250: 'fantom',
  252: 'fraxtal',
  324: 'zksync',
  1088: 'metis',
  1101: 'polygon_zkevm',
  1284: 'moonbeam',
  1285: 'moonriver',
  2222: 'kava',
  5000: 'mantle',
  7700: 'canto',
  8453: 'base',
  34443: 'mode',
  42161: 'arbitrum',
  42220: 'celo',
  42262: 'oasis',
  43114: 'avalanche',
  59144: 'linea',
  1313161554: 'aurora',
  1666600000: 'harmony',
};

const extractePoolMetaDate = (string) => {
  // match DDMMMYY
  const pattern = /(\d{2}[A-Za-z]{3}\d{2})/;
  const match = string.match(pattern);

  if (match) {
    const datePart = match[1];
    const nonDatePart = string.replace(datePart, '').trim();
    return { nonDatePart, datePart };
  } else {
    return { nonDatePart: string, datePart: null };
  }
};

const main = async () => {
  const [apys, tvlsByChain, vaults, govVaults, tokens, vaultStatus] =
    await Promise.all(
      [
        urlApy,
        urlTvl,
        urlVaults,
        urlGovVaults,
        urlAddressbook,
        urlVaultsStatus,
      ].map((u) => getData(u))
    );

  const data = [];
  for (const [chainId, tvls] of Object.entries(tvlsByChain)) {
    const llamaChain = networkMapping[chainId];
    if (!llamaChain) {
      // console.debug(`Skipping chain ${chainId}, not in networkMapping`);
      continue;
    }

    for (const [vaultId, tvl] of Object.entries(tvls)) {
      const s = vaultStatus.find(
        (i) => i.id.toLowerCase() === vaultId.toLowerCase()
      );
      if (s && ['eol', 'paused'].includes(s.status.toLowerCase())) continue;

      let vault = vaults.find((v) => v.id === vaultId);
      if (vault === undefined) {
        vault = govVaults.find((v) => v.id === vaultId);
      }

      if (vault === undefined) {
        // console.debug(`Skipping vault ${vaultId}, no vault data`);
        continue;
      }

      if (tvl === undefined || tvl === null) {
        // console.debug(`Skipping vault ${vaultId}, no TVL data`);
        continue;
      }

      const apy = apys[vaultId] || 0;

      const {
        assets,
        name,
        platformId,
        depositTokenAddresses,
        earnContractAddress,
        chain,
        type,
        tokenAddress,
        oracleId,
      } = vault;

      const tokenSymbols = [];
      const tokenAddresses = [];

      for (const assetId of assets) {
        const token = tokens[chain]?.[assetId];
        if (token) {
          const { address, symbol } = token;
          if (address) {
            tokenAddresses.push(
              address === 'native'
                ? '0x0000000000000000000000000000000000000000'
                : address
            );
          }
          if (symbol) {
            tokenSymbols.push(symbol);
          }
        } else {
          // fallback to assetId if token not found
          tokenSymbols.push(assetId);
        }
      }

      const underlyingTokens =
        tokenAddresses.length === 0 && assets.length === 1
          ? [tokenAddress]
          : type === 'cowcentrated'
          ? depositTokenAddresses
          : tokenAddresses;

      const poolDetails = extractePoolMetaDate(name).datePart;
      let poolMeta = formatChain(platformId);
      poolMeta = poolDetails !== null ? `${poolMeta}-${poolDetails}` : poolMeta;

      data.push({
        pool: `${earnContractAddress}-${llamaChain}`.toLowerCase(),
        chain: formatChain(llamaChain),
        project: 'beefy',
        symbol: formatSymbol(tokenSymbols.join('-')),
        tvlUsd: tvl,
        apy: apy * 100,
        poolMeta,
        underlyingTokens,
        url: `https://app.beefy.com/vault/${oracleId}`,
      });
    }
  }

  return removeDuplicates(data);
};

module.exports = {
  timetravel: false,
  apy: main,
};
