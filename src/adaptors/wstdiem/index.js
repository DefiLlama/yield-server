// wstDIEM — DefiLlama yield adaptor (Base)
//
// wstDIEM is an ERC-4626 vault over DIEM (Venice.ai's inference-credit token). The vault stakes its
// DIEM on Venice; the daily inference credit it earns is sold for USDC and compounded back into the
// vault as DIEM (routeYield -> creditDIEM), which raises the share price without minting shares.
//
// Everything is read on-chain:
//   tvlUsd        : totalAssets() (idle + staked + cooling DIEM) x DIEM price from coins.llama.fi
//   pricePerShare : convertToAssets(1e18) / 1e18 (DIEM per wstDIEM)
//   apyBase       : share-price growth over the trailing 7 days, annualised. Compounds land a few times
//                   a day in lumps, so a 24h window swings with how many landed; 7 days is the honest
//                   realised rate. It is net of the vault's fees (they never reach the share price).
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'base';
const VAULT = '0xe49FA849cB37b0e7A42B2335e333fb99474167ba'; // wstDIEM (InferenceVault v6)
const DIEM = '0xF4d97F2da56e8c3098f3a8D538DB630A2606a024';
const ONE = '1000000000000000000';
const DAY = 86400;

const call = async (abi, params, block) =>
  (
    await sdk.api.abi.call({
      target: VAULT,
      abi,
      params,
      chain: CHAIN,
      ...(block ? { block } : {}),
    })
  ).output;

const pps = (block) => call('function convertToAssets(uint256) view returns (uint256)', [ONE], block);

const annualise = (now, then, days) => {
  const r = Number(now) / Number(then);
  if (!Number.isFinite(r) || r <= 0) return null;
  const apy = (r ** (365 / days) - 1) * 100;
  return Number.isFinite(apy) && apy >= 0 ? apy : null;
};

const apy = async () => {
  const [assets, asset] = await Promise.all([call('uint256:totalAssets'), call('address:asset')]);
  if (String(asset).toLowerCase() !== DIEM.toLowerCase()) {
    throw new Error(`wstDIEM asset() is ${asset}, expected DIEM ${DIEM}`);
  }
  const key = `${CHAIN}:${DIEM}`;
  const price = (await utils.getPriceApiData(`/prices/current/${key}`))?.coins?.[key]?.price;
  if (!Number.isFinite(price) || price <= 0) throw new Error(`no DIEM price for ${key}`);

  const now = Math.floor(Date.now() / 1000);
  const [b7] = await utils.getBlocksByTime([now - 7 * DAY], CHAIN);
  const [ppsNow, pps7] = await Promise.all([pps(), pps(b7)]);

  return [
    {
      pool: `${VAULT}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'wstdiem',
      symbol: 'wstDIEM',
      tvlUsd: (Number(assets) / 1e18) * price,
      apyBase: annualise(ppsNow, pps7, 7) ?? 0,
      pricePerShare: Number(ppsNow) / 1e18,
      underlyingTokens: [DIEM],
      token: VAULT,
      isIntrinsicSource: true,
      poolMeta: 'Venice inference yield, compounded in DIEM',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.liquidprotocol.org/vault',
};
