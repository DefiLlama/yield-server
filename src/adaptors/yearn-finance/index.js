const sdk = require('@defillama/sdk');
const utils = require('../utils');

const chains = {
  ethereum: 1,
  fantom: 250,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  katana: 747474,
};

// For Velodrome/Aerodrome LP vaults where the API doesn't provide underlying tokens,
// fetch token0/token1 from the LP contract on-chain
const getLpUnderlying = async (lpAddress, chain) => {
  try {
    const [t0, t1] = await Promise.all([
      sdk.api.abi.call({ target: lpAddress, abi: 'address:token0', chain }),
      sdk.api.abi.call({ target: lpAddress, abi: 'address:token1', chain }),
    ]);
    return [t0.output.toLowerCase(), t1.output.toLowerCase()];
  } catch {
    return undefined;
  }
};

const getApy = async () => {
  const data = await Promise.all(
    Object.entries(chains).map(async (chain) => {
      const data = await utils.getData(
        `https://ydaemon.yearn.fi/${chain[1]}/vaults/all`
      );

      return Promise.all(
        data.map(async (p) => {
          if (p.details.isRetired || p.details.isHidden) return {};

          let underlying = p.token.underlyingTokensAddresses;

          // If API provides no underlying, try to resolve from the deposit token
          if (underlying.length === 0 && p.token.address) {
            // Try LP token0/token1 first (for Velodrome/Aerodrome LP vaults)
            const lpTokens = await getLpUnderlying(p.token.address, chain[0]);
            underlying = lpTokens || [p.token.address.toLowerCase()];
          }

          // OP incentives via yvToken staking
          const apyReward = p.apr?.extra?.stakingRewardsAPR * 100 ?? 0;

          const forwardAPR = p.apr.forwardAPR?.netAPR;
          const apyBase = (forwardAPR ?? p.apr.netAPR) * 100;

          return {
            pool: p.address,
            chain: utils.formatChain(chain[0]),
            project: 'yearn-finance',
            symbol: utils.formatSymbol(p.token.display_symbol),
            tvlUsd: p.tvl.tvl,
            apyBase,
            apyReward,
            rewardTokens:
              apyReward > 0 ? ['0x4200000000000000000000000000000000000042'] : [],
            url: `https://yearn.fi/${
                p.version.substring(0, 1) == '3' ? 'v3' : 'vaults'
              }/${chains[chain[0]]}/${p.address}`,
            underlyingTokens: underlying,
          };
        })
      );
    })
  );

  return (
    data
      .flat()
      .filter((p) => utils.keepFinite(p))
      // old usdc vault
      .filter((p) => p.pool !== '0x5f18C75AbDAe578b483E5F43f12a39cF75b973a9')
  );
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
