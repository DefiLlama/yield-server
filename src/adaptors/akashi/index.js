const axios = require('axios');
const utils = require('../utils');

// Akashi vaults: USDC vaults split into a Senior and a Junior tranche (each its own SPL share
// token). Senior is paid first and gives up part of its yield as a premium; Junior takes losses
// first and earns that premium on top of its own share of the vault's yield.
//
// The endpoint is built by Akashi's backend from the vault program's own accounts and events:
//   tvl_usd           = the tranche's booked value on the vault account (USDC)
//   apy_pct           = expected rate today: the venues' rates blended by what each leg holds,
//                       split by the on-chain premium curve at today's coverage, net of fees
//   apy_inception_pct = share-price growth since the vault's activation, annualised; null until
//                       the vault is 7 days old
// An API is needed because Solana has no historical state reads (share-price change over time
// can't be computed from one snapshot) and the venues' rates are off-chain inputs.
const API = 'https://api.akashi.finance/api/curate/chain/yields';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const apy = async () => {
  const { data } = await axios.get(API);
  return data.pools
    .filter((p) => p.share_mint && p.apy_basis === 'live' && p.apy_pct !== null)
    .map((p) => ({
      pool: `${p.share_mint}-solana`,
      chain: utils.formatChain('solana'),
      project: 'akashi',
      symbol: 'USDC',
      poolMeta: p.tranche === 'Senior' ? `${p.name} · Senior` : `${p.name} · Junior · first-loss`,
      tvlUsd: p.tvl_usd,
      apyBase: p.apy_pct,
      ...(p.apy_inception_pct !== null && { apyBaseInception: p.apy_inception_pct }),
      underlyingTokens: [USDC],
      token: p.share_mint,
      url: `https://akashi.finance/vaults/${p.vault}`,
    }))
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '9156',
  timetravel: false,
  apy,
  url: 'https://akashi.finance/vaults',
};
