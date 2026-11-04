const sdk = require('@defillama/sdk');

const utils = require('../utils');

// Only actively marketed strategies are listed on the yields page; protocol
// TVL is tracked separately (DefiLlama-Adapters) and counts every vault.
const config = {
  base: [
    '0x2406aacbdF8463176DeB285AdAa81768415B6c7E', // Alpha Strategies HYPE++ Base
  ],
  arbitrum: [
    '0x75288264FDFEA8ce68e6D852696aB1cE2f3E5004', // Alpha Strategies HYPE++ Arbitrum
  ],
  hyperliquid: [
    '0xf44f49E6577B3934f981C6f0629d15154d2606E6', // hXXI BTC
    '0x6bf9345b5d6b27b5cbf2e463dc5e0b2afcedc21c', // dgnUpside
    '0x3ebb11ba6a5b61c04d1a703ea10728d519945440', // d2HYPE
    '0x195eb4d088f222c982282b5dd495e76dba4bc7d1', // Alpha Strategies HYPE++ hyperliquid
    '0x208f63A7F60C319597C05Fa5eC67FDe41839baD6', // texasHedge
  ],
};

const DAY = 86400;
const MIN_WINDOW = 30 * DAY;

const abis = {
  totalAssets: {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  asset: {
    inputs: [],
    name: 'asset',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  convertToAssets: {
    inputs: [{ type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  getCurrentEpoch: 'function getCurrentEpoch() view returns (uint256)',
  epochs:
    'function epochs(uint256) view returns (uint80 fundingStart, uint80 epochStart, uint80 epochEnd)',
  custodied: 'function custodied() view returns (bool)',
};

// pricePerShare only steps when an epoch settles, so annualize its growth over
// whole completed epochs covering at least 30 days, ending at the last
// settlement: a fixed calendar window would read 0 between settlements.
const epochApr = async (chain, vault, oneShare, ppsNow) => {
  const call = (abi, params, block) =>
    sdk.api.abi
      .call({ chain, target: vault, abi, params, block })
      .then((r) => r.output);
  try {
    const n = Number(await call(abis.getCurrentEpoch));
    const [current, custodied] = await Promise.all([
      call(abis.epochs, [n]),
      call(abis.custodied),
    ]);
    const now = Date.now() / 1000;
    const last = !custodied && now >= Number(current.epochEnd) ? n : n - 1;
    if (last < 0) return 0;

    let epoch = last === n ? current : await call(abis.epochs, [last]);
    const endTs = Number(epoch.epochEnd);
    for (let k = last; endTs - Number(epoch.epochStart) < MIN_WINDOW && k > 0; )
      epoch = await call(abis.epochs, [--k]);
    const startTs = Number(epoch.epochStart);

    const [block] = await utils.getBlocksByTime([startTs], chain);
    const ppsStart = Number(await call(abis.convertToAssets, [oneShare], block));
    return (
      (((ppsNow / ppsStart - 1) * 365) / ((endTs - startTs) / DAY)) * 100
    );
  } catch (e) {
    console.error(`d2-finance: epoch apr failed for ${vault} on ${chain}:`, e.message);
    return null;
  }
};

const chainPools = async (chain, vaults) => {
  const calls = vaults.map((vault) => ({ target: vault }));
  const [totalAssets, assets, symbols, decimals] = await Promise.all([
    sdk.api.abi.multiCall({ abi: abis.totalAssets, calls, chain, permitFailure: true }),
    sdk.api.abi.multiCall({ abi: abis.asset, calls, chain, permitFailure: true }),
    sdk.api.abi.multiCall({ abi: 'erc20:symbol', calls, chain, permitFailure: true }),
    sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls, chain, permitFailure: true }),
  ]);

  const oneShareCalls = vaults.map((vault, i) => ({
    target: vault,
    params: [(10n ** BigInt(decimals.output[i].output ?? 18)).toString()],
  }));
  const ppsNow = await sdk.api.abi.multiCall({
    abi: abis.convertToAssets,
    calls: oneShareCalls,
    chain,
    permitFailure: true,
  });
  const apyBases = await Promise.all(
    vaults.map((vault, i) =>
      epochApr(
        chain,
        vault,
        oneShareCalls[i].params[0],
        Number(ppsNow.output[i].output)
      )
    )
  );

  const assetAddresses = assets.output.map((o) => o.output);
  const { pricesByAddress } = await utils.getPrices(
    [...new Set(assetAddresses.filter(Boolean))],
    chain
  );
  const assetDecimals = await sdk.api.abi.multiCall({
    abi: 'erc20:decimals',
    calls: assetAddresses.map((target) => ({ target })),
    chain,
    permitFailure: true,
  });

  return vaults.map((vault, i) => {
    const asset = assetAddresses[i];
    const price = pricesByAddress[asset?.toLowerCase()];
    if (!asset || !price) return null;

    const assetDecimal = Number(assetDecimals.output[i].output ?? 18);
    const tvlUsd =
      (Number(totalAssets.output[i].output) / 10 ** assetDecimal) * price;
    const pricePerShare = Number(ppsNow.output[i].output) / 10 ** assetDecimal;

    return {
      pool: `${vault}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'd2-finance',
      symbol: symbols.output[i].output ?? '',
      tvlUsd,
      apyBase: apyBases[i],
      underlyingTokens: [asset],
      pricePerShare,
      url: `https://d2.finance/strategies/${vault}`,
    };
  });
};

const poolsFunction = async () => {
  const results = await Promise.allSettled(
    Object.entries(config).map(([chain, vaults]) => chainPools(chain, vaults))
  );
  const pools = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  return pools.filter(Boolean).filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '4846',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://d2.finance',
};
