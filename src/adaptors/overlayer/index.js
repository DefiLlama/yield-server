const {
  formatChain,
  getERC4626Info,
  getPrices,
} = require('../utils');

// Overlayer staking vaults (ERC-4626) on Ethereum.
// Deposit T+ / C+ / G+ and receive sT+ / sC+ / sG+. Yield is Aave surplus on the
// wrap backing, minted into more wrap and allocated to the vault share price.
// Protocol page: https://defillama.com/protocol/overlayer (id 9240).

const PROJECT = 'overlayer';
const CHAIN = 'ethereum';
const URL = 'https://app.overlayer.fi';

const VAULTS = [
  {
    symbol: 'sT+',
    vault: '0x001F7096A4521C1945543E458798aF9233140ED7',
    underlying: '0xBfaE8C8500cD35B652373a3Ad5BaA0D604A05a29', // T+
  },
  {
    symbol: 'sC+',
    vault: '0x8aC6AD5D76D07B202832f323888B64286E944A9e',
    underlying: '0xB17EE7D061e076ff1aD6bd2141888CFb39C0Ccdc', // C+
  },
  {
    symbol: 'sG+',
    vault: '0xcda929Ac3016A17151CD63c1Ca210cFc56D85333',
    underlying: '0xD4E1CAF200b29585aADc9AF39c16D57C8c82EbF1', // G+
  },
];

const apy = async () => {
  const { pricesByAddress } = await getPrices(
    VAULTS.map((v) => v.underlying),
    CHAIN
  );

  const infos = await Promise.all(
    VAULTS.map((v) => getERC4626Info(v.vault, CHAIN))
  );

  return VAULTS.map((v, i) => {
    const info = infos[i];
    const price = pricesByAddress[v.underlying.toLowerCase()];
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Missing price for ${v.underlying} on ${CHAIN}`);
    }

    const tvlUsd = (Number(info.tvl) / 1e18) * price;
    if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
      throw new Error(`Invalid tvlUsd for ${v.symbol}: ${tvlUsd}`);
    }

    const apyBase =
      Number.isFinite(info.apyBase) && info.apyBase > 0 ? info.apyBase : 0;

    return {
      pool: `${v.vault}-${CHAIN}`.toLowerCase(),
      chain: formatChain(CHAIN),
      project: PROJECT,
      symbol: v.symbol,
      tvlUsd,
      apyBase,
      pricePerShare: info.pricePerShare,
      underlyingTokens: [v.underlying],
      token: v.vault,
      url: URL,
      poolMeta: 'Staking vault',
    };
  });
};

module.exports = {
  protocolId: '9240',
  timetravel: false,
  apy,
  url: URL,
};
