const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const PROJECT = '1inch';
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const CONTRACTS = {
  INCH_TOKEN: '0x111111111117dc0aa78b770fa6a738034120c302',
  ST1INCH: '0x9a0c8ff858d273f57072d714bca7411d717501d7',
  POWER_POD: '0xaccfac2339e16dc80c50d2fa81b5c2b049b4f947',
  WHITELIST_REGISTRY: '0xF55684BC536487394B423e70567413faB8e45E26',
};

const abi = {
  getWhitelist:
    'function getWhitelist() external view returns (address[] memory)',
  registration:
    'function registration(address delegatee) external view returns (address)',
  defaultFarms:
    'function defaultFarms(address delegatee) external view returns (address)',
  totalSupply: 'erc20:totalSupply',
  balanceOf: 'erc20:balanceOf',
  farmInfo:
    'function farmInfo(address rewardsToken) external view returns (uint40 finished, uint32 duration, uint184 reward)',
};

const main = async () => {
  // 1. Auto-discover resolvers from on-chain whitelist
  const resolvers = (
    await sdk.api.abi.call({
      target: CONTRACTS.WHITELIST_REGISTRY,
      abi: abi.getWhitelist,
      chain: CHAIN,
    })
  ).output;

  if (!resolvers || resolvers.length === 0) return [];

  // 2. Get global staking data: total 1INCH locked and total st1INCH supply
  const [inchInStaking, st1inchSupply] = await Promise.all([
    sdk.api.abi.call({
      target: CONTRACTS.INCH_TOKEN,
      abi: abi.balanceOf,
      params: [CONTRACTS.ST1INCH],
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: CONTRACTS.ST1INCH,
      abi: abi.totalSupply,
      chain: CHAIN,
    }),
  ]);

  const totalInchStaked = Number(inchInStaking.output) / 1e18;
  const totalSt1inch = Number(st1inchSupply.output) / 1e18;

  if (totalSt1inch === 0) return [];

  // Conversion rate: 1 st1INCH = X 1INCH
  const st1inchToInch = totalInchStaked / totalSt1inch;

  // 3. Get 1INCH price
  const priceKey = `${CHAIN}:${CONTRACTS.INCH_TOKEN}`;
  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${priceKey}`
    )
  ).coins;
  const inchPrice = prices[priceKey]?.price;

  if (!inchPrice) return [];

  // 4. For each resolver, get DelegatedShare token and MultiFarmingPod addresses
  const [registrations, farms] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: abi.registration,
      calls: resolvers.map((r) => ({ target: CONTRACTS.POWER_POD, params: [r] })),
      chain: CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: abi.defaultFarms,
      calls: resolvers.map((r) => ({ target: CONTRACTS.POWER_POD, params: [r] })),
      chain: CHAIN,
      permitFailure: true,
    }),
  ]);

  const delegatedShareAddrs = registrations.output.map((o) => o.output);
  const farmAddrs = farms.output.map((o) => o.output);

  // 5. Get delegated st1INCH per resolver (totalSupply of each DelegatedShare token)
  const delegatedSupplies = await sdk.api.abi.multiCall({
    abi: abi.totalSupply,
    calls: delegatedShareAddrs.map((a) => ({ target: a })),
    chain: CHAIN,
    permitFailure: true,
  });

  // 6. Get farm reward info per resolver
  const farmInfos = await sdk.api.abi.multiCall({
    abi: abi.farmInfo,
    calls: farmAddrs.map((a) => ({
      target: a,
      params: [CONTRACTS.INCH_TOKEN],
    })),
    chain: CHAIN,
    permitFailure: true,
  });

  // 7. Build pool results
  const now = Math.floor(Date.now() / 1000);
  const pools = [];

  for (let i = 0; i < resolvers.length; i++) {
    const resolver = resolvers[i].toLowerCase();
    const delegatedSt1inch =
      Number(delegatedSupplies.output[i]?.output || 0) / 1e18;

    if (delegatedSt1inch === 0) continue;

    // Convert delegated st1INCH to 1INCH equivalent for TVL
    const delegatedInch = delegatedSt1inch * st1inchToInch;
    const tvlUsd = delegatedInch * inchPrice;

    // Calculate reward APY from farm info
    let apyReward = 0;
    const farm = farmInfos.output[i]?.output;
    if (farm) {
      const finished = Number(farm.finished);
      const duration = Number(farm.duration);
      const reward = Number(farm.reward) / 1e18;

      if (finished > now && duration > 0 && delegatedInch > 0) {
        const rewardPerYear = (reward / duration) * SECONDS_PER_YEAR;
        apyReward = (rewardPerYear / delegatedInch) * 100;
      }
    }

    pools.push({
      pool: `1INCH-${resolver}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: '1INCH',
      tvlUsd,
      apyReward,
      url: `https://1inch.network/resolver/${resolver}`,
      rewardTokens: apyReward > 0 ? [CONTRACTS.INCH_TOKEN] : [],
      underlyingTokens: [CONTRACTS.INCH_TOKEN],
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.1inch.io/#/1/earn/delegate',
};
