const utils = require('../utils');

const chains = {
  ethereum: 1,
  fantom: 250,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
};

const getApy = async () => {
  const data = await Promise.all(
    Object.entries(chains).map(async (chain) => {
      const data = await utils.getData(
        `https://ydaemon.yearn.fi/${chain[1]}/vaults/all`
      );

      return data.map((p) => {
        if (p.details.isRetired || p.details.isHidden) return {};

        const underlying = p.token.underlyingTokensAddresses;

        // OP incentives via yvToken staking
        const apyReward = p.apr?.extra?.stakingRewardsAPR * 100 ?? 0;

        return {
          pool: p.address,
          chain: utils.formatChain(chain[0]),
          project: 'yearn-finance',
          symbol: utils.formatSymbol(p.token.display_symbol),
          tvlUsd: p.tvl.tvl,
          apyBase: p.apr.netAPR * 100,
          apyReward,
          rewardTokens:
            apyReward > 0 ? ['0x4200000000000000000000000000000000000042'] : [],
          url: `https://yearn.fi/vaults/${chains[chain[0]]}/${p.address}`,
          underlyingTokens:
            underlying.length === 0 ? [p.token.address] : underlying,
        };
      });
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
