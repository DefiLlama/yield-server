const { formatChain, getERC4626Info, getPrices } = require('../utils');

const PROJECT = 'sapien-vault';

// Sapien PoQ Vault — single-sided SAPIEN staking on Base (ERC-4626).
// SAPIEN streams into the vault from an on-chain YieldController
// (0x55Ce7717Bc8c8F1b59AdB9e0CE7abc332391BF18, keeper-driven drip capped at
// min(rate cap, 10M SAPIEN/yr); slashed validator collateral also
// redistributes into the vault). Rewards accrue into the vSAPIEN share
// price with no claim step, so 24h share-price growth via convertToAssets
// is the realized net yield.
const VAULT = '0x60Bf63729f688287a450299962b36Cef0aFfaa42';
const SAPIEN = '0xc729777d0470f30612b1564fd96e8dd26f5814e3';
const CHAIN = 'base';
const URL = 'https://vault.sapien.io';

const apy = async (timestamp) => {
  const { tvl, apyBase, pricePerShare } = await getERC4626Info(
    VAULT,
    CHAIN,
    timestamp
  );
  const { pricesByAddress } = await getPrices([`${CHAIN}:${SAPIEN}`]);
  const price = pricesByAddress[SAPIEN.toLowerCase()];

  return [
    {
      pool: `${VAULT}-${CHAIN}`.toLowerCase(),
      chain: formatChain(CHAIN),
      project: PROJECT,
      symbol: 'SAPIEN',
      tvlUsd: (Number(tvl) / 1e18) * price,
      apyBase,
      pricePerShare,
      underlyingTokens: [SAPIEN],
      url: URL,
    },
  ];
};

module.exports = {
  protocolId: '8465',
  // getPrices returns current prices only, so historical runs would misprice TVL.
  timetravel: false,
  apy,
  url: URL,
};
