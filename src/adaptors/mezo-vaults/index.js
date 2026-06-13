const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'mezo';
const PROJECT = 'mezo-vaults';
const URL = 'https://mezo.org/earn/vaults';

const VAULT = '0xb4D498029af77680cD1eF828b967f010d06C51CC';
const STRATEGY = '0x0C0944713c185ea3e64F5609ECee3fB3C054a295';
const GAUGE = '0x677817bF3e44b90E8F95222F75e2950b7904a401';
const MUSD = '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186';

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;
const YIELD_INDEX_SCALE = 1e18;
const TOKEN_DECIMALS = 18;
const LOOKBACK_WINDOWS_DAYS = [7, 3];

const weiToNumber = (wei) => Number(wei) / 10 ** TOKEN_DECIMALS;

const viewAbi = (name, outType) => ({
  inputs: [],
  name,
  outputs: [{ type: outType }],
  stateMutability: 'view',
  type: 'function',
});

const yieldIndexAbi = viewAbi('yieldIndex', 'uint256');

const computeBaseApr = async (currentIndex, latest) => {
  for (const days of LOOKBACK_WINDOWS_DAYS) {
    const targetTimestamp = latest.timestamp - days * SECONDS_PER_DAY;
    try {
      const older = await sdk.api.util.lookupBlock(targetTimestamp, {
        chain: CHAIN,
      });
      const res = await sdk.api.abi.call({
        target: VAULT,
        abi: yieldIndexAbi,
        chain: CHAIN,
        block: older.number,
      });
      const oldIndex = Number(res.output);
      const elapsedSeconds = latest.timestamp - older.timestamp;
      if (oldIndex > 0 && currentIndex > oldIndex && elapsedSeconds > 0) {
        const yieldPerShare = (currentIndex - oldIndex) / YIELD_INDEX_SCALE;
        return yieldPerShare * (SECONDS_PER_YEAR / elapsedSeconds) * 100;
      }
    } catch {}
  }
  return null;
};

const getApy = async () => {
  const [
    yieldIndexRes,
    vaultBalRes,
    strategyBalRes,
    vaultSupplyRes,
    gaugeStakedRes,
    rewardTokenRes,
    rewardRateRes,
    periodFinishRes,
    latestBlock,
  ] = await Promise.all([
    sdk.api.abi.call({ target: VAULT, abi: yieldIndexAbi, chain: CHAIN }),
    sdk.api.erc20.balanceOf({ target: MUSD, owner: VAULT, chain: CHAIN }),
    sdk.api.erc20.balanceOf({ target: MUSD, owner: STRATEGY, chain: CHAIN }),
    sdk.api.erc20.totalSupply({ target: VAULT, chain: CHAIN }),
    sdk.api.abi.call({
      target: GAUGE,
      abi: viewAbi('totalSupply', 'uint256'),
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: GAUGE,
      abi: viewAbi('rewardToken', 'address'),
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: GAUGE,
      abi: viewAbi('rewardRate', 'uint256'),
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: GAUGE,
      abi: viewAbi('periodFinish', 'uint256'),
      chain: CHAIN,
    }),
    sdk.api.util.getLatestBlock(CHAIN),
  ]);

  const rewardToken = rewardTokenRes.output;
  const priceData = await utils.getPrices([MUSD, rewardToken], CHAIN);
  const musdPrice = priceData.pricesByAddress[MUSD.toLowerCase()] ?? 1;
  const rewardPrice = priceData.pricesByAddress[rewardToken.toLowerCase()] ?? 0;

  const totalAssetsWei =
    BigInt(vaultBalRes.output) + BigInt(strategyBalRes.output);
  const totalSupplyWei = BigInt(vaultSupplyRes.output);
  const gaugeStakedWei = BigInt(gaugeStakedRes.output);
  const unstakedWei =
    totalSupplyWei > gaugeStakedWei ? totalSupplyWei - gaugeStakedWei : 0n;

  const allocateTvl = (shareWei) => {
    if (totalSupplyWei === 0n) return 0;
    const allocWei = (totalAssetsWei * shareWei) / totalSupplyWei;
    return weiToNumber(allocWei) * musdPrice;
  };

  const currentIndex = Number(yieldIndexRes.output);
  const apyBase = await computeBaseApr(currentIndex, latestBlock);

  const stakedTvlUsd = allocateTvl(gaugeStakedWei);
  const rewardRate = weiToNumber(BigInt(rewardRateRes.output));
  const periodFinish = Number(periodFinishRes.output);
  const isActive = periodFinish > Math.floor(Date.now() / 1000);
  const annualRewardUsd = rewardRate * SECONDS_PER_YEAR * rewardPrice;
  const apyReward =
    isActive && stakedTvlUsd > 0 ? (annualRewardUsd / stakedTvlUsd) * 100 : 0;

  const pools = [
    {
      pool: `${VAULT.toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'sMUSD',
      tvlUsd: allocateTvl(unstakedWei),
      apyBase,
      underlyingTokens: [MUSD],
      url: URL,
    },
    {
      pool: `${GAUGE.toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'sMUSD',
      poolMeta: 'Staked in gauge',
      tvlUsd: stakedTvlUsd,
      apyBase: 0,
      apyReward,
      rewardTokens: [rewardToken],
      underlyingTokens: [MUSD],
      url: URL,
    },
  ];

  return pools.filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: URL,
};
