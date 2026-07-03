const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const NATIVE_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const normalizeNativeAddress = (addr) =>
  addr && addr.toLowerCase() === NATIVE_SENTINEL.toLowerCase() ? ZERO_ADDRESS : addr;

const chains = {
  ethereum: 1,
  fantom: 250,
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
  const styfiPools = getStyfiPools();
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

          underlying = underlying.map(normalizeNativeAddress);

          // OP incentives via yvToken staking
          const apyReward = p.apr?.extra?.stakingRewardsAPR * 100 ?? 0;

          const forwardAPR = p.apr.forwardAPR?.netAPR;
          const apyBase = (forwardAPR ?? p.apr.netAPR) * 100;

          return {
            pool: p.address,
            chain: utils.formatChain(chain[0]),
            project: 'yearn-finance',
            symbol: p.token.display_symbol,
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
