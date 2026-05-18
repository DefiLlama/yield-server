const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const utils = require('../utils');

// === GBLIN V5 — Base mainnet ===
const GBLIN_V5 = '0x38DcDB3A381677239BBc652aed9811F2f8496345';

// Underlying basket
const WETH = '0x4200000000000000000000000000000000000006';
const CBTC = '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Event: Minted(address indexed user, uint256 ethIn, uint256 gblinOut)
const MINTED_TOPIC = ethers.utils.id('Minted(address,uint256,uint256)');

// Stability Fee = 5 BPS (0.05%) — funds NAV appreciation via distributeYield()
const STABILITY_FEE_BPS = 5;
const BPS_DENOMINATOR = 10000;

// Lookback window for APY estimation. Kept short to (a) stay within RPC log
// limits when chunking and (b) limit price-drift error from converting ETH
// volumes at the end of the window using the current ETH price.
const LOOKBACK_DAYS = 7;
const BLOCKS_PER_DAY_BASE = 43200; // Base ~2s blocks (approx, used only for window sizing)
const CHUNK_SIZE = 9000; // safe under typical eth_getLogs caps (10k)

// Fetch logs in chunks to stay under provider limits
const fetchLogsChunked = async (fromBlock, toBlock) => {
  const all = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
    try {
      const res = await sdk.api.util.getLogs({
        target: GBLIN_V5,
        topic: MINTED_TOPIC,
        fromBlock: start,
        toBlock: end,
        chain: 'base',
        keys: [],
      });
      if (Array.isArray(res?.output)) all.push(...res.output);
    } catch (e) {
      // Log and continue: a single failed chunk shouldn't tank the whole APY.
      // We surface the failure but keep aggregating partial data.
      console.warn(
        `GBLIN: getLogs chunk ${start}-${end} failed: ${e.message}`
      );
    }
  }
  return all;
};

const getApy = async () => {
  try {
    // 1) Fetch TVL from DefiLlama protocol API (already computed by tvl adapter)
    const protocolData = await utils.getData(
      'https://api.llama.fi/protocol/global-balanced-liquidity-index'
    );

    if (!protocolData?.tvl?.length) {
      console.warn('GBLIN: TVL array empty or missing');
      return [];
    }

    const latest = protocolData.tvl[protocolData.tvl.length - 1];
    const tvlUsd = latest?.totalLiquidityUSD;

    // Allow tiny but valid pools through; only drop if TVL is missing or non-positive.
    if (typeof tvlUsd !== 'number' || tvlUsd <= 0) {
      console.warn(`GBLIN: invalid TVL (${tvlUsd})`);
      return [];
    }
    if (tvlUsd < 100) {
      console.warn(`GBLIN: tiny TVL (${tvlUsd}) — pool still reported`);
    }

    // 2) Sum Minted event ETH volumes over the lookback window (chunked)
    const currentBlock = await sdk.api.util.getLatestBlock('base');
    const fromBlock = Math.max(
      0,
      currentBlock.number - BLOCKS_PER_DAY_BASE * LOOKBACK_DAYS
    );

    const logs = await fetchLogsChunked(fromBlock, currentBlock.number);

    let totalVolumeWei = 0n;
    for (const log of logs) {
      // Defensive: malformed entries shouldn't crash the loop
      if (typeof log?.data !== 'string') continue;
      const dataHex = log.data.startsWith('0x') ? log.data.slice(2) : log.data;
      if (dataHex.length < 64) continue;
      // log.data = abi.encode(ethIn, gblinOut) -> first 32 bytes = ethIn
      const ethInHex = '0x' + dataHex.slice(0, 64);
      try {
        totalVolumeWei += BigInt(ethInHex);
      } catch (_) {
        // Skip non-hex / corrupted entries silently
        continue;
      }
    }

    let apyBase = 0;

    if (totalVolumeWei > 0n) {
      // Compute fees in ETH first to minimize price-drift bias, then convert
      // the annualized total to USD ONCE using the current ETH price. This is
      // internally consistent with `tvlUsd` (also a current snapshot).
      const totalVolumeEth = Number(totalVolumeWei) / 1e18;
      const periodFeesEth =
        totalVolumeEth * (STABILITY_FEE_BPS / BPS_DENOMINATOR);
      const annualizedFeesEth = periodFeesEth * (365 / LOOKBACK_DAYS);

      const priceResp = await utils.getData(
        'https://coins.llama.fi/prices/current/coingecko:ethereum'
      );
      const ethUsd = priceResp?.coins?.['coingecko:ethereum']?.price;

      if (typeof ethUsd === 'number' && ethUsd > 0) {
        const annualizedFeesUsd = annualizedFeesEth * ethUsd;
        apyBase = (annualizedFeesUsd / tvlUsd) * 100;
      }
    }

    return [
      {
        pool: `${GBLIN_V5}-base`.toLowerCase(),
        chain: utils.formatChain('base'),
        project: 'gblin',
        symbol: 'GBLIN',
        tvlUsd,
        apyBase,
        underlyingTokens: [WETH, CBTC, USDC],
        poolMeta:
          'NAV appreciation from protocol fees (0.05% stability fee per mint)',
        url: 'https://gblin.digital/',
      },
    ];
  } catch (err) {
    console.error('GBLIN adapter error:', err.message);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://gblin.digital/',
};
