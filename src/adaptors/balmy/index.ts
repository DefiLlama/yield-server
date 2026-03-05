const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Balmy's Earn showcases existing yield opportunities and allows users to manage all their yield positions in one place. We've also added the concept of Guardians. These are accounts that 
// have the job of monitoring all transactions in a blockchain and when they predict a hack is about to happen, they can rescue user funds from the underlying protocol. 
// As discussed with the Defi-Llama team, we will only be listing vaults (we call them strategies) that provide an extra yield on top of the underlying protocol. This is so that we don't repeat
// the same pools already on the Defi-Llama yield section. We will be fetching the underlying protocol's APY (using Defi-Llama's yield API) and adding the Balmy yield on top of it.

const API = 'https://api.balmy.xyz';
const LIQ_MINING_MANAGER = '0xE7615B68BFe7664488881080DF9dD62681A781A1'

async function getPoolsInChain(chainId: number, chainName: string, { strategies, tokens }: StrategiesInChainResponse, mappings: Record<string, string>): Promise<Pool[]> {
  const strategiesToFetch = strategies
    .filter((strategy) => strategy.farm.rewards && strategy.farm.rewards.tokens.length > 0) // If there are no rewards, we'll skip the strategy
    .filter((strategy) => strategy.farm.id in mappings) // If we can't map from farm id to defi llama yield id, we'll skip the strategy

  const currentEmissions = await fetchCurrentEmissions(chainName, strategiesToFetch);

  const strategiesWithCurrentEmissions = strategiesToFetch
    .filter((strategy) => strategy.id in currentEmissions)

  const [tvls, apys] = await Promise.all([
    fetchTvl(chainName, strategiesWithCurrentEmissions),
    fetchAPYs(strategiesWithCurrentEmissions, mappings),
  ]);

  return strategiesWithCurrentEmissions.map((strategy) => {
    const [_, registry, id] = strategy.id.split('-');

    const tvl = Number(tvls[strategy.id]);
    const { price, decimals } = tokens[strategy.farm.asset.address];
    const tvlUsd = price * (tvl / 10 ** decimals);

    let extraRewardAPY = 0;
    const emissions = currentEmissions[strategy.id];
    for (const [reward, emissionPerSecond] of Object.entries(emissions)) {
      const { price, decimals } = tokens[reward];
      const emissionInUSD = price * (Number(emissionPerSecond) / 10 ** decimals);
      const yearlyEmission = emissionInUSD * 60 * 60 * 24 * 365;
      extraRewardAPY += (yearlyEmission * 100) / tvlUsd;
    }

    const apy = apys[strategy.farm.id];
    return {
      // The pool doesn't return an ERC20, so we will be using the `{registry}-{assignedId}-{chainName}` format
      pool: `${registry}-${id}-${chainName}`.toLowerCase(),
      chain: chainName,
      project: 'balmy',
      symbol: `${tokens[strategy.farm.asset.address].symbol}`,
      url: `https://app.balmy.xyz/earn/vaults/${chainId}/${strategy.id}`,
      underlyingTokens: [strategy.farm.asset.address],
      rewardTokens: strategy.farm.rewards.tokens.map((token) => token.address),
      tvlUsd,
      apyBase: apy.apyBase,
      apyReward: apy.apyReward + extraRewardAPY,
      poolMeta: strategy.farm.protocol,
    }
  })
}

async function fetchCurrentEmissions(chainName: string, strategies: StrategiesInChainResponse['strategies']) {
  const rewardsPerStrategy = strategies.flatMap((strategy) => {
    const [_, __, id] = strategy.id.split('-');
    return strategy.farm.rewards.tokens.map((reward) => {
      return {
        strategyId: strategy.id,
        assignedId: id,
        reward: reward.address,
      };
    });
  });

  // Fetch emission data on the liq mining manager
  const emissionData: { emissionPerSecond: `${bigint}`; deadline: `${bigint}`; }[] = await sdk.api.abi.multiCall({
    calls: rewardsPerStrategy.map(({ assignedId, reward }) => ({
      target: LIQ_MINING_MANAGER,
      params: [assignedId, reward],
    })),
    abi: LIQ_MINING_MANAGER_CAMPAIGN_EMISSION_,
    chain: chainName.toLowerCase(),
  }).then(({ output }) => output.map(({ output }) => output))

  // Filter out emissions that have already ended, and group them by strategyId
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const currentEmissions: Record<string, Record<string, bigint>> = {}; // strategyId -> reward -> emissionPerSecond
  emissionData.forEach(({ emissionPerSecond, deadline }, i) => {
    if (BigInt(deadline) < BigInt(nowInSeconds)) return;
    const { strategyId, reward } = rewardsPerStrategy[i];
    if (!currentEmissions[strategyId]) currentEmissions[strategyId] = {};
    currentEmissions[strategyId][reward] = BigInt(emissionPerSecond);
  });

  return currentEmissions;
}

