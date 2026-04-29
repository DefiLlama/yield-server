const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const COMPOUND_FREQUENCY_DAILY = 365;
const GET_REWARDS_ABI =
  'function getRewards() view returns ((address rewardsToken,uint256 rewardsDuration,uint256 periodFinish,uint256 rewardRate,uint256 lastUpdateTime,uint256 rewardPerTokenStored)[])';

const vaults = [
  {
    name: 'PrimeUSD Vault',
    symbol: 'PrimeUSD',
    vault: '0xf4e20b420482f8bed60ddc4836890b3c4ecfd3e5',
    accountant: '0xd0E9563E2e77a3655Fa765c9aFA51d7898DCce1B',
    distributor: '0xde760341e4db7a25785313ca90eeb4c65bdb4672',
    chain: 'berachain',
    decimals: 6,
    underlyingToken: '0x549943e04f40284185054145c6e4e9568c1d3241', // USDC.e
    url: 'https://app.primevaults.finance/vault-details/0xF4e20B420482F8bEd60DDc4836890b3c4eCFD3E5',
  },
  {
    name: 'PrimeETH Vault',
    symbol: 'PrimeETH',
    vault: '0xccee5d9125dcb41156e67c92a92bc0608d720660',
    accountant: '0x71A8166096F86EACa45AD97b9B4F34Bc97FfC47c',
    distributor: '0x96a9c45af704e1a64129ebf624a40074655d38f6',
    chain: 'berachain',
    decimals: 18,
    underlyingToken: '0x2f6f07cdcf3588944bf4c42ac74ff24bf56e7590', // WETH
    url: 'https://app.primevaults.finance/vault-details/0xccee5d9125dcb41156e67c92a92bc0608d720660',
  },
  {
    name: 'PrimeBTC Vault',
    symbol: 'PrimeBTC',
    vault: '0xd57c84f393b01ec01e1f42a9977795b2bca95837',
    accountant: '0x7c6c4554eC10b4BdA09d7a6fa9Be423896942A31',
    distributor: '0x01867f25a7a285de5a19c2a3655ded09609b82a8',
    chain: 'berachain',
    decimals: 8,
    underlyingToken: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', // WBTC
    url: 'https://app.primevaults.finance/vault-details/0xd57c84f393b01ec01e1f42a9977795b2bca95837',
  },
  {
    name: 'PrimeBERA Vault',
    symbol: 'PrimeBERA',
    vault: '0x3af6cbd76fdb0c6315b7748ba11243830565e783',
    accountant: '0x1d7e0B3070d80899bCd61A9c484780F54B1543D6',
    distributor: '0xac1ff4889255e581463fb9854c4e85122653f655',
    chain: 'berachain',
    decimals: 18,
    underlyingToken: '0x6969696969696969696969696969696969696969', // WBERA
    url: 'https://app.primevaults.finance/vault-details/0x3af6cbd76fdb0c6315b7748ba11243830565e783',
  },
];

const getTotalSupply = async (vault) => {
  if (vault.chains) {
    const supplies = await Promise.all(
      vault.chains.map(async (chain) => {
        try {
          const result = await sdk.api.abi.call({
            target: vault.vault,
            abi: 'erc20:totalSupply',
            chain,
          });
          return Number(result.output) / Math.pow(10, vault.decimals);
        } catch (e) {
          return 0;
        }
      })
    );
    return supplies.reduce((sum, s) => sum + s, 0);
  }

  const result = await sdk.api.abi.call({
    target: vault.vault,
    abi: 'erc20:totalSupply',
    chain: vault.chain,
  });
  return Number(result.output) / Math.pow(10, vault.decimals);
};

const getTvl = async (vault, totalSupply, currentRate) => {
  const vaultKey = `${vault.chain}:${vault.vault}`;
  const underlyingKey = `${vault.chain}:${vault.underlyingToken}`;
  const priceRes = await axios.get(
    `https://coins.llama.fi/prices/current/${vaultKey},${underlyingKey}`
  );

  if (priceRes.data.coins[vaultKey]?.price) {
    return totalSupply * priceRes.data.coins[vaultKey].price;
  }
  if (priceRes.data.coins[underlyingKey]?.price) {
    const rate = currentRate / Math.pow(10, vault.decimals);
    return totalSupply * rate * priceRes.data.coins[underlyingKey].price;
  }
  return 0;
};

const getRate = async (accountant, chain, block) => {
  try {
    const result = await sdk.api.abi.call({
      target: accountant,
      abi: 'function getRate() view returns (uint256)',
      chain,
      block: block || undefined,
    });
    return Number(result.output);
  } catch (e) {
    return null;
  }
};

const getDistributorRewards = async (distributor, chain) => {
  const result = await sdk.api.abi.call({
    target: distributor,
    abi: GET_REWARDS_ABI,
    chain,
  });
  return result.output || [];
};

