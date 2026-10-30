const {
  formatChain,
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

// BEEP reward vaults (Berachain) - these are Beefy vaults on Berachain
const BEEP_REWARD_VAULTS = 'https://beep.berachain.com/v1/reward-vaults';
const BEEP_CLIENT_ID = 'defillama.yield-server';
const VAULT_PAGE_SIZE = 300;

const retiredStatuses = ['eol', 'paused'];

const isRetiredVault = (vault) =>
  retiredStatuses.includes(vault?.status?.toLowerCase());

// Berachain chain ID: 80094
const networkMapping = {
  1: 'ethereum',
  10: 'optimism',
  25: 'cronos',
  56: 'bsc',
  100: 'gnosis',
  122: 'fuse',
  128: 'heco',
  137: 'polygon',
  169: 'manta',
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
  80094: 'berachain',  // Berachain mainnet
  8453: 'base',
  34443: 'mode',
  42161: 'arbitrum',
  42220: 'celo',
  42262: 'oasis',
  43114: 'avalanche',
  59144: 'linea',
  1313161554: 'aurora',
  1666600000: 'harmony',
  146: 'sonic',
  143: 'monad',
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

// Fetch BEEP reward vaults for Berachain
const getBeepVaults = async () => {
  const vaults = [];
  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({
      page: String(page),
      perPage: String(VAULT_PAGE_SIZE),
      orderBy: 'apr',
      orderDirection: 'desc',
      status: 'whitelisted',
    });
    const response = await getData(`${BEEP_REWARD_VAULTS}?${params}`, null, {
      'X-Client-Id': BEEP_CLIENT_ID,
    });
    const items = response.items || [];
    vaults.push(...items);
    if (items.length === 0 || vaults.length >= response.total) break;
  }
  return vaults;
};

const utils = require('../utils');
const sdk = require('@defillama/sdk');

const SECONDS_PER_YEAR = 31557600;

const ADDRESSES = {
  WBERA: '0x6969696969696969696969696969696969696969',
  LBGT: '0xBaadCC2962417C01Af99fb2B7C75706B9bd6Babe',
  BERA: '0x6969696969696969696969696969696969696969',
};

const callContract = async (target, abi, params = []) => {
  return sdk.api.abi.call({
    target,
    abi,
    params,
    chain: 'berachain',
  }).then(res => res.output);
};

const getTokenPrice = async (tokenAddress) => {
  const key = String(tokenAddress).toLowerCase();
  const data = await utils.getPrices([tokenAddress], 'berachain');
  return data.pricesByAddress[key] || 0;
};

const main = async () => {
  const [apys, tvlsByChain, vaults, govVaults, tokens, vaultStatus] =
    await Promise.all([
      getData(urlApy),
      getData(urlTvl),
      getData(urlVaults),
      getData(urlGovVaults),
      getData(urlAddressbook),
      getData(urlVaultsStatus),
    ]);

  // BEEP data is supplemental: failures must not interrupt Beefy's core pools.
  const [beepVaultsResult, lbgtPriceResult, beraPriceResult] =
    await Promise.allSettled([
      getBeepVaults(),
      getTokenPrice(ADDRESSES.LBGT),
      getTokenPrice(ADDRESSES.BERA),
    ]);
  const beepVaults =
    beepVaultsResult.status === 'fulfilled' ? beepVaultsResult.value : [];
  const lbgtPrice =
    lbgtPriceResult.status === 'fulfilled' ? lbgtPriceResult.value : 0;
  const beraPrice =
    beraPriceResult.status === 'fulfilled' ? beraPriceResult.value : 0;

  [beepVaultsResult, lbgtPriceResult, beraPriceResult].forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Beefy BEEP supplemental data request failed:', result.reason);
    }
  });

  const data = [];
  for (const [chainId, tvls] of Object.entries(tvlsByChain)) {
    const llamaChain = networkMapping[chainId];
    if (!llamaChain) {
      continue;
    }

    for (const [vaultId, tvl] of Object.entries(tvls)) {
      const s = vaultStatus.find(
        (i) => i.id.toLowerCase() === vaultId.toLowerCase()
      );

      let vault = vaults.find((v) => v.id === vaultId);
      if (vault === undefined) {
        vault = govVaults.find((v) => v.id === vaultId);
      }

      if (isRetiredVault(s) || isRetiredVault(vault)) continue;

      if (vault === undefined) {
        continue;
      }

      if (tvl === undefined || tvl === null) {
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
        symbol: tokenSymbols.join('-'),
        tvlUsd: tvl,
        apy: apy * 100,
        poolMeta,
        underlyingTokens,
        url: `https://app.beefy.com/vault/${vaultId}`,
      });
    }
  }

  // Add BEEP reward vaults (Berachain) - these are Beefy vaults
  for (const vault of beepVaults) {
    if (!vault.isWhitelisted) continue;

    // Calculate BGT APR. Beep returns apr as a fraction (1 = 100%).
    let bgtApr = 0;
    if (vault.apr) {
      bgtApr = parseFloat(vault.apr) * 100;
    }

    // Skip vaults if prices are unavailable rather than publishing unconverted BGT APR.
    if (!beraPrice || !lbgtPrice) continue;

    // Convert BGT APR to LBGT APR since rewards are paid in LBGT.
    const lbgtApr = bgtApr * (lbgtPrice / beraPrice);

    // Try to resolve ERC-4626 asset for vault-type staking tokens
    let underlying = vault.stakingToken.address;
    try {
      const asset = await callContract(vault.stakingToken.address, 'address:asset');
      if (asset && asset !== '0x0000000000000000000000000000000000000000') {
        underlying = asset;
      }
    } catch {}

    data.push({
      pool: `${vault.address}-berachain`,
      chain: 'berachain',
      project: 'beefy',
      symbol: vault.stakingToken.symbol,
      tvlUsd: parseFloat(vault.tvl || 0),
      apy: lbgtApr,
      apyReward: lbgtApr,
      rewardTokens: [ADDRESSES.LBGT],
      underlyingTokens: [underlying],
      url: 'https://www.berapaw.com/vaults',
    });
  }

  return removeDuplicates(data);
};

module.exports = {
  protocolId: '326',
  timetravel: false,
  apy: main,
};