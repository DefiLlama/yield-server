const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const project = 'agua';

// One entry per Agua vault (ERC-4626); add new vaults here as they launch
const VAULTS = [
  {
    address: '0xa98B4A70E17e55045cdE4972B95BC2e8CEc22A0F', // aguaUSDCgc
    chain: 'ethereum',
    poolMeta: 'Global Carry Vault',
    url: 'https://docs.tropicalwater.xyz/vaults/the-agua-global-carry-vault',
  },
];

const DAY = 24 * 3600;
const LOOKBACK_DAYS = 7;

const abis = {
  asset: 'address:asset',
  totalAssets: 'uint256:totalAssets',
  convertToAssets:
    'function convertToAssets(uint256 shares) view returns (uint256 assets)',
};

const getBlock = async (chain, timestamp) =>
  (await axios.get(`https://coins.llama.fi/block/${chain}/${timestamp}`)).data
    .height;

const getChainPools = async (chain, vaults) => {
  // 60s safety margin so coins.llama.fi/block never 400s on "timestamp after now"
  const now = Math.floor(Date.now() / 1e3) - 60;
  const [blockNow, block7d] = await Promise.all([
    getBlock(chain, now),
    getBlock(chain, now - LOOKBACK_DAYS * DAY),
  ]);

  const calls = vaults.map((v) => ({ target: v.address }));

  const [assetsRes, vaultDecimalsRes, totalAssetsRes] = await Promise.all([
    sdk.api.abi.multiCall({ calls, abi: abis.asset, chain }),
    sdk.api.abi.multiCall({ calls, abi: 'erc20:decimals', chain }),
    sdk.api.abi.multiCall({
      calls,
      abi: abis.totalAssets,
      chain,
      block: blockNow,
    }),
  ]);

  const underlyings = assetsRes.output.map((o) => o.output);

  const sharePriceCalls = vaults.map((v, i) => ({
    target: v.address,
    params: [(10n ** BigInt(vaultDecimalsRes.output[i].output)).toString()],
  }));

  const [
    ppsNowRes,
    pps7dRes,
    underlyingSymbolsRes,
    underlyingDecimalsRes,
    prices,
  ] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: sharePriceCalls,
      abi: abis.convertToAssets,
      chain,
      block: blockNow,
      permitFailure: true,
    }),
    // vault may be younger than the lookback window -> permitFailure
    sdk.api.abi.multiCall({
      calls: sharePriceCalls,
      abi: abis.convertToAssets,
      chain,
      block: block7d,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: underlyings.map((u) => ({ target: u })),
      abi: 'erc20:symbol',
      chain,
    }),
    sdk.api.abi.multiCall({
      calls: underlyings.map((u) => ({ target: u })),
      abi: 'erc20:decimals',
      chain,
    }),
    utils.getPrices(underlyings, chain),
  ]);

  return vaults
    .map((vault, i) => {
      const underlying = underlyings[i];
      const underlyingDecimals = Number(underlyingDecimalsRes.output[i].output);
      const underlyingPrice =
        prices.pricesByAddress[underlying.toLowerCase()];
      if (underlyingPrice == null) return null;

      const tvlUsd =
        (Number(totalAssetsRes.output[i].output) / 10 ** underlyingDecimals) *
        underlyingPrice;

      const ppsNow = Number(ppsNowRes.output[i]?.output);
      const pps7d = Number(pps7dRes.output[i]?.output);
      const apyBase =
        ppsNow > 0 && pps7d > 0
          ? ((ppsNow / pps7d) ** (365 / LOOKBACK_DAYS) - 1) * 100
          : 0;

      return {
        pool: `${vault.address.toLowerCase()}-${chain}`,
        chain: utils.formatChain(chain),
        project,
        symbol: underlyingSymbolsRes.output[i].output,
        poolMeta: vault.poolMeta,
        tvlUsd,
        apyBase,
        token: vault.address,
        underlyingTokens: [underlying],
        url: vault.url,
      };
    })
    .filter(Boolean);
};

const apy = async () => {
  const vaultsByChain = VAULTS.reduce((acc, v) => {
    (acc[v.chain] = acc[v.chain] || []).push(v);
    return acc;
  }, {});

  const pools = (
    await Promise.all(
      Object.entries(vaultsByChain).map(([chain, vaults]) =>
        getChainPools(chain, vaults)
      )
    )
  ).flat();

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '8351',
  timetravel: false,
  apy,
  url: 'https://docs.tropicalwater.xyz/',
};
