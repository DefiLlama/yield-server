const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const dsfPoolStables = '0x22586ea4fdaa9ef012581109b336f0124530ae69';

const abi = {
  totalHoldings: 'uint256:totalHoldings',
  lpPrice: 'uint256:lpPrice',
};

const SCALE = 10n ** 18n;

// coins.llama.fi: timestamp -> closest block
async function getBlockAtTs(chain, ts) {
  const url = `https://coins.llama.fi/block/${chain}/${ts}`;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await utils.getData(url);
      const height = res?.height ?? res?.block;
      if (height != null) return height;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250 * (i + 1)));
  }
  return null; // apy=0
}

async function getLpPriceAtBlock(contractAddress, block) {
  try {
    const lp = await sdk.api.abi.call({
      target: contractAddress,
      abi: abi.lpPrice,
      chain: CHAIN,
      block,
    });

    const v = BigInt(lp.output);

    if (v === 0n) return null;

    return v;
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

async function getTVL(contractAddress, block) {
  const tvlResponse = await sdk.api.abi.call({
    target: contractAddress,
    abi: abi.totalHoldings,
    chain: CHAIN,
    ...(block ? { block } : {}), 
  });
  return BigInt(tvlResponse.output);
}

function ratio1e18ToFloat(x1e18) {
  const s = x1e18.toString().padStart(19, '0');
  const intPart = s.slice(0, -18);
  const frac = s.slice(-18, -6); // 12 decimals
  return Number(`${intPart}.${frac}`);
}

// growthScaled1e18 = (lpNow * 1e18) / lpPrev  => ratio * 1e18
function annualizeFromRatio1e18(growthScaled1e18, dtSeconds) {
  if (!dtSeconds || dtSeconds <= 0) return 0;

  const ratio = ratio1e18ToFloat(growthScaled1e18); // ~1.0000x
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;

  const periodsPerYear = (365 * 24 * 60 * 60) / dtSeconds;
  const apy = (Math.pow(ratio, periodsPerYear) - 1) * 100;

  return Number.isFinite(apy) ? apy : 0;
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

// --------- main ---------

const collectPools = async (timestamp = Math.floor(Date.now()/1000)) => {

  const nowTs = timestamp;
  const DAYS = 3;
  const prevTs = nowTs - DAYS * 24 * 60 * 60;

  const [blockNow, blockPrev] = await Promise.all([
    getBlockAtTs(CHAIN, nowTs),
    getBlockAtTs(CHAIN, prevTs),
  ]);

  const tvl = await getTVL(dsfPoolStables, blockNow ?? undefined);

  // IMPORTANT: use fallback by blocks
  const [lpNow, lpPrev] = await Promise.all([
    blockNow ? getLpPriceAtBlockWithFallback(dsfPoolStables, blockNow) : null,
    blockPrev ? getLpPriceAtBlockWithFallback(dsfPoolStables, blockPrev) : null,
  ]);
  
  let apy = 0;
  if (lpNow && lpPrev && lpPrev > 0n) {
    const dtSeconds = DAYS * 24 * 60 * 60;
    const growthScaled = (lpNow * SCALE) / lpPrev;
    apy = clampApy(annualizeFromRatio1e18(growthScaled, dtSeconds));
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
      poolMeta: 'Stablecoin Yield Strategy (Curve & Convex)',
      url: 'https://app.dsf.finance/',
    },
  ];
};

module.exports = {
  timetravel: true,
  apy: collectPools,
  url: 'https://dsf.finance/',
};
