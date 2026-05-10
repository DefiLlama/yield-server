const { formatChain, getERC4626Info, getPrices, getData } = require('../utils');

const PROJECT_NAME = 'mystic-finance-lending';
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
  // Fetch underlying token prices
  const priceKeys = VAULTS.map(
    (vault) => vault.underlyingToken
  );

  const [vaultInfoResults, { pricesByAddress }] = await Promise.all([
    Promise.allSettled(
      VAULTS.map((vault) => getERC4626Info(vault.address, CHAIN, timestamp))
    ),
    getPrices(priceKeys, CHAIN),
  ]);

  // Fetch campaignApr
  let vaultsApiData = [];
  try {
    const apiData = await getData('https://api.mysticfinance.xyz/morphoCache/lite?chainId=14');
    if (apiData && apiData.vaults) {
      vaultsApiData = apiData.vaults;
    }
  } catch{}

  return VAULTS.flatMap((vault, i) => {
    const result = vaultInfoResults[i];
    if (result.status !== 'fulfilled') return [];
    const { tvl, apyBase, pricePerShare } = result.value;
    const tokenAmount = Number(tvl) / 10 ** vault.decimals;
    const price =
      pricesByAddress[vault.underlyingToken.toLowerCase()] || 0;
    const tvlUsd = tokenAmount * price;

    const apiVault = vaultsApiData.find(
      (v) => v.vaultAddress.toLowerCase() === vault.address.toLowerCase()
    );
    const apyReward = apiVault?.campaignApr ?? null;
    const vaultApr = apiVault?.vaultApr ?? null;

    const poolData = {
      pool: `${vault.address}-${CHAIN}`,
      chain: formatChain(CHAIN),
      project: PROJECT_NAME,
      symbol: vault.symbol,
      tvlUsd,
      apyBase,
      pricePerShare,
      underlyingTokens: [vault.underlyingToken],
      url: `https://app.mysticfinance.xyz/vault?vaultAddress=${vault.address}&chainId=14`,
    };

    if (apyReward !== null) {
      poolData.apyReward = apyReward;
      poolData.rewardTokens = ['0x12e605bc104e93B45e1aD99F9e555f659051c2BB'];
    }

    return [poolData];
  });
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.mysticfinance.xyz',
};