async function fetchTvl(chainName: string, strategies: StrategiesInChainResponse['strategies']) {
  // Fetch addresses by id
  const addresses: string[] = await sdk.api.abi.multiCall({
    calls: strategies.map((strategy) => {
      const [_, registry, assignedId] = strategy.id.split('-');
      return {
        target: registry,
        params: [assignedId],
      }
    }),
    abi: STRATEGY_REGISTRY_GET_STRATEGY,
    chain: chainName.toLowerCase(),
  }).then(({ output }) => output.map(({ output }) => output))

  // Fetch balances
  const balances: { tokens: string[], balances: `${bigint}`[] }[] = await sdk.api.abi.multiCall({
    calls: addresses.map((address) => ({
      target: address,
      params: [],
    })),
    abi: STRATEGY_TOTAL_BALANCES,
    chain: chainName.toLowerCase(),
  }).then(({ output }) => output.map(({ output }) => output))

  // Only report the balance of the first token (since the rest are rewards)
  const result: Record<string, `${bigint}`> = {}; // strategyId -> balance
  balances.forEach(({ balances }, i) => {
    result[strategies[i].id] = balances[0];
  });
  return result;
}

async function fetchAPYs(strategies: StrategiesInChainResponse['strategies'], mappings: Record<string, string>): Promise<Record<string, { apyBase: number, apyReward: number }>> {
  // As discussed with the Defi-Llama team, we will fetch individual APYs for each strategy by using the chart endpoint
  const farmIds = strategies
    .map(({ farm }) => farm.id)
    .filter((item, pos) => strategies.findIndex(({ farm }) => farm.id === item) === pos); // Remove duplicates

  const apys = await Promise.all(farmIds.map(async (farmId) => {
    const url = `https://yields.llama.fi/chart/${mappings[farmId]}`
    const data: { data: { apyBase: number, apyReward: number }[] } = await utils.getData(url)
    const { apyBase, apyReward } = data.data[data.data.length - 1]
    return [farmId, { apyBase: apyBase ?? 0, apyReward: apyReward ?? 0 }]
  }))
  return Object.fromEntries(apys);
}

async function fetchChains() {
  const chains = await utils.getData('https://api.llama.fi/chains');
  return Object.fromEntries(chains.map(({ chainId, name }) => [chainId, name]));
}

async function fetchMappings() {
  const data = await utils.getData(`${API}/v1/earn/defi-llama/mappings`);
  return data.poolIdsByFarm;
}

const apy = async () => {
  const [strategies, chains, mappings]: [StrategiesResponse, Record<number, string>, Record<string, string>] = await Promise.all([
    utils.getData(`${API}/v1/earn/strategies/supported`),
    fetchChains(),
    fetchMappings(),
  ]);

  const allPools = await Promise.all(Object.entries(strategies.strategiesByNetwork)
    .map(([chainId, strategies]) => getPoolsInChain(Number(chainId), chains[chainId], strategies, mappings)));

  return allPools
    .flat()
    .filter((p) => utils.keepFinite(p));
};

// ABIS
const LIQ_MINING_MANAGER_CAMPAIGN_EMISSION_ = {
  inputs: [
    { internalType: 'StrategyId', name: 'strategyId', type: 'uint96' },
    { internalType: 'address', name: 'token', type: 'address' },
  ],
  name: 'campaignEmission',
  outputs: [
    { internalType: 'uint256', name: 'emissionPerSecond', type: 'uint256' },
    { internalType: 'uint256', name: 'deadline', type: 'uint256' },
  ],
  stateMutability: 'view',
  type: 'function',
};

const STRATEGY_REGISTRY_GET_STRATEGY = {
  inputs: [{ internalType: 'StrategyId', name: 'strategyId', type: 'uint96' }],
  name: 'getStrategy',
  outputs: [{ internalType: 'contract IEarnStrategy', name: 'strategy', type: 'address' }],
  stateMutability: 'view',
  type: 'function',
};

const STRATEGY_TOTAL_BALANCES = {
  inputs: [],
  name: 'totalBalances',
  outputs: [
    { internalType: 'address[]', name: 'tokens', type: 'address[]' },
    { internalType: 'uint256[]', name: 'balances', type: 'uint256[]' },
  ],
  stateMutability: 'view',
  type: 'function',
}

// TYPES
type StrategiesResponse = {
  strategiesByNetwork: Record<number, StrategiesInChainResponse>
}

type StrategiesInChainResponse = {
  strategies: {
    id: string;
    farm: {
      id: string;
      protocol: string;
      asset: {
        address: string;
      }
      rewards?: {
        tokens: { address: string }[]
      }
    }
  }[],
  tokens: Record<string, {
    decimals: number;
    symbol: string;
    price: number;
  }>;
}

type Pool = {
  pool: string,
  chain: string,
  project: 'balmy',
  symbol: string,
  tvlUsd: number,
  apyBase: number,
  apyReward: number,
  rewardTokens: string[]
  url: string,
  underlyingTokens: string[]
}

module.exports = {
  timetravel: false,
  apy,
};
