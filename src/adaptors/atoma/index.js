const sdk = require('@defillama/sdk');
const utils = require('../utils');
const ethers = require('ethers');

const USDC_ARBITRUM = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const DAY = 24 * 3600;
const APY_WINDOW_DAYS = 30;

const VAULTS = [
  {
    symbol: 'USDC',
    address: '0xCC56410e1a136aF0eCEb7241c6aE394F4d8b581c',
    network: 'arbitrum',
    underlyingToken: USDC_ARBITRUM,
    underlyingTokenDecimals: 6,
    inceptionTs: 1777982400,
    poolMeta: 'Extended x Nado',
  },
  {
    symbol: 'USDC',
    address: '0x1C788E14d8e5B446e3F71B5142e2edaBcAB36da1',
    network: 'arbitrum',
    underlyingToken: USDC_ARBITRUM,
    underlyingTokenDecimals: 6,
    inceptionTs: 1783720800,
    poolMeta: 'Lighter x Trade[XYZ]',
  },
];

const convertToAssets = (vault, shareUnit, block) =>
  sdk.api.abi
    .call({
      target: vault.address,
      abi: 'function convertToAssets(uint256 shares) view returns (uint256)',
      params: [shareUnit],
      chain: vault.network,
      block,
    })
    .then((r) => Number(r.output));

const getVaultData = async (timestamp, vault) => {
  const startTs = Math.max(timestamp - APY_WINDOW_DAYS * DAY, vault.inceptionTs);
  const periodDays = (timestamp - startTs) / DAY;
  if (periodDays <= 0) return null;

  const [blockNow, blockStart] = await utils.getBlocksByTime(
    [timestamp, startTs],
    vault.network
  );

  const [{ output: tvl }, { output: shareDecimals }] = await Promise.all([
    sdk.api.abi.call({
      target: vault.address,
      abi: 'uint:totalAssets',
      chain: vault.network,
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: vault.address,
      abi: 'erc20:decimals',
      chain: vault.network,
    }),
  ]);

  const shareUnit = (10n ** BigInt(shareDecimals)).toString();
  const [assetsNow, assetsStart] = await Promise.all([
    convertToAssets(vault, shareUnit, blockNow),
    convertToAssets(vault, shareUnit, blockStart),
  ]);

  const apyBase = (assetsNow / assetsStart - 1) * (365 / periodDays) * 100;

  return {
    pool: vault.address,
    chain: vault.network,
    project: 'atoma',
    symbol: vault.symbol,
    underlyingTokens: [vault.underlyingToken],
    tvlUsd: parseFloat(ethers.utils.formatUnits(tvl, vault.underlyingTokenDecimals)),
    apyBase,
    pricePerShare: assetsNow / 10 ** vault.underlyingTokenDecimals,
    poolMeta: vault.poolMeta,
    url: 'https://app.atoma.fi/',
  };
};

const apy = async (timestamp = Math.floor(Date.now() / 1e3)) => {
  const pools = await Promise.all(VAULTS.map((vault) => getVaultData(timestamp, vault)));
  return pools.filter(Boolean);
};

module.exports = {
  protocolId: '8300',
  timetravel: false,
  apy,
  url: 'https://app.atoma.fi/',
};
