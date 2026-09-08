const sdk = require('@defillama/sdk');
const { aprToApy, formatChain, getERC4626Info, getPrices } = require('../utils');

const PROJECT = 'sapien-vault';
const CHAIN = 'base';
const VAULT = '0x60Bf63729f688287a450299962b36Cef0aFfaa42';
const SAPIEN = '0xC729777d0470F30612B1564Fd96E8Dd26f5814E3';
const REWARDS_CONTROLLER = '0x55Ce7717Bc8c8F1b59AdB9e0CE7abc332391BF18';
const URL = 'https://vault.sapien.io';
const WAD = 1e18;

// Sapien PoQ Vault — single-sided SAPIEN staking on Base (ERC-4626).
// RewardsController drips SAPIEN into the vault (no claim step) at
// currentRateWad() = min(cap(t), yearlyBudget / TVL), a WAD APR.
// Share-price growth is that drip net of slashed-validator redistribution,
// so we report apyReward from the on-chain rate and leave any residual
// (typically slashing) on apyBase.
const apy = async (timestamp) => {
  const [{ tvl, apyBase: shareApy, pricePerShare }, rateRes, { pricesByAddress }] =
    await Promise.all([
      getERC4626Info(VAULT, CHAIN, timestamp),
      sdk.api.abi.call({
        target: REWARDS_CONTROLLER,
        abi: 'uint256:currentRateWad',
        chain: CHAIN,
      }),
      getPrices([`${CHAIN}:${SAPIEN}`]),
    ]);

  const price = pricesByAddress[SAPIEN.toLowerCase()];
  const apyReward = aprToApy((Number(rateRes.output) / WAD) * 100);
  const apyBase = Math.max(0, shareApy - apyReward);

  return [
    {
      pool: `${VAULT}-${CHAIN}`.toLowerCase(),
      chain: formatChain(CHAIN),
      project: PROJECT,
      symbol: 'SAPIEN',
      tvlUsd: (Number(tvl) / 1e18) * price,
      apyBase,
      apyReward,
      pricePerShare,
      rewardTokens: [SAPIEN],
      underlyingTokens: [SAPIEN],
      url: URL,
    },
  ];
};

module.exports = {
  protocolId: '8465',
  // currentRateWad and getPrices are live-only; historical runs would misprice TVL.
  timetravel: false,
  apy,
  url: URL,
};
