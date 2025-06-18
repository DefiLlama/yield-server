const utils = require('../utils');

const chains = {
  ethereum: 1,
};

const getApy = async () => {
  const data = await Promise.all(
    Object.entries(chains).map(async (chain) => {
      // Use the Cove-specific endpoint
      const data = await utils.getData(
        `https://ydaemon.yearn.fi/vaults/cove`
      );

      return data
        .filter((vault) => {
          // Skip retired or hidden vaults
          if (vault.details?.isRetired || vault.details?.isHidden) return false;
          
          // Only include vaults with TVL > 0
          if (!vault.tvl?.tvl || vault.tvl.tvl <= 0) return false;
          
          return true;
        })
        .map((p) => {
          const underlying = p.token.underlyingTokensAddresses || [];

          // Get APY components
          const apyReward = p.apr?.extra?.stakingRewardsAPR || 0;
          const forwardAPR = p.apr?.forwardAPR?.netAPR;
          const apyBase = (forwardAPR ?? p.apr?.netAPR ?? 0) * 100;

          // For Cove gauges, the reward tokens are typically COVE tokens
          const rewardTokens = apyReward > 0 ? ['0x32fb7D6E0cBEb9433772689aA4647828Cc7cbBA8'] : [];

          return {
            pool: `${p.address}-cove-boosties`,
            chain: utils.formatChain(chain[0]),
            project: 'cove-boosties',
            symbol: utils.formatSymbol(p.token.display_symbol || p.token.symbol),
            tvlUsd: p.tvl.tvl,
            apyBase,
            apyReward,
            rewardTokens,
            url: `https://app.cove.finance/boosties`,
            underlyingTokens: underlying.length === 0 ? [p.token.address] : underlying,
            poolMeta: p.name || 'Cove Rewards Gauge',
          };
        });
    })
  );

  return data
    .flat()
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};