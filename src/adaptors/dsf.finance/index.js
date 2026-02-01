const sdk = require('@defillama/sdk');
const utils = require('../utils');

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
  if (!res || res.height == null) throw new Error(`No block for ts=${ts}`);
  return res.height;
}

async function getBlockTimestamp(chain, block) {
  const blockRes = await sdk.api.util.getBlock(block, chain); // returns { timestamp, ... }
  return Number(blockRes.timestamp);
}

async function getLpPriceAtBlock(contractAddress, block) {
   // avoid revert if totalSupply == 0
  const ts = await sdk.api.abi.call({
    target: contractAddress,
    abi: abi.totalSupply,
    chain: 'ethereum',
    block,
  });

  const totalSupply = BigInt(ts.output);
  if (totalSupply === 0n) return null; // treat as "no price"

  const lp = await sdk.api.abi.call({
    target: contractAddress,
    abi: abi.lpPrice,
    chain: 'ethereum',
    block,
  });

  return BigInt(lp.output); // 1e18-scaled
}

async function getTVL(contractAddress) {
  const tvlResponse = await sdk.api.abi.call({
    target: contractAddress,
    abi: abi.totalHoldings,
    chain: 'ethereum',
  });
  return BigInt(tvlResponse.output);
}

function annualizeLinearFromGrowth(growthNum, growthDen, dtSeconds) {
  // growth = growthNum/growthDen
  // daily return r = growth - 1 = (num-den)/den
  // apy = r * (yearSeconds/dtSeconds) * 100
  const yearSeconds = 365 * 24 * 60 * 60;

  const num = Number(growthNum);
  const den = Number(growthDen);

  if (!isFinite(num) || !isFinite(den) || den === 0) return 0;

  const r = num / den - 1;
  return (r * (yearSeconds / dtSeconds)) * 100;
}

const collectPools = async () => {
  const tvl = await getTVL(dsfPoolStables);

  const nowTs = Math.floor(Date.now() / 1000);
  const prevTs = nowTs - 24 * 60 * 60;

  const [blockNow, blockPrev] = await Promise.all([
    getBlockAtTs('ethereum', nowTs),
    getBlockAtTs('ethereum', prevTs),
  ]);

  const [lpNow, lpPrev] = await Promise.all([
    getLpPriceAtBlock(dsfPoolStables, blockNow),
    getLpPriceAtBlock(dsfPoolStables, blockPrev),
  ]);

  let apy = 0;

  if (lpNow && lpPrev && lpPrev > 0n) {
    // use real dt between the two chosen blocks
    const [tsNowBlock, tsPrevBlock] = await Promise.all([
      getBlockTimestamp('ethereum', blockNow),
      getBlockTimestamp('ethereum', blockPrev),
    ]);

    const dtSeconds = Math.max(1, tsNowBlock - tsPrevBlock);

    // Convert BigInt ratio to float safely-ish:
    // We downscale to avoid Number overflow:
    // Using 1e12 precision is plenty for APY.
    const SCALE = 10n ** 12n;
    const growthScaled = (lpNow * SCALE) / lpPrev; // scaled by 1e12
    // growthScaled / 1e12 is growth

    apy = annualizeLinearFromGrowth(growthScaled, SCALE, dtSeconds);

    // optional clamp
    // apy = Math.max(Math.min(apy, 5000), -100);
  }

  return [
    {
      pool: `${dsfPoolStables}-ethereum`,
      chain: utils.formatChain('ethereum'),
      project: 'dsf.finance',
      symbol: 'USDT-USDC-DAI',
      tvlUsd: Number(tvl) / 1e18,
      apy,
      rewardTokens: null,
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
