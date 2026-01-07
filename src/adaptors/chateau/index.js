const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAINS = {
  plasma: {
    name: 'Plasma',
    chainId: 9745,
    schUSD: '0x888888bab58a7bd3068110749bc7b63b62ce874d',
    chUSD: '0x22222215d4edc5510d23d0886133e7ece7f5fdc1',
  },
};

const ABIS = {
  totalAssets: 'function totalAssets() view returns (uint256)',
  convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
};

const ONE_SHARE = BigInt(10 ** 18).toString();
const DAY_SECONDS = 24 * 60 * 60;

async function getPoolData(chain, chainConfig) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const timestampYesterday = timestamp - DAY_SECONDS;

    // Get blocks for current and 24h ago
    const [blockNowRes, blockYesterdayRes] = await Promise.all([
      utils.getData(`https://coins.llama.fi/block/${chain}/${timestamp}`),
      utils.getData(`https://coins.llama.fi/block/${chain}/${timestampYesterday}`),
    ]);

    const blockNow = blockNowRes.height;
    const blockYesterday = blockYesterdayRes.height;

    // Get TVL and share prices
    const [totalAssetsRes, priceNowRes, priceYesterdayRes] = await Promise.all([
      sdk.api.abi.call({
        target: chainConfig.schUSD,
        abi: ABIS.totalAssets,
        chain,
      }),
      sdk.api.abi.call({
        target: chainConfig.schUSD,
        abi: ABIS.convertToAssets,
        params: [ONE_SHARE],
        chain,
        block: blockNow,
      }),
      sdk.api.abi.call({
        target: chainConfig.schUSD,
        abi: ABIS.convertToAssets,
        params: [ONE_SHARE],
        chain,
        block: blockYesterday,
      }),
    ]);

    const totalAssets = BigInt(totalAssetsRes.output);
    const tvlUsd = Number(totalAssets) / 1e18;

    // Calculate 24h APY from share price change (annualized)
    const priceNow = Number(priceNowRes.output);
    const priceYesterday = Number(priceYesterdayRes.output);

    let apyBase = 0;
    if (priceYesterday > 0 && priceNow > 0) {
      apyBase = Math.pow(priceNow / priceYesterday, 365) * 100 - 100;
    }

    return {
      pool: `${chainConfig.schUSD}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chainConfig.name),
      project: 'chateau',
      symbol: 'schUSD',
      tvlUsd,
      apyBase,
      underlyingTokens: [chainConfig.chUSD],
      url: 'https://app.chateau.capital',
    };
  } catch (e) {
    console.log(`[chateau] Error fetching pool data for ${chain}:`, e.message);
    return null;
  }
}

async function apy() {
  const pool = await getPoolData('plasma', CHAINS.plasma);
  return pool && pool.tvlUsd > 0 ? [pool] : [];
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.chateau.capital',
};
