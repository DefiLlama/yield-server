const sdk = require('@defillama/sdk');
const axios = require('axios');

// Time constants
const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;

// Contract addresses
const MAGMA_ADDRESS = '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081';
const STAKING_PRECOMPILE = '0x0000000000000000000000000000000000001000';

// ABI for contract functions
const MAGMA_ABI = {
  coreVault: 'address:coreVault',
  gVault: 'address:gVault',
  getValidators: 'uint64[]:getValidators',
  getDelegator:
    'function getDelegator(uint64 validatorId, address delegator) returns (uint256 stake, uint256 accRewardPerToken, uint256 unclaimedRewards, uint256 deltaStake, uint256 nextDeltaStake, uint64 deltaEpoch, uint64 nextDeltaEpoch)',
  totalAssets: 'function totalAssets() external view returns (uint256)',
  totalSupply: 'erc20:totalSupply',
  symbol: 'erc20:symbol',
};

const apy = async () => {
  // Get current timestamp
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - SECONDS_PER_DAY;

  // Fetch block numbers for current and 1 day ago
  const [blockNow, block1dayAgo] = await Promise.all([
    axios
      .get(`https://coins.llama.fi/block/monad/${now}`)
      .then((r) => r.data.height),
    axios
      .get(`https://coins.llama.fi/block/monad/${timestamp1dayAgo}`)
      .then((r) => r.data.height),
  ]);

  if (!blockNow || !block1dayAgo) {
    throw new Error('RPC issue: Failed to fetch block numbers');
  }

  // Get vault addresses from Magma contract
  const [coreVaultAddress, gVaultAddress] = await Promise.all([
    sdk.api.abi.call({
      target: MAGMA_ADDRESS,
      abi: MAGMA_ABI.coreVault,
      chain: 'monad',
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: MAGMA_ADDRESS,
      abi: MAGMA_ABI.gVault,
      chain: 'monad',
      block: blockNow,
    }),
  ]);

  const coreVault = coreVaultAddress.output;
  const gVault = gVaultAddress.output;

  // Fetch current totalAssets, totalSupply, and symbol for Magma protocol
  const [totalAssetsNow, totalSupplyNow, symbol] = await Promise.all([
    sdk.api.abi.call({
      target: MAGMA_ADDRESS,
      abi: MAGMA_ABI.totalAssets,
      chain: 'monad',
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: MAGMA_ADDRESS,
      abi: MAGMA_ABI.totalSupply,
      chain: 'monad',
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: MAGMA_ADDRESS,
      abi: MAGMA_ABI.symbol,
      chain: 'monad',
    }),
  ]);

  // Fetch 1 day ago totalAssets and totalSupply
  const [totalAssets1dayAgo, totalSupply1dayAgo] = await Promise.all([
    sdk.api.abi.call({
      target: MAGMA_ADDRESS,
      abi: MAGMA_ABI.totalAssets,
      chain: 'monad',
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: MAGMA_ADDRESS,
      abi: MAGMA_ABI.totalSupply,
      chain: 'monad',
      block: block1dayAgo,
    }),
  ]);

  if (
    !totalAssetsNow.output ||
    !totalSupplyNow.output ||
    !totalAssets1dayAgo.output ||
    !totalSupply1dayAgo.output
  ) {
    throw new Error('RPC issue: Failed to fetch contract data');
  }

  // Calculate share values (multiply by 1e18 to handle decimals)
  const shareValueNow =
    (BigInt(totalAssetsNow.output) * BigInt(1e18)) /
    BigInt(totalSupplyNow.output);
  const shareValue1dayAgo =
    (BigInt(totalAssets1dayAgo.output) * BigInt(1e18)) /
    BigInt(totalSupply1dayAgo.output);

  if (shareValue1dayAgo === 0n) {
    throw new Error('RPC issue: Previous share value is zero');
  }

  // Calculate proportion: shareValueNow / shareValue1dayAgo
  // Multiply by 1e18 to maintain precision
  const proportion =
    Number((shareValueNow * BigInt(1e18)) / shareValue1dayAgo) / 1e18;

  if (proportion <= 0) {
    throw new Error('RPC issue: Invalid proportion calculated');
  }

  // Calculate APY using the formula:
  // APY = ((1 + ((proportion - 1) / 365)) ** 365 - 1) * 100
  // This is equivalent to: APY = (proportion ** 365 - 1) * 100
  const apyBase = (Math.pow(proportion, DAYS_PER_YEAR) - 1) * 100;

  // Calculate TVL using validator staking info (same as DefiLlama TVL adapter)
  const vaults = [coreVault, gVault];

  // Get validators for each vault
  const validatorResults = await Promise.all(
    vaults.map((vault) =>
      sdk.api.abi.call({
        target: vault,
        abi: MAGMA_ABI.getValidators,
        chain: 'monad',
        block: blockNow,
      })
    )
  );

  // Build validator calls for staking precompile
  const validatorCalls = [];
  validatorResults.forEach((result, vaultIndex) => {
    if (result.output) {
      result.output.forEach((validatorId) => {
        validatorCalls.push({
          target: STAKING_PRECOMPILE,
          params: [validatorId, vaults[vaultIndex]],
        });
      });
    }
  });

  // Get staking info for all validators
  let tvlBigInt = 0n;
  if (validatorCalls.length > 0) {
    const stakingInfoResults = await sdk.api.abi.multiCall({
      calls: validatorCalls,
      abi: MAGMA_ABI.getDelegator,
      chain: 'monad',
      block: blockNow,
    });

    if (stakingInfoResults.output) {
      stakingInfoResults.output.forEach((result) => {
        if (result.output) {
          const { stake, unclaimedRewards, deltaStake, nextDeltaStake } =
            result.output;
          tvlBigInt +=
            BigInt(stake || 0) +
            BigInt(unclaimedRewards || 0) +
            BigInt(deltaStake || 0) +
            BigInt(nextDeltaStake || 0);
        }
      });
    }
  }

  // Convert to number (assuming 18 decimals for MON)
  const tvlMon = Number(tvlBigInt) / 1e18;

  // Get MON native token price to convert to USD
  let tvlUsd;
  try {
    const monPriceResponse = await axios.get(
      'https://coins.llama.fi/prices/current/coingecko:monad'
    );
    const monPrice =
      monPriceResponse.data.coins['coingecko:monad']?.price || 1;
    tvlUsd = tvlMon * monPrice;
  } catch (error) {
    // If price lookup fails, use TVL in MON as-is (assuming 1:1 with USD)
    tvlUsd = tvlMon;
  }

  return [
    {
      pool: MAGMA_ADDRESS.toLowerCase(),
      chain: 'monad',
      project: 'magma-staking',
      symbol: symbol.output || 'gMON',
      tvlUsd: tvlUsd,
      apyBase: apyBase,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'], // MON
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.magmastaking.xyz/',
};

