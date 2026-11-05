const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const VAULTS = ['0xbb03549117e38103589774ae1d6338d1b237ffa2'];
const YEAR = 365 * 86400;
const MZ_DECIMALS = 1e18;

const vaultPools = async (api, vault) => {
  const [depositAsset, epochStart, [tranches, , enabled]] = await Promise.all([
    api.call({ target: vault, abi: 'address:usdc' }),
    api.call({
      target: vault,
      abi: 'function epochStart() view returns (uint48)',
    }),
    api.call({
      target: vault,
      abi: 'function getTranches(uint256 start, uint256 count) view returns (address[], uint16[], bool[])',
      params: [0, 100],
    }),
  ]);
  const live = tranches.filter((_, i) => enabled[i]);
  const read = (abi) => api.multiCall({ abi, calls: live });

  const [
    symbols,
    names,
    totalAssets,
    pricePerShare,
    streamAmount,
    streamStart,
    streamEnd,
    exitEpochs,
    prices,
  ] = await Promise.all([
    read('string:symbol'),
    read('string:name'),
    read('uint256:totalAssets'),
    read('uint256:pricePerShare'),
    read('uint256:yieldStreamingAmount'),
    read('function yieldStreamStart() view returns (uint48)'),
    read('function yieldStreamEnd() view returns (uint48)'),
    read('uint256:unstakeDelayEpochs'),
    utils.getPriceApiCoins([`${CHAIN}:${depositAsset.toLowerCase()}`]),
  ]);
  const price = prices[`${CHAIN}:${depositAsset.toLowerCase()}`]?.price;
  if (!price) {
    console.error(
      `mezzanine: no price for deposit asset ${depositAsset} of ${vault}`
    );
    return [];
  }

  return live.map((tranche, i) => {
    const assets = Number(totalAssets[i]);
    const duration = Number(streamEnd[i]) - Number(streamStart[i]);
    // A distribution that pays a tranche nothing advances the epoch without restarting its stream
    const streaming =
      Number(streamStart[i]) >= Number(epochStart) && duration > 0;
    const apr = streaming
      ? (Number(streamAmount[i]) / assets) * (YEAR / duration) * 100
      : 0;

    return {
      pool: `${tranche}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'mezzanine',
      symbol: symbols[i],
      tvlUsd: (assets / MZ_DECIMALS) * price,
      apyBase: utils.aprToApy(apr),
      underlyingTokens: [depositAsset],
      token: tranche,
      pricePerShare: Number(pricePerShare[i]) / MZ_DECIMALS,
      poolMeta: `${names[i]}, ${exitEpochs[i]}-epoch withdrawal`,
      url: `https://app.mezz.finance/vaults/${vault}`,
    };
  });
};

const apy = async () => {
  const api = new sdk.ChainApi({ chain: CHAIN });
  const pools = await Promise.all(
    VAULTS.map((vault) =>
      vaultPools(api, vault).catch((e) => {
        console.error(`mezzanine: vault ${vault} failed: ${e.message}`);
        return [];
      })
    )
  );
  return pools.flat().filter(utils.keepFinite);
};

module.exports = {
  protocolId: '9245',
  apyWindowDays: 7,
  timetravel: false,
  apy,
  url: 'https://app.mezz.finance',
};
