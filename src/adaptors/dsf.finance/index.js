const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const dsfPoolStables = '0x22586ea4fdaa9ef012581109b336f0124530ae69';

const abi = {
  totalHoldings: 'uint256:totalHoldings',
  lpPrice: 'uint256:lpPrice',
  totalSupply: 'uint256:totalSupply',
};

const APY_DAYS = 7;

const SCALE = 10n ** 12n;
const BLOCK_FALLBACK_OFFSETS = [0, -5, 5, -25, 25, -100, 100, -300, 300];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getBlockAtTs(chain, ts) {
  const url = `https://coins.llama.fi/block/${chain}/${ts}`;
  let lastError;

  for (let i = 0; i < 4; i++) {
    try {
      const res = await utils.getData(url);
      const height = res?.height ?? res?.block;

      if (height == null) {
        throw new Error(`DSF: no block in response for ts=${ts}`);
      }

      return height;
    } catch (e) {
      lastError = e;
      await sleep(250 * (i + 1));
    }
  }

  throw new Error(`DSF: no block for ts=${ts}; ${lastError?.message ?? String(lastError)}`);
}

async function callBigIntAtBlockWithFallback(contractAddress, abiFragment, block, label) {
  const tried = [];

  for (const offset of BLOCK_FALLBACK_OFFSETS) {
    const candidateBlock = block + offset;
    if (candidateBlock <= 0) continue;

    tried.push(candidateBlock);

    try {
      const res = await sdk.api.abi.call({
        target: contractAddress,
        abi: abiFragment,
        chain: CHAIN,
        block: candidateBlock,
      });

      return {
        value: BigInt(res.output),
        block: candidateBlock,
      };
    } catch (e) {
      // try next nearby block
    }
  }

  throw new Error(
    `DSF: failed to read ${label}; originalBlock=${block}; triedBlocks=${tried.join(',')}`,
  );
}

async function getLpPriceAtBlock(contractAddress, block) {
  const totalSupplyResult = await callBigIntAtBlockWithFallback(
    contractAddress,
    abi.totalSupply,
    block,
    'totalSupply',
  );

  if (totalSupplyResult.value === 0n) {
    throw new Error(
      `DSF: totalSupply is zero near block=${block}; resolvedBlock=${totalSupplyResult.block}`,
    );
  }

  const lpPriceResult = await callBigIntAtBlockWithFallback(
    contractAddress,
    abi.lpPrice,
    block,
    'lpPrice',
  );

  if (lpPriceResult.value <= 0n) {
    throw new Error(
      `DSF: lpPrice is invalid near block=${block}; resolvedBlock=${lpPriceResult.block}`,
    );
  }

  return lpPriceResult.value;
}

async function getTVL(contractAddress, block) {
  const tvlResult = await callBigIntAtBlockWithFallback(
    contractAddress,
    abi.totalHoldings,
    block,
    'totalHoldings',
  );

  if (tvlResult.value < 0n) {
    throw new Error(
      `DSF: totalHoldings is negative near block=${block}; resolvedBlock=${tvlResult.block}`,
    );
  }

  return tvlResult.value;
}

function annualizeFromGrowth(growthNum, growthDen, dtSeconds) {
  if (!dtSeconds || dtSeconds <= 0) {
    throw new Error(`DSF: invalid dtSeconds=${dtSeconds}`);
  }

  const ratio = Number(growthNum) / Number(growthDen);

  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error('DSF: invalid growth ratio');
  }

  const periodsPerYear = (365 * 24 * 60 * 60) / dtSeconds;
  const apy = (Math.pow(ratio, periodsPerYear) - 1) * 100;

  if (!Number.isFinite(apy)) {
    throw new Error('DSF: invalid annualized APY');
  }

  return apy;
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

async function getApyForDaysFromLpNow(contractAddress, nowTs, lpNow, days) {
  const dtSeconds = days * 24 * 60 * 60;
  const prevTs = nowTs - dtSeconds;
  const blockPrev = await getBlockAtTs(CHAIN, prevTs);
  const lpPrev = await getLpPriceAtBlock(contractAddress, blockPrev);

  if (lpPrev <= 0n) {
    throw new Error(`DSF: lpPrev is invalid for ${days}d window`);
  }

  const growthScaled = (lpNow * SCALE) / lpPrev;
  const apy = annualizeFromGrowth(growthScaled, SCALE, dtSeconds);

  if (!Number.isFinite(apy)) {
    throw new Error(`DSF: APY ${days}d is not finite`);
  }

  return apy;
}

const collectPools = async (timestamp = Math.floor(Date.now() / 1000)) => {
  try {
    const nowTs = timestamp;
    const blockNow = await getBlockAtTs(CHAIN, nowTs);

    const [tvl, lpNow] = await Promise.all([
      getTVL(dsfPoolStables, blockNow),
      getLpPriceAtBlock(dsfPoolStables, blockNow),
    ]);

    const apyBase = await getApyForDaysFromLpNow(dsfPoolStables, nowTs, lpNow, APY_DAYS);

    if (!Number.isFinite(apyBase)) {
      throw new Error('DSF: APY is not finite');
    }

    return [
      {
        pool: `${dsfPoolStables}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: 'dsf.finance',
        symbol: 'USDT-USDC-DAI',
        tvlUsd: format1e18ToNumber(tvl),
        apyBase,
        rewardTokens: [],
        underlyingTokens: [
          '0xdac17f958d2ee523a2206206994597c13d831ec7',
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          '0x6b175474e89094c44da98b954eedeac495271d0f',
        ],
        poolMeta: 'Stablecoin Yield Strategy (Curve & Convex)',
        url: 'https://app.dsf.finance/',
      },
    ];
  } catch (e) {
    console.log(`[DSF] Adapter failed at ts=${timestamp}:`, e?.message ?? String(e));
    return [];
  }
};

module.exports = {
  timetravel: true,
  apy: collectPools,
  url: 'https://dsf.finance/',
};