const getTokenDecimals = async (chain, tokens) => {
  if (!tokens.length) return {};

  const decimalsRes = await sdk.api.abi.multiCall({
    chain,
    abi: 'erc20:decimals',
    calls: tokens.map((target) => ({ target })),
  });

  return Object.fromEntries(
    decimalsRes.output.map((item) => [
      item.input.target.toLowerCase(),
      Number(item.output),
    ])
  );
};

const getTokenPrices = async (chain, tokens) => {
  if (!tokens.length) return {};

  const ids = tokens.map((token) => `${chain}:${token}`).join(',');
  const priceRes = await axios.get(
    `https://coins.llama.fi/prices/current/${ids}`
  );

  return priceRes.data.coins || {};
};

const parseRewardData = (reward) => {
  if (Array.isArray(reward)) {
    return {
      rewardsToken: reward[0],
      periodFinish: reward[2],
      rewardRate: reward[3],
    };
  }

  return {
    rewardsToken: reward.rewardsToken,
    periodFinish: reward.periodFinish,
    rewardRate: reward.rewardRate,
  };
};

const calculateRewardApr = async (vault, tvlUsd) => {
  if (!tvlUsd || tvlUsd <= 0) {
    return { baseApr: 0, rewardApr: 0, rewardTokens: [] };
  }

  const now = Math.floor(Date.now() / 1000);
  const rewardsRaw = await getDistributorRewards(
    vault.distributor,
    vault.chain
  );

  const rewards = rewardsRaw
    .map(parseRewardData)
    .filter((reward) => reward.rewardsToken && Number(reward.rewardRate) > 0)
    .filter((reward) => Number(reward.periodFinish) > now);

  if (!rewards.length) {
    return { baseApr: 0, rewardApr: 0, rewardTokens: [] };
  }

  const uniqueRewardTokens = [
    ...new Set(rewards.map((r) => r.rewardsToken.toLowerCase())),
  ];
  const [decimalsByToken, pricesByToken] = await Promise.all([
    getTokenDecimals(vault.chain, uniqueRewardTokens),
    getTokenPrices(vault.chain, uniqueRewardTokens),
  ]);

  let baseApr = 0;
  let rewardApr = 0;
  const rewardTokens = [];
  const underlyingToken = vault.underlyingToken.toLowerCase();

  for (const reward of rewards) {
    const token = reward.rewardsToken.toLowerCase();
    const decimals = decimalsByToken[token];
    const price = pricesByToken[`${vault.chain}:${token}`]?.price;

    if (!Number.isFinite(decimals) || !Number.isFinite(price) || price <= 0)
      continue;

    const annualTokenRewards =
      (Number(reward.rewardRate) / Math.pow(10, decimals)) * SECONDS_PER_YEAR;
    const annualRewardsUsd = annualTokenRewards * price;
    const apr = (annualRewardsUsd / tvlUsd) * 100;

    if (!Number.isFinite(apr) || apr <= 0) continue;

    if (token === underlyingToken) {
      baseApr += apr;
      continue;
    }

    rewardApr += apr;
    rewardTokens.push(token);
  }

  return {
    baseApr,
    rewardApr,
    rewardTokens: [...new Set(rewardTokens)],
  };
};

const apy = async () => {
  const pools = [];

  for (const vault of vaults) {
    try {
      const currentRate = await getRate(vault.accountant, vault.chain, null);
      if (!currentRate) continue;

      const totalSupply = await getTotalSupply(vault);
      const tvlUsd = await getTvl(vault, totalSupply, currentRate);
      const { baseApr, rewardApr, rewardTokens } = await calculateRewardApr(
        vault,
        tvlUsd
      );
      const apyBase = utils.aprToApy(baseApr, COMPOUND_FREQUENCY_DAILY);
      const apyReward = utils.aprToApy(rewardApr, COMPOUND_FREQUENCY_DAILY);

      pools.push({
        pool: `${vault.vault}-${vault.chain}`.toLowerCase(),
        chain: utils.formatChain(vault.chain),
        project: 'prime-vaults',
        symbol: vault.symbol,
        tvlUsd,
        apyBase,
        apyReward,
        rewardTokens,
        ...(Number(currentRate) / 10 ** (vault.decimals ?? 18) > 0 && {
          pricePerShare:
            Number(currentRate) / 10 ** (vault.decimals ?? 18),
        }),
        underlyingTokens: [vault.underlyingToken],
        url: vault.url,
      });
    } catch (e) {
      console.error(`Error processing ${vault.name}:`, e.message);
    }
  }

  return addMerklRewardApy(pools.filter(utils.keepFinite), 'prime-vaults', (p) => p.pool.split('-')[0]);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://primevaults.finance/',
};
