const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';

// Investorus Club FinLP (ERC-20 shares)
const investorusFinLP = '0x639F1822e58BbDc38D880f610b4bCeF907A94FCA';

const abi = {
  totalHoldings: 'uint256:totalHoldings',
  lpPrice: 'uint256:LPprice',
  totalSupply: 'uint256:totalSupply',
};

async function getBlockAtTs(chain, ts) {
  const url = `https://coins.llama.fi/block/${chain}/${ts}`;
  const res = await utils.getData(url);

  const height = res?.height ?? res?.block;
  if (height == null) throw new Error(`No block for ts=${ts}`);

  return height;
}

async function getLpPriceAtBlock(contractAddress, block) {
  const ts = await sdk.api.abi.call({
    target: contractAddress,
    abi: abi.totalSupply,
    chain: CHAIN,
    block,
  });

  const totalSupply = BigInt(ts.output);
  if (totalSupply === 0n) return null;

  try {
    const lp = await sdk.api.abi.call({
      target: contractAddress,
      abi: abi.LPprice,
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

function annualizeLinearFromGrowth(growthNum, growthDen, dtSeconds) {
  const yearSeconds = 365 * 24 * 60 * 60;
  if (!dtSeconds || dtSeconds <= 0) return 0;

  const num = Number(growthNum);
  const den = Number(growthDen);

  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;

  const r = num / den - 1;
  if (!Number.isFinite(r)) return 0;

  return (r * (yearSeconds / dtSeconds)) * 100;
}

function format1e6ToNumber(x) {
  const neg = x < 0n;
  const v = neg ? -x : x;

  const s = v.toString();
  const intPart = s.length > 6 ? s.slice(0, -6) : '0';
  const frac6 = s.length > 6
    ? s.slice(-6)
    : s.padStart(6, '0');

  const n = Number(`${intPart}.${frac6}`);
  return neg ? -n : n;
}

const collectPools = async () => {
  const tvl = await getTVL(investorusFinLP);

  const nowTs = Math.floor(Date.now() / 1000);
  const prevTs = nowTs - 24 * 60 * 60;

  const [blockNow, blockPrev] = await Promise.all([
    getBlockAtTs(CHAIN, nowTs),
    getBlockAtTs(CHAIN, prevTs),
  ]);

  const [lpNow, lpPrev] = await Promise.all([
    getLpPriceAtBlock(investorusFinLP, blockNow),
    getLpPriceAtBlock(investorusFinLP, blockPrev),
  ]);

  let apy = 0;

  if (lpNow && lpPrev && lpPrev > 0n) {
    const dtSeconds = 24 * 60 * 60;
    const SCALE = 10n ** 12n;
    const growthScaled = (lpNow * SCALE) / lpPrev;
    apy = annualizeLinearFromGrowth(growthScaled, SCALE, dtSeconds);
  }

  return [
    {
      pool: `${investorusFinLP}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'dsf-investorus-club',
      symbol: 'USDT-USDC-DAI',
      tvlUsd: format1e6ToNumber(tvl),
      apy,
      rewardTokens: null,
      underlyingTokens: [
        '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
        '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        '0x6B175474e89094C44Da98b954EedeAC495271d0F', // DAI
      ],
      poolMeta: 'WL Stablecoin Yield Strategy (powered by DSF.Finance) (Curve & Convex)',
      url: 'https://investorus.club/',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: collectPools,
  url: 'https://investorus.club/',
};
