const sdk = require('@defillama/sdk');
const utils = require('../utils');

// JUSD allocates deposited USDC across yield strategies, principally delta-neutral
// funding trades plus lending, issued through two vaults: Accountable on Ethereum
// and Venzo on Arbitrum. The yield is variable, so apyBase is the realized growth
// of each vault's share price (convertToAssets of one share) over the past 7 days.
const VAULTS = [
  {
    chain: 'ethereum',
    vault: '0x2B5895b716311A1eaC8f93fB88C56aF9eC8C1A69',
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    issuer: 'Accountable',
  },
  {
    chain: 'arbitrum',
    vault: '0x9519217E8926A2B39BAcD2d6EC3EfD02503595E2',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    issuer: 'Venzo',
  },
];

const DAY = 24 * 3600;
const WINDOW_DAYS = 7;
const convertToAssets = 'function convertToAssets(uint256) view returns (uint256)';

const pool = async ({ chain, vault, usdc, issuer }) => {
  const now = Math.floor(Date.now() / 1e3);
  const [[blockNow, blockPrior], decimals, supply] = await Promise.all([
    utils.getBlocksByTime([now, now - WINDOW_DAYS * DAY], chain),
    sdk.api.abi.call({ chain, target: vault, abi: 'erc20:decimals' }),
    sdk.api.abi.call({ chain, target: vault, abi: 'erc20:totalSupply' }),
  ]);
  const oneShare = (10n ** BigInt(decimals.output)).toString();
  const [priceNow, pricePrior, assets] = await Promise.all([
    sdk.api.abi.call({ chain, target: vault, abi: convertToAssets, params: [oneShare], block: blockNow }),
    sdk.api.abi.call({ chain, target: vault, abi: convertToAssets, params: [oneShare], block: blockPrior }),
    sdk.api.abi.call({ chain, target: vault, abi: convertToAssets, params: [supply.output] }),
  ]);
  const { pricesByAddress } = await utils.getPrices([usdc], chain);
  const usdcPrice = pricesByAddress[usdc.toLowerCase()] ?? 1;
  const growth = Number(priceNow.output) / Number(pricePrior.output);

  return {
    pool: `${vault}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: 'jusd-finance',
    symbol: 'JUSD',
    token: vault,
    tvlUsd: (Number(assets.output) / 1e6) * usdcPrice,
    apyBase: (growth ** (365 / WINDOW_DAYS) - 1) * 100,
    pricePerShare: Number(priceNow.output) / 1e6,
    underlyingTokens: [usdc],
    poolMeta: `${issuer} vault`,
    url: 'https://jusd.fi',
  };
};

const apy = async () => Promise.all(VAULTS.map(pool));

module.exports = {
  protocolId: '8861',
  timetravel: false,
  apy,
  url: 'https://jusd.fi',
};
