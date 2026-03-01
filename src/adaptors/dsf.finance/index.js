const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const dsfPoolStables = '0x22586ea4fdaa9ef012581109b336f0124530ae69';

const abi = {
  totalHoldings: 'uint256:totalHoldings',
  lpPrice: 'uint256:lpPrice',
  totalSupply: 'uint256:totalSupply',
};

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

const collectPools = async () => {
  const tvl = await getTVL(dsfPoolStables);

  const nowTs = Math.floor(Date.now() / 1000);
  const prevTs = nowTs - 24 * 60 * 60;

  const [blockNow, blockPrev] = await Promise.all([
    getBlockAtTs(CHAIN, nowTs),
    getBlockAtTs(CHAIN, prevTs),
  ]);

  const [lpNow, lpPrev] = await Promise.all([
    getLpPriceAtBlock(dsfPoolStables, blockNow),
    getLpPriceAtBlock(dsfPoolStables, blockPrev),
  ]);

  let apy = 0;

  if (lpNow && lpPrev && lpPrev > 0n) {
    // fixed 24h window (deterministic & CI-safe)
    const dtSeconds = 24 * 60 * 60;

    // Downscale ratio to avoid Number overflow; 1e12 precision is enough for APY
    const SCALE = 10n ** 12n;
    const growthScaled = (lpNow * SCALE) / lpPrev; // (lpNow/lpPrev) scaled by 1e12

    apy = annualizeCompoundingFromGrowth(growthScaled, SCALE, dtSeconds);

    // Clamp to avoid extreme spikes due to oracle/block mismatch or edge cases
    apy = Math.max(Math.min(apy, 5000), -100);
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
  timetravel: false,
  apy: collectPools,
  url: 'https://dsf.finance/',
};
