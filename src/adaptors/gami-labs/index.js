const sdk = require('@defillama/sdk');

const VAULTS = [
  // ETHEREUM — Lagoon
  { sdkChain: 'ethereum', address: '0xdae854d0896ad2fee335689a3f7b4a95fd1a3e46', name: 'Gami USDC', url: 'https://gamilabs.io/vaults/1/0xdae854d0896ad2fee335689a3f7b4a95fd1a3e46' },
  { sdkChain: 'ethereum', address: '0x33e1339567c183fbadcb43f72d11c47229d468ab', name: 'Gami Stake DAO USDC', url: 'https://gamilabs.io/vaults/1/0x33e1339567c183fbadcb43f72d11c47229d468ab' },
  { sdkChain: 'ethereum', address: '0x414070fb9e64fd69160d75da57e75ba11f9f605a', name: 'Gami WBTC', url: 'https://gamilabs.io/vaults/1/0x414070fb9e64fd69160d75da57e75ba11f9f605a' },
  { sdkChain: 'ethereum', address: '0x57e6824a8b15b709cefb4ccef644ba1349057e77', name: 'xBTCY', url: 'https://gamilabs.io/vaults/1/0x57e6824a8b15b709cefb4ccef644ba1349057e77' },
  { sdkChain: 'ethereum', address: '0x2a676c2744421b4fae65ce86b47adacb620047d4', name: 'Gami hemiBTC', url: 'https://gamilabs.io/vaults/1/0x2a676c2744421b4fae65ce86b47adacb620047d4' },
  { sdkChain: 'ethereum', address: '0x2031eceec018549a2c729cacd6c0bfc4be2524ed', name: 'Gami ETH', url: 'https://gamilabs.io/vaults/1/0x2031eceec018549a2c729cacd6c0bfc4be2524ed' },
  { sdkChain: 'ethereum', address: '0xfab0f56c28e3f874b15922b213e696f37b670916', name: 'Coinshift USPC Prime', url: 'https://gamilabs.io/vaults/1/0xfab0f56c28e3f874b15922b213e696f37b670916' },
  { sdkChain: 'ethereum', address: '0x09252d2c4afca9b1479efdd39faa53de9ff23114', name: 'Coinshift USPC High Yield', url: 'https://gamilabs.io/vaults/1/0x09252d2c4afca9b1479efdd39faa53de9ff23114' },
  { sdkChain: 'ethereum', address: '0x683faf5bafd88d4c383ccaf3d61c26af2e164409', name: 'Gami Gearbox WBTC', url: 'https://gamilabs.io/vaults/1/0x683faf5bafd88d4c383ccaf3d61c26af2e164409' },
  { sdkChain: 'base', address: '0x776f95321a0285f8bcde149e3264d16dc08da69a', name: 'Gami Spectra USDC', url: 'https://gamilabs.io/vaults/8453/0x5e93e1193a5e297cba0856e9b3f22b6e05429b9a' },
  { sdkChain: 'flare', address: '0x6420a613e936602ca3f1ad5680b3f4d47d473bf1', name: 'Flare XRP Yield Prime', url: 'https://gamilabs.io/vaults/14/0x0c4f32c53d4b91a019c7c9d8da14af140295eef6' },
  { sdkChain: 'hemi', address: '0x1e32c96757c07775ca4fc796c4f4311722eaf35e', name: 'Hemi USDC', url: 'https://gamilabs.io/vaults/43111/0x1e32c96757c07775ca4fc796c4f4311722eaf35e' },
  { sdkChain: 'avax', address: '0xb3a2bcb30c1460d88db18b42a29fae2399952874', name: 'USDC Avalanche Core', url: 'https://gamilabs.io/vaults/43114/0xb3a2bcb30c1460d88db18b42a29fae2399952874' },
  { sdkChain: 'avax', address: '0x1F0570a081FeE0e4dF6eAC470f9d2D53CDEDa1c5', name: 'Gami Silo USDC', url: 'https://gamilabs.io/vaults/43114/0x1F0570a081FeE0e4dF6eAC470f9d2D53CDEDa1c5' },
  { sdkChain: 'avax', address: '0x0F78Ea587D8E2950319e0b467c665bD2CB73051B', name: 'Gami Silo AVAX', url: 'https://gamilabs.io/vaults/43114/0x0F78Ea587D8E2950319e0b467c665bD2CB73051B' },
];

const CHAIN_DISPLAY = {
  ethereum: 'Ethereum',
  base: 'Base',
  flare: 'Flare',
  hemi: 'Hemi',
  avax: 'Avalanche',
};

const ABI = {
  asset: 'address:asset',
  totalAssets: 'uint256:totalAssets',
  decimals: 'uint8:decimals',
  symbol: 'string:symbol',
  convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
};

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function multi(chain, abi, calls) {
  const res = await sdk.api.abi.multiCall({ chain, abi, calls, permitFailure: true });
  return res.output.map(r => r.output);
}

async function processChain(sdkChain, vaults) {
  const targets = vaults.map(v => ({ target: v.address }));

  const [assets, shareDecimals, totalAssetsArr, shareSymbols] = await Promise.all([
    multi(sdkChain, ABI.asset, targets),
    multi(sdkChain, ABI.decimals, targets),
    multi(sdkChain, ABI.totalAssets, targets),
    multi(sdkChain, ABI.symbol, targets),
  ]);

  const assetTargets = assets.map(a => ({
    target: a || '0x0000000000000000000000000000000000000000',
  }));
  const underlyingDecimals = await multi(sdkChain, ABI.decimals, assetTargets);

  const ppsCalls = vaults.map((v, i) => ({
    target: v.address,
    params: [shareDecimals[i] != null ? (10n ** BigInt(shareDecimals[i])).toString() : '0'],
  }));
  const ppsRaw = await multi(sdkChain, ABI.convertToAssets, ppsCalls);

  const validAssets = [...new Set(assets.filter(Boolean).map(a => a.toLowerCase()))];
  const priceKeys = validAssets.map(a => `${sdkChain}:${a}`).join(',');
  const priceResp = priceKeys
    ? await fetchJson(`https://coins.llama.fi/prices/current/${priceKeys}`)
    : { coins: {} };
  const priceMap = priceResp?.coins || {};

  return vaults.map((v, i) => {
    const asset = assets[i];
    const undDec = underlyingDecimals[i] != null ? Number(underlyingDecimals[i]) : null;
    const ta = totalAssetsArr[i];
    const pps = ppsRaw[i];
    const sym = shareSymbols[i];

    if (!asset || undDec == null || ta == null || pps == null) return null;

    const priceUsd = priceMap[`${sdkChain}:${asset.toLowerCase()}`]?.price;
    if (priceUsd == null) return null;

    const tvlUsd = (Number(ta) / 10 ** undDec) * priceUsd;
    const pricePerShare = Number(pps) / 10 ** undDec;

    return {
      pool: `${v.address.toLowerCase()}-${sdkChain}`,
      chain: CHAIN_DISPLAY[sdkChain] || sdkChain,
      project: 'gami-labs',
      symbol: sym || v.name,
      tvlUsd,
      apyBase: 0,
      pricePerShare,
      underlyingTokens: [asset.toLowerCase()],
      poolMeta: v.name,
      url: v.url,
    };
  }).filter(Boolean);
}

const apy = async () => {
  const byChain = VAULTS.reduce((acc, v) => {
    (acc[v.sdkChain] ||= []).push(v);
    return acc;
  }, {});

  const results = await Promise.all(
    Object.entries(byChain).map(([chain, vaults]) => processChain(chain, vaults))
  );

  return results.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://gamilabs.io',
};
