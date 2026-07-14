const sdk = require('@defillama/sdk');
const utils = require('../utils');

/**
 * HypeZion Finance — Yield Adapter for DefiLlama
 *
 * Exposes the shzUSD staking pool (ERC-4626):
 *   - Users stake hzUSD → receive shzUSD shares
 *   - Yield from Kinetiq + Valantis sources is concentrated to shzUSD stakers
 *   - APY calculated on-chain via 14-day rolling window
 *
 * All data fetched via single on-chain call to getProtocolYield().
 */

// HypeZionExchangeInformation proxy (Hyperliquid Mainnet)
const EXCHANGE_INFO = '0x9286ABAC7c29e8A183155E961a4E4BBA2E162c7A';

// StakedHzUSD (shzUSD) vault
const STAKED_HZUSD = '0xce01a9B9bc08f0847fb745044330Eff1181360Cd';

// hzUSD token
const HZUSD = '0x6E2ade6FFc94d24A81406285c179227dfBFc97CE';

const CHAIN = 'hyperliquid';

const abis = {
  getProtocolYield:
    'function getProtocolYield() view returns (tuple(uint256 stabilityPoolAPY, uint256 totalStakedHzUSD, uint256 stakedTVLInUSD))',
};

const poolsFunction = async () => {
  const yieldData = (
    await sdk.api.abi.call({
      target: EXCHANGE_INFO,
      abi: abis.getProtocolYield,
      chain: CHAIN,
    })
  ).output;

  const stabilityPoolAPY = Number(yieldData.stabilityPoolAPY);
  const stakedTVLInUSD = Number(yieldData.stakedTVLInUSD) / 1e18;

  // Convert basis points to percentage (10000 bps = 100%)
  const apyBase = stabilityPoolAPY / 100;

  const pools = [
    {
      pool: `${STAKED_HZUSD}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'hypezion-finance',
      symbol: utils.formatSymbol('shzUSD'),
      tvlUsd: stakedTVLInUSD,
      apyBase,
      underlyingTokens: [HZUSD],
      url: 'https://app.hypezion.com/earn',
    },
  ];

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.hypezion.com',
};
