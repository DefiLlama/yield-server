const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const dsfPoolStables = '0x22586ea4fdaa9ef012581109b336f0124530ae69';

const abi = {
  totalHoldings: 'uint256:totalHoldings',
  lpPrice: 'uint256:lpPrice',
  totalSupply: 'uint256:totalSupply',
};

const APY_WINDOW_DAYS = [1, 3, 7];
const SCALE = 10n ** 12n;
const BLOCK_FALLBACK_OFFSETS = [0, -1, 1, -2, 2];

async function getBlockAtTs(chain, ts) {
  const url = `https://coins.llama.fi/block/${chain}/${ts}`;
  const res = await utils.getData(url);

  const height = res?.height ?? res?.block;
  if (height == null) {
    throw new Error(`DSF: no block for ts=${ts}`);
  }

  return height;
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
      // пробуем следующий соседний блок
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

async function getBestApy(contractAddress, nowTs, blockNow) {
  const errors = [];

  for (const days of APY_WINDOW_DAYS) {
    const dtSeconds = days * 24 * 60 * 60;
    const prevTs = nowTs - dtSeconds;

    try {
      const blockPrev = await getBlockAtTs(CHAIN, prevTs);

      const [lpNow, lpPrev] = await Promise.all([
        getLpPriceAtBlock(contractAddress, blockNow),
        getLpPriceAtBlock(contractAddress, blockPrev),
      ]);

      const growthScaled = (lpNow * SCALE) / lpPrev;
      const apy = annualizeLinearFromGrowth(growthScaled, SCALE, dtSeconds);

      if (Number.isFinite(apy) && apy > 0) {
        return apy;
      }

      errors.push(`window=${days}d produced non-positive or non-finite APY`);
    } catch (e) {
      errors.push(`window=${days}d failed: ${e?.message ?? String(e)}`);
    }
  }

  throw new Error(
    `DSF: APY fallback exhausted. ${errors.join(' | ')}`
  );
}

const collectPools = async (timestamp = Math.floor(Date.now() / 1000)) => {
  try {
    const nowTs = timestamp;
    const blockNow = await getBlockAtTs(CHAIN, nowTs);

    const [tvl, apy] = await Promise.all([
      getTVL(dsfPoolStables, blockNow),
      getBestApy(dsfPoolStables, nowTs, blockNow),
    ]);

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
