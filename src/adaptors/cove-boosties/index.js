const utils = require('../utils');

const chains = {
  ethereum: 1,
};

const getApy = async () => {
  const data = await Promise.all(
    Object.entries(chains).map(async (chain) => {
      // Use Cove's API endpoint which has APY data
      const vaults = await utils.getData(
        `https://boosties.cove.finance/api/v1/yearn-vaults?chainId=${chain[1]}`
      );

      return vaults
        .filter((vault) => {
          // Skip retired vaults
          if (vault.info?.isRetired) return false;
          
          // Only include vaults with TVL > 0
          if (!vault.tvl?.tvl || vault.tvl.tvl <= 0) return false;
          
          return true;
        })
        .map((vault) => {
          // Get APY components
          const apyBase = (vault.apr?.netAPR || 0) * 100;
          const apyReward = (vault.apr?.extra?.stakingRewardsAPR || 0) * 100;

          // Determine reward tokens based on whether there are rewards
          const rewardTokens = [];
          if (apyReward > 0) {
            // Add COVE token as reward
            rewardTokens.push('0x32fb7D6E0cBEb9433772689aA4647828Cc7cbBA8');
            
            // If it's a Curve vault with CRV rewards, add CRV
            if (vault.apr?.forwardAPR?.type === 'crv' || vault.apr?.forwardAPR?.type === 'convexcrv') {
              rewardTokens.push('0xD533a949740bb3306d119CC777fa900bA034cd52'); // CRV
            }
            
            // If it has CVX rewards, add CVX
            if (vault.apr?.forwardAPR?.composite?.cvxAPR > 0) {
              rewardTokens.push('0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B'); // CVX
            }
          }

          return {
            pool: `${vault.address}-cove-boosties`,
            chain: utils.formatChain(chain[0]),
            project: 'cove-boosties',
            symbol: utils.formatSymbol(vault.symbol),
            tvlUsd: vault.tvl.tvl,
            apyBase,
            apyReward,
            rewardTokens,
            url: `https://app.cove.finance/boosties`,
            underlyingTokens: [vault.address], // The vault itself is the underlying token
            poolMeta: `${vault.name} - Cove Boosties`,
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