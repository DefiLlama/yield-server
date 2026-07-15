// DeFiLlama yield adapter for the Tristero AUSD margin-lending vault.
//
// The vault is not an ERC-4626 share vault. Its on-chain accounting exposes
// getTVOL(asset) for TVL and assets(tokenId).ratePerSecond for the configured
// lender rate. APY is derived from that explicit contract rate; TVOL is never
// used as a yield proxy.
//
// This deliberately lists only the Ethereum AUSD deployment. The Arbitrum and
// Base deployments use USDC and should be added separately once their lender
// yield treatment is confirmed.

const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const VAULT = '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00';
const AUSD = '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a';
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const AUSD_ID = BigInt(AUSD).toString();

const getTVOL = async (block) => {
  const result = await sdk.api.abi.call({
    target: VAULT,
    abi: 'function getTVOL(address _token) view returns (uint256)',
    params: [AUSD],
    chain: CHAIN,
    ...(block ? { block } : {}),
  });

  return BigInt(result.output);
};

const getAssetInfo = async () => {
  const result = await sdk.api.abi.call({
    target: VAULT,
    abi: 'function assets(uint256) view returns (uint256 ratePerSecond, uint256 index, uint256 lastUpdate)',
    params: [AUSD_ID],
    chain: CHAIN,
  });

  return result.output;
};

const poolsFunction = async () => {
  const [tvolNow, assetInfo, assetPrice, assetDecimals] = await Promise.all([
    getTVOL(),
    getAssetInfo(),
    utils.getPrices([AUSD], CHAIN),
    sdk.api.abi.call({
      target: AUSD,
      abi: 'erc20:decimals',
      chain: CHAIN,
    }),
  ]);

  const decimals = Number(assetDecimals.output);
  const price = assetPrice.pricesByAddress[AUSD.toLowerCase()] ?? 0;
  const assetsNow = Number(tvolNow) / 10 ** decimals;
  const tvlUsd = assetsNow * price;

  // The contract applies ratePerSecond linearly between index updates. Treat
  // the configured per-second rate as APR, then use DeFiLlama's standard daily
  // compounding conversion to APY.
  const ratePerSecond = Number(assetInfo.ratePerSecond ?? assetInfo[0]);
  const apr = ratePerSecond * SECONDS_PER_YEAR / 1e18 * 100;
  const apyBase = Number.isFinite(apr) && apr >= 0
    ? utils.aprToApy(apr)
    : 0;

  return [{
    pool: `${VAULT}-${CHAIN}`.toLowerCase(),
    chain: utils.formatChain(CHAIN),
    project: 'tristero-margin',
    symbol: 'AUSD',
    tvlUsd,
    apyBase,
    underlyingTokens: [AUSD],
    poolMeta: 'AUSD margin lending vault',
    url: 'https://app.tristero.com',
    token: null,
  }];
};

module.exports = {
  protocolId: '7639',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.tristero.com',
};
