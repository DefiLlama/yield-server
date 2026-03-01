const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const dsfPoolStables = '0x22586ea4fdaa9ef012581109b336f0124530ae69';

const FALLBACK_CHART_URL =
  'https://yields.llama.fi/chart/8a20c472-142c-4442-b724-40f2183c073e';

const abi = {
  totalHoldings: 'uint256:totalHoldings',
  lpPrice: 'uint256:lpPrice',
  totalSupply: 'uint256:totalSupply',
};

const SCALE = 10n ** 12n;

// coins.llama.fi: timestamp -> closest block
async function getBlockAtTs(chain, ts) {
  const url = `https://coins.llama.fi/block/${chain}/${ts}`;
  const res = await utils.getData(url);

  const height = res?.height ?? res?.block;
  if (height == null) throw new Error(`No block for ts=${ts}`);

  return height;
}

async function getLpPriceAtBlock(contractAddress, block) {
  const totalSupplyResp = await sdk.api.abi.call({
    target: contractAddress,
    abi: abi.totalSupply,
    chain: CHAIN,
    block,
  });

  const totalSupply = BigInt(totalSupplyResp.output);
  if (totalSupply === 0n) return null;

  try {
    const lp = await sdk.api.abi.call({
      target: contractAddress,
      abi: abi.lpPrice,
      chain: CHAIN,
      block,
    });
    return BigInt(lp.output);
  } catch (e) {
    return null;
  }
}

// Try lpPrice on nearby blocks to survive RPC/archive quirks
async function getLpPriceAtBlockWithFallback(contractAddress, block) {
  const tries = [0, -25, -50, -200, -1000]; // cheap & effective
  for (const d of tries) {
    const b = block + d;
    if (b <= 0) continue;
    const v = await getLpPriceAtBlock(contractAddress, b);
    if (v != null) return v;
  }
  return null;
}

async function getTVL(contractAddress) {
  const tvlResponse = await sdk.api.abi.call({
    target: contractAddress,
    abi: abi.totalHoldings,
    chain: CHAIN,
  });
  return BigInt(tvlResponse.output);
}

// Compounding APY from growth ratio (growthNum/growthDen) over dtSeconds
function annualizeCompoundingFromGrowth(growthNum, growthDen, dtSeconds) {
  const yearSeconds = 365 * 24 * 60 * 60;
  if (!dtSeconds || dtSeconds <= 0) return 0;

  const num = Number(growthNum);
  const den = Number(growthDen);
  
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;

  const ratio = num / den; // lpNow / lpPrev
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;

  const periodsPerYear = yearSeconds / dtSeconds;
  const apy = Math.pow(ratio, periodsPerYear) - 1;

  if (!Number.isFinite(apy)) return 0;
  return apy * 100;
}

function clampApy(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(Math.min(x, 5000), -100);
}

function format1e18ToNumber(x) {
  const neg = x < 0n;
  const v = neg ? -x : x;

  const s = v.toString();
  const intPart = s.length > 18 ? s.slice(0, -18) : '0';
  const frac6 = s.length > 18
    ? s.slice(-18, -12)
    : s.padStart(18, '0').slice(0, 6); // 6 decimals from left

  const n = Number(`${intPart}.${frac6}`);
  return neg ? -n : n;
}

// --------- fallback: old APY from yields.llama chart ---------

async function getFallbackApyFromChart() {
  try {
    const response = await utils.getData(FALLBACK_CHART_URL);
    if (
      response &&
      response.status === 'success' &&
      Array.isArray(response.data) &&
      response.data.length > 0
    ) {
      const latest = response.data[response.data.length - 1];
      const apy = Number(latest?.apy);
      return Number.isFinite(apy) ? apy : 0;
    }
    return 0;
  } catch (e) {
    console.error('Fallback APY fetch failed:', e?.message ?? e);
    return 0;
  }
}

function applyLegacyMultiplier(rawApy) {
  const currentDate = new Date();
  const cutoffDate = new Date('2024-12-01');
  const multiplier = currentDate < cutoffDate ? 0.85 : 0.8;
  return rawApy * multiplier;
}

// --------- main ---------

