// DeFiLlama yield adapter for Tristero Margin-Lending Vaults.
//
// The vault is not an ERC-4626 share vault. Its on-chain accounting exposes
// getTVOL(asset) for TVL and assets(tokenId).ratePerSecond for the configured
// lender rate. APY is derived from that explicit contract rate; TVOL is never
// used as a yield proxy.
//
// Supported deployments:
// - Ethereum Mainnet (AUSD)
// - Base (USDC)
// - Arbitrum (USDC)

const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const CONFIGS = [
  {
    chain: 'ethereum',
    symbol: 'AUSD',
    token: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
    vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
    url: 'https://app.tristero.com/vaults',
  },
  {
    chain: 'base',
    symbol: 'USDC',
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
    url: 'https://app.tristero.com/vaults?chain=base',
  },
  {
    chain: 'arbitrum',
    symbol: 'USDC',
    token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
    url: 'https://app.tristero.com/vaults?chain=arbitrum',
  },
];

const getPoolData = async (config) => {
  const { chain, symbol, token, vault, url } = config;
  const tokenId = BigInt(token).toString();

  const [tvolRes, assetInfoRes, assetPriceRes, decimalsRes, pricePerShareRes] = await Promise.all([
    sdk.api.abi.call({
      target: vault,
      abi: 'function getTVOL(address _token) view returns (uint256)',
      params: [token],
      chain,
    }),
    sdk.api.abi.call({
      target: vault,
      abi: 'function assets(uint256) view returns (uint256 ratePerSecond, uint256 index, uint256 lastUpdate)',
      params: [tokenId],
      chain,
    }),
    utils.getPrices([token], chain),
    sdk.api.abi.call({
      target: token,
      abi: 'erc20:decimals',
      chain,
    }),
    sdk.api.abi.call({
      target: vault,
      abi: 'function readValue(address _token, uint256 shares) view returns (uint256)',
      params: [token, '1000000000000000000'],
      chain,
    }),
  ]);

  const decimals = Number(decimalsRes.output);
  const price = assetPriceRes.pricesByAddress[token.toLowerCase()] ?? 0;
  const assetsNow = Number(tvolRes.output) / 10 ** decimals;
  const tvlUsd = assetsNow * price;

  const ratePerSecond = Number(assetInfoRes.output.ratePerSecond ?? assetInfoRes.output[0]);
  const apr = (ratePerSecond * SECONDS_PER_YEAR / 1e18) * 100;
  const apyBase = Number.isFinite(apr) && apr >= 0 ? utils.aprToApy(apr) : 0;
  const pricePerShare = Number(pricePerShareRes.output) / 1e18;

  return {
    pool: `${vault}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: 'tristero-margin',
    symbol,
    tvlUsd,
    apyBase,
    pricePerShare,
    underlyingTokens: [token],
    url,
    token: null,
  };
};

const poolsFunction = async () => {
  return await Promise.all(CONFIGS.map(getPoolData));
};

module.exports = {
  protocolId: '7639',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.tristero.com',
};

