// FWB yield adapter for DefiLlama (DefiLlama/yield-server).
//
// Protocol: fixed rate for a fixed term (30, 90, 180 or 360 days).
// There is no ERC-20 receipt token — a deposit lives in the vault's internal
// accounting, so the pool id is built from the vault address and the asset address.
//
// Where the data comes from (all on-chain reads, no external APIs):
//   getSupportedTokens()                accepted assets
//   activePrincipalByToken(token)       principal of active deposits
//   getTokenUsdValue18(token, amount)   USD value, 18 decimals
//   currentAprBps(token, term)          rate in basis points
//
// APY is reported for the 360-day term and poolMeta says so: there is no single
// rate for a pool, the term is chosen by the depositor. Same approach as other
// fixed-maturity markets.

const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'fwb';
const SITE = 'https://finwb.xyz';

// The term whose rate we report.
const TERM_DAYS = 360;

const VAULTS = {
  ethereum: '0x1Ef96B8fad9aE983E60610C4ba13536606B5c477',
  bsc: '0x18A021d1c89Af87AaeD266B2C58dD16855Ad3702',
  polygon: '0xd17127796D46c1588550Df783FCfE3D08ef8F6c0',
  arbitrum: '0xF5d84413f2cd33d6d473BA9D0c665a73472d8fC7',
  base: '0x199180dfbACEE5c204Db4E803A92a9D3A9Db4d1F',
};

const abi = {
  getSupportedTokens: 'function getSupportedTokens() view returns (address[])',
  activePrincipalByToken: 'function activePrincipalByToken(address) view returns (uint256)',
  getTokenUsdValue18: 'function getTokenUsdValue18(address token, uint256 amount) view returns (uint256)',
  currentAprBps: 'function currentAprBps(address, uint32) view returns (uint16)',
};

const WAD = 1e18;
const BPS = 100; // basis points -> percent

// The on-chain symbol USD₮0 uses ₮ (U+20AE), not a latin T. Normalise it so the
// symbol stays readable and searchable.
function normaliseSymbol(symbol) {
  return String(symbol).replace(/₮/g, 'T');
}

async function poolsForChain(chain) {
  const target = VAULTS[chain];

  const tokens = (
    await sdk.api.abi.call({ target, chain, abi: abi.getSupportedTokens })
  ).output;

  if (!tokens || tokens.length === 0) return [];

  const [principals, symbols, decimals, aprs] = await Promise.all([
    sdk.api.abi.multiCall({
      chain,
      abi: abi.activePrincipalByToken,
      calls: tokens.map((token) => ({ target, params: [token] })),
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:symbol',
      calls: tokens.map((token) => ({ target: token })),
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: tokens.map((token) => ({ target: token })),
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: abi.currentAprBps,
      calls: tokens.map((token) => ({ target, params: [token, TERM_DAYS] })),
    }),
  ]);

  // The vault values assets in USD itself, through its own price oracle.
  const values = await sdk.api.abi.multiCall({
    chain,
    abi: abi.getTokenUsdValue18,
    calls: tokens.map((token, i) => ({
      target,
      params: [token, principals.output[i].output],
    })),
  });

  return tokens.map((token, i) => {
    const tvlUsd = Number(values.output[i].output) / WAD;
    const apyBase = Number(aprs.output[i].output) / BPS;

    return {
      pool: `${target}-${token}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: normaliseSymbol(symbols.output[i].output),
      tvlUsd,
      apyBase,
      underlyingTokens: [token],
      // No receipt token: the position is tracked in the vault's internal accounting.
      token: null,
      poolMeta: `Fixed term ${TERM_DAYS}d`,
      // The deposit page. Chain, asset and term are picked in the UI after the
      // wallet is connected, so there is no per-pool URL to link to.
      url: `${SITE}/cabinet`,
    };
  }).filter((pool) => Number.isFinite(pool.tvlUsd) && Number.isFinite(pool.apyBase));
}

const apy = async () => {
  const chains = Object.keys(VAULTS);
  const results = await Promise.all(chains.map((chain) => poolsForChain(chain)));
  return results.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: SITE,
  // The protocol id must be an inline literal: the yield-server test reads this
  // file as text and cannot resolve a constant.
  protocolId: '8069',
};
