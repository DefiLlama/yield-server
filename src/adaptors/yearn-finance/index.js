const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const NATIVE_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const normalizeNativeAddress = (addr) =>
  addr && addr.toLowerCase() === NATIVE_SENTINEL.toLowerCase() ? ZERO_ADDRESS : addr;

const chains = {
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  katana: 747474,
  polygon: 137,
};

const YFI = '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e';
const STYFI = '0x42b25284E8ae427D79da78b65DFFC232aAECc016';
const STYFIX = '0x9C42461AA8422926e3AEF7B1C6e3743597149d79';
const YVUSDC = '0xBe53A109B494E5c9f97b9Cd39Fe969BE68BF6204';
const STYFI_REWARD_DISTRIBUTOR = '0x95547eDe56cF74B73dd78a37f547127dffDA6113';
const STYFI_EPOCHS_PER_YEAR = (365 * 86400) / (14 * 86400);

// stYFIx wraps stYFI 1:1, so its stake is subtracted from the stYFI pool tvl.
// Both earn the same rate: the distributor pays all stYFI holders pro-rata
// in yvUSDC per 14-day epoch and stYFIx passes its share through.
const getStyfiPools = async () => {
  try {
    const [totalStakedRes, styfixStakedRes, epochRewardsRes, prices] =
      await Promise.all([
        sdk.api.abi.call({
          target: STYFI,
          abi: 'erc20:totalSupply',
          chain: 'ethereum',
        }),
        sdk.api.abi.call({
          target: STYFI,
          abi: 'erc20:balanceOf',
          params: [STYFIX],
          chain: 'ethereum',
        }),
        sdk.api.abi.call({
          target: STYFI_REWARD_DISTRIBUTOR,
          abi: 'function epoch_rewards() view returns (uint256, uint256)',
          chain: 'ethereum',
        }),
        utils.getPrices([YFI, YVUSDC], 'ethereum'),
      ]);

    const yfiPrice = prices.pricesByAddress[YFI.toLowerCase()];
    const yvUsdcPrice = prices.pricesByAddress[YVUSDC.toLowerCase()];

    const totalStaked = totalStakedRes.output / 1e18;
    const styfixStaked = styfixStakedRes.output / 1e18;
    const styfiStaked = totalStaked - styfixStaked;
    const epochRewards = epochRewardsRes.output[1] / 1e6;

    const apyReward =
      ((epochRewards * STYFI_EPOCHS_PER_YEAR * yvUsdcPrice) /
        (totalStaked * yfiPrice)) *
      100;

    const basePool = {
      chain: 'Ethereum',
      project: 'yearn-finance',
      rewardTokens: [YVUSDC],
      underlyingTokens: [YFI],
      url: 'https://styfi.yearn.fi/',
    };

    return [
      {
        ...basePool,
        pool: STYFI,
        symbol: 'stYFI',
        tvlUsd: styfiStaked * yfiPrice,
        apyReward,
      },
      {
        ...basePool,
        pool: STYFIX,
        symbol: 'stYFIx',
        poolMeta: 'delegated',
        tvlUsd: styfixStaked * yfiPrice,
        apyReward,
      },
    ];
  } catch (e) {
    console.error('failed to fetch stYFI pools', e.message);
    return [];
  }
};

const getLpUnderlying = async (vaults, chain) => {
  const read = (abi) =>
    sdk.api.abi
      .multiCall({
        chain,
        abi,
        calls: vaults.map((p) => ({ target: p.asset.address })),
        permitFailure: true,
      })
      .then(({ output }) => output.map((o) => o.output))
      .catch(() => []);
  const [token0s, token1s] = await Promise.all([
    read('address:token0'),
    read('address:token1'),
  ]);
  return vaults.map((p, i) =>
    token0s[i] && token1s[i]
      ? [token0s[i], token1s[i]].map(normalizeNativeAddress)
      : [normalizeNativeAddress(p.asset.address)]
  );
};

// Yearn winds a vault down by zeroing its deposit limit, without marking it
// retired in the vault list. Returns the vaults that take no deposits from an
// arbitrary address; a failed read keeps the vault listed.
const getClosedVaults = async (vaults, chain) => {
  const v3 = vaults.filter((p) => p.v3);
  const v2 = vaults.filter((p) => !p.v3);
  const read = (abi, list, params) =>
    sdk.api.abi
      .multiCall({
        chain,
        abi,
        calls: list.map((p) => ({ target: p.address, params })),
        permitFailure: true,
      })
      .then(({ output }) => output.map((o) => o.output))
      .catch(() => []);
  const [v3Limits, v2Limits] = await Promise.all([
    read('function maxDeposit(address) view returns (uint256)', v3, [
      '0x000000000000000000000000000000000000dEaD',
    ]),
    read('uint256:availableDepositLimit', v2),
  ]);
  return new Set(
    [
      ...v3.filter((_, i) => v3Limits[i] === '0'),
      ...v2.filter((_, i) => v2Limits[i] === '0'),
    ].map((p) => p.address)
  );
};

const getApy = async () => {
  const styfiPools = getStyfiPools();
  const vaults = await utils
    .getData('https://kong.yearn.fi/api/rest/list/vaults')
    .catch((e) => {
      console.error('failed to fetch yearn vaults from kong', e.message);
      return [];
    });

  const data = await Promise.all(
    Object.entries(chains).map(async ([chain, chainId]) => {
      const listed = vaults.filter(
        (p) =>
          p.chainId === chainId &&
          p.origin === 'yearn' &&
          p.asset &&
          p.inclusion?.isYearn !== false &&
          !p.isRetired &&
          !p.isHidden
      );
      const closed = await getClosedVaults(listed, chain);
      const open = listed.filter((p) => !closed.has(p.address));
      const underlying = await getLpUnderlying(open, chain);

      return open.map((p, i) => {
        const { historical, oracle } = p.performance ?? {};
        const netApy = historical?.net ?? oracle?.netAPR;
        return {
          pool: p.address,
          chain: utils.formatChain(chain),
          project: 'yearn-finance',
          symbol: p.asset.symbol,
          tvlUsd: p.tvl,
          apyBase: netApy == null ? undefined : netApy * 100,
          url: `https://yearn.fi/${p.v3 ? 'v3' : 'vaults'}/${chainId}/${
            p.address
          }`,
          underlyingTokens: underlying[i],
        };
      });
    })
  );

  const pools = data
    .flat()
    .concat(await styfiPools)
    .filter((p) => utils.keepFinite(p))
    // old usdc vault
    .filter((p) => p.pool !== '0x5f18C75AbDAe578b483E5F43f12a39cF75b973a9');

  return addMerklRewardApy(pools, 'yearn');
};

module.exports = {
  protocolId: '113',
  timetravel: false,
  apy: getApy,
};
