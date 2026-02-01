const utils = require('../utils');

const VAULT_ADDRESS = '0xd0Ee0CF300DFB598270cd7F4D0c6E0D8F6e13f29';
const USDT0_ADDRESS = '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb';
const CHAIN = 'hyperliquid';

const getRewardsFromMerkl = async () => {
  try {
    const data = await utils.getData(
      'https://api.merkl.xyz/v4/opportunities?mainProtocolId=altura'
    );

    const vault = data.find(
      (d) => d.identifier.toLowerCase() === VAULT_ADDRESS.toLowerCase()
    );

    if (!vault) return { apyReward: 0, rewardTokens: [] };

    const rewardTokens = [
      ...new Set(
        vault.rewardsRecord?.breakdowns
          ?.map((b) => b.token.address)
          .filter(
            (addr) => addr.toLowerCase() !== VAULT_ADDRESS.toLowerCase()
          ) || []
      ),
    ];

    return {
      apyReward: vault.apr || 0,
      rewardTokens,
    };
  } catch (err) {
    console.error('Failed to fetch Merkl rewards for altura:', err.message);
    return { apyReward: 0, rewardTokens: [] };
  }
};

const apy = async (timestamp) => {
  const [vaultInfo, rewards] = await Promise.all([
    utils.getERC4626Info(VAULT_ADDRESS, CHAIN, timestamp, {
      assetUnit: '1000000', // USDT0 has 6 decimals
    }),
    getRewardsFromMerkl(),
  ]);

  return [
    {
      pool: `${VAULT_ADDRESS}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'altura',
      symbol: utils.formatSymbol('USDT0'),
      tvlUsd: vaultInfo.tvl / 1e6,
      apyBase: vaultInfo.apyBase,
      apyReward: rewards.apyReward,
      underlyingTokens: [USDT0_ADDRESS],
      rewardTokens: rewards.rewardTokens.length > 0 ? rewards.rewardTokens : undefined,
      poolMeta: 'Multi-Strategy Stablecoin Vault',
      url: 'https://app.altura.trade',
    },
  ].filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://altura.trade',
};
