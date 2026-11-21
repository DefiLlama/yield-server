const { ethers } = require('ethers');
const { getBlocksByTime, getPrices } = require('../utils');

const CHAIN = 'arbitrum';
const VAULT_ADDRESS = '0xbF732B50C1003E12B978cC85B36Bd9455BF0e91f';
const ARBITRUM_USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const VAULT_URL = `https://arbiscan.io/address/${VAULT_ADDRESS}`;

const DEPLOYMENT_BLOCK = 525756465;
const SECONDS_PER_DAY = 86_400;
const LOOKBACK_DAYS = 7;
const USDC_DECIMALS = 6;

const TOTAL_ASSETS_ABI = 'totalAssets';
const SHARE_PRICE_ABI = 'currentSharePrice';

const vaultInterface = new ethers.utils.Interface([
  'function totalAssets() view returns (uint256)',
  'function currentSharePrice() view returns (uint256)',
]);

const provider = new ethers.providers.StaticJsonRpcProvider(
  'https://arb1.arbitrum.io/rpc',
  { name: 'arbitrum', chainId: 42161 }
);

async function readVault(method, block) {
  try {
    const data = vaultInterface.encodeFunctionData(method, []);
    const result = await provider.call({ to: VAULT_ADDRESS, data }, block);
    const [value] = vaultInterface.decodeFunctionResult(method, result);
    return Number(value.toString());
  } catch (error) {
    throw new Error(
      `Vault ${method}() failed on Arbitrum at block ${block}: ${error.message}`
    );
  }
}

async function apy() {
  const now = Math.floor(Date.now() / 1000);
  const lookback = now - LOOKBACK_DAYS * SECONDS_PER_DAY;

  const [[lookbackBlock, currentBlock], { pricesByAddress }] =
    await Promise.all([
      getBlocksByTime([lookback, now], CHAIN),
      getPrices([ARBITRUM_USDC], CHAIN),
    ]);

  const usdcPrice = pricesByAddress[ARBITRUM_USDC];
  if (!Number.isFinite(usdcPrice) || usdcPrice <= 0) {
    throw new Error(`Missing or invalid USDC price for ${CHAIN}:${ARBITRUM_USDC}`);
  }

  const previousBlock = Math.max(lookbackBlock, DEPLOYMENT_BLOCK);
  const [startBlock, endBlock, totalAssets, previousSharePrice, currentSharePrice] =
    await Promise.all([
      provider.getBlock(previousBlock),
      provider.getBlock(currentBlock),
      readVault(TOTAL_ASSETS_ABI, currentBlock),
      readVault(SHARE_PRICE_ABI, previousBlock),
      readVault(SHARE_PRICE_ABI, currentBlock),
    ]);

  const elapsedSeconds = endBlock?.timestamp - startBlock?.timestamp;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    throw new Error('The vault has no measurable share-price history');
  }

  if (
    !Number.isFinite(previousSharePrice) ||
    !Number.isFinite(currentSharePrice) ||
    previousSharePrice <= 0 ||
    currentSharePrice <= 0
  ) {
    throw new Error('The vault returned an invalid share price');
  }

  const tvlUsd = (totalAssets / 10 ** USDC_DECIMALS) * usdcPrice;
  const apyBase =
    Math.expm1(
      Math.log(currentSharePrice / previousSharePrice) *
        ((365 * SECONDS_PER_DAY) / elapsedSeconds)
    ) * 100;

  return [
    {
      pool: `${VAULT_ADDRESS}-${CHAIN}`.toLowerCase(),
      chain: 'Arbitrum',
      project: 'goddess-sovereign-vault',
      symbol: 'gUSDC',
      tvlUsd,
      apyBase,
      underlyingTokens: [ARBITRUM_USDC],
      url: VAULT_URL,
      poolMeta: 'ERC-4626 Multi-Pool Strategy (Aave V3 / Curve / Pendle)',
    },
  ];
}

module.exports = {
  timetravel: false,
  apy,
  url: VAULT_URL,
};