const collectPools = async () => {
  const tvl = await getTVL(dsfPoolStables);

  const nowTs = Math.floor(Date.now() / 1000);
  const prevTs = nowTs - 24 * 60 * 60;

  const [blockNow, blockPrev] = await Promise.all([
    getBlockAtTs(CHAIN, nowTs),
    getBlockAtTs(CHAIN, prevTs),
  ]);

  if (blockNow === blockPrev) {
    console.log('[DSF][APY] coins.llama returned same block for now/prev', {
      nowTs,
      prevTs,
      blockNow,
      blockPrev,
    });
    
    // coins.llama returned same block for now and prev -> cannot compute 24h growth
    const fallbackRaw = await getFallbackApyFromChart();
    const fallbackAdjusted = applyLegacyMultiplier(fallbackRaw);
    const fb = clampApy(fallbackAdjusted);

    return [{
      pool: `${dsfPoolStables}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'dsf.finance',
      symbol: 'USDT-USDC-DAI',
      tvlUsd: format1e18ToNumber(tvl),
      apy: fb,
      rewardTokens: [],
      underlyingTokens: [
        '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        '0x6B175474e89094C44Da98b954EedeAC495271d0F',
      ],
      poolMeta: 'Stablecoin Yield Strategy (Curve & Convex)',
      url: 'https://app.dsf.finance/',
    }];
  }

  // IMPORTANT: use fallback by blocks
  const [lpNow, lpPrev] = await Promise.all([
    getLpPriceAtBlockWithFallback(dsfPoolStables, blockNow),
    getLpPriceAtBlockWithFallback(dsfPoolStables, blockPrev),
  ]);

  if (!lpNow || !lpPrev) {
    console.log('[DSF][APY] lpPrice missing -> will use fallback', {
      blockNow,
      blockPrev,
      lpNow: lpNow ? lpNow.toString() : null,
      lpPrev: lpPrev ? lpPrev.toString() : null,
    });
  }
  
  let apy = 0;
  let usedFallback = false;
  let growthScaled = null;
  
  if (lpNow && lpPrev && lpPrev > 0n) {
    const dtSeconds = 24 * 60 * 60;

    growthScaled = (lpNow * SCALE) / lpPrev;

    apy = annualizeCompoundingFromGrowth(growthScaled, SCALE, dtSeconds);
    apy = clampApy(apy);

    if (apy === 0) {
     console.log('[DSF][APY] computed apy=0 -> will use fallback', {
        blockNow,
        blockPrev,
        lpNow: lpNow.toString(),
        lpPrev: lpPrev.toString(),
        growthScaled: growthScaled ? growthScaled.toString() : null,
        growthRatioApprox: growthScaled ? Number(growthScaled) / Number(SCALE) : null,
      });
    }
  }

  // smarter fallback condition:
  // - lpPrice missing OR apy not finite OR apy extremely small (likely due to block mismatch / integer rounding)
  if (!lpNow || !lpPrev || !Number.isFinite(apy) || apy <= 0.1) {
    const fallbackRaw = await getFallbackApyFromChart();
    const fallbackAdjusted = applyLegacyMultiplier(fallbackRaw);
    const fb = clampApy(fallbackAdjusted);

    // only override if fallback looks sane (>0)
    if (fb > 0) {
      apy = fb;
      console.log('[DSF][APY] fallback used (yields.llama chart)', {
        fallbackRaw,
        fallbackAdjusted,
        finalApy: fb,
      });
      usedFallback = true;
    }
  }

  return [
    {
      pool: `${dsfPoolStables}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'dsf.finance',
      symbol: 'USDT-USDC-DAI',
      tvlUsd: format1e18ToNumber(tvl),
      apy,
      rewardTokens: [],
      underlyingTokens: [
        '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
        '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        '0x6B175474e89094C44Da98b954EedeAC495271d0F', // DAI
      ],
      poolMeta: usedFallback
      ? 'Stablecoin Yield Strategy (Curve & Convex) [fallback APY]'
      : 'Stablecoin Yield Strategy (Curve & Convex)',
      url: 'https://app.dsf.finance/',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: collectPools,
  url: 'https://dsf.finance/',
};
