const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const dsfPoolStables = '0x22586ea4fdaa9ef012581109b336f0124530ae69';

const abi = {
  totalHoldings: 'uint256:totalHoldings',
  lpPrice: 'uint256:lpPrice',
  totalSupply: 'uint256:totalSupply',
};

const WINDOW_DAYS = 3;
const WINDOW_SECONDS = WINDOW_DAYS * 24 * 60 * 60;
const SCALE = 10n ** 12n;

async function getBlockAtTs(chain, ts) {
  const url = `https://coins.llama.fi/block/${chain}/${ts}`;
  const res = await utils.getData(url);

  const height = res?.height ?? res?.block;
  if (height == null) {
    throw new Error(`DSF: no block for ts=${ts}`);
  }

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
  if (totalSupply === 0n) {
    throw new Error(`DSF: totalSupply is zero at block=${block}`);
  }

  const lp = await sdk.api.abi.call({
    target: contractAddress,
    abi: abi.lpPrice,
    chain: CHAIN,
    block,
  });

  const lpPrice = BigInt(lp.output);
  if (lpPrice <= 0n) {
    throw new Error(`DSF: lpPrice is invalid at block=${block}`);
  }

  return lpPrice;
}

async function getTVL(contractAddress, block) {
  const tvlResponse = await sdk.api.abi.call({
    target: contractAddress,
    abi: abi.totalHoldings,
    chain: CHAIN,
    block,
  });

  const tvl = BigInt(tvlResponse.output);
  if (tvl < 0n) {
    throw new Error(`DSF: negative TVL at block=${block}`);
  }

  return tvl;
}

function annualizeLinearFromGrowth(growthNum, growthDen, dtSeconds) {
  const yearSeconds = 365 * 24 * 60 * 60;
  if (!dtSeconds || dtSeconds <= 0) {
    throw new Error(`DSF: invalid dtSeconds=${dtSeconds}`);
  }

  const num = Number(growthNum);
  const den = Number(growthDen);

  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    throw new Error('DSF: invalid growth ratio');
  }

  const r = num / den - 1;
  if (!Number.isFinite(r)) {
    throw new Error('DSF: invalid annualization ratio');
  }

  return (r * (yearSeconds / dtSeconds)) * 100;
}

function format1e18ToNumber(x) {
  const neg = x < 0n;
  const v = neg ? -x : x;

  const s = v.toString();
  const intPart = s.length > 18 ? s.slice(0, -18) : '0';
  const frac6 = s.length > 18
    ? s.slice(-18, -12)
    : s.padStart(18, '0').slice(0, 6);

  const n = Number(`${intPart}.${frac6}`);
  return neg ? -n : n;
}

const collectPools = async (timestamp = Math.floor(Date.now() / 1000)) => {
  try {
    const nowTs = timestamp;
    const prevTs = nowTs - WINDOW_SECONDS;

    const [blockNow, blockPrev] = await Promise.all([
      getBlockAtTs(CHAIN, nowTs),
      getBlockAtTs(CHAIN, prevTs),
    ]);

    const [tvl, lpNow, lpPrev] = await Promise.all([
      getTVL(dsfPoolStables, blockNow),
      getLpPriceAtBlock(dsfPoolStables, blockNow),
      getLpPriceAtBlock(dsfPoolStables, blockPrev),
    ]);

    const growthScaled = (lpNow * SCALE) / lpPrev;
    let apy = annualizeLinearFromGrowth(growthScaled, SCALE, WINDOW_SECONDS);

    if (apy < 0) apy = 0;
    
    if (!Number.isFinite(apy)) {
      throw new Error('DSF: APY is not finite');
    }

    return [
      {
        pool: `${dsfPoolStables}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: 'dsf.finance',
        symbol: 'USDT-USDC-DAI',
        tvlUsd: format1e18ToNumber(tvl),
        apy,
        rewardTokens: null,
        underlyingTokens: [
          '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          '0x6B175474e89094C44Da98b954EedeAC495271d0F',
        ],
        poolMeta: 'Stablecoin Yield Strategy (Curve & Convex)',
        url: 'https://app.dsf.finance/',
      },
    ];
  } catch (e) {
    console.log('[DSF] Adapter failed:', e?.message ?? String(e));
    return [];
  }
};

module.exports = {
  timetravel: true,
  apy: collectPools,
  url: 'https://dsf.finance/',
};
