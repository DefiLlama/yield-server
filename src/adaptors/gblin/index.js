const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const utils = require('../utils');

// GBLIN V6 — Base mainnet
const GBLIN_V6 = '0x36C81d7E1966310F305eA637e761Cf77F90852f0';

// Underlying basket
const WETH = '0x4200000000000000000000000000000000000006';
const CBTC = '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Event: Minted(address indexed user, uint256 ethIn, uint256 gblinOut)
const MINTED_TOPIC = ethers.utils.id('Minted(address,uint256,uint256)');

// Stability Fee = 5 BPS (0.05%) — funds NAV appreciation via distributeYield()
const STABILITY_FEE_BPS = 5;
const BPS_DENOMINATOR = 10000;

// 7-day window: stays within RPC log limits when chunking
const LOOKBACK_DAYS = 7;
const BLOCKS_PER_DAY_BASE = 43200; // Base ~2s blocks
const CHUNK_SIZE = 9000;

const fetchLogsChunked = async (fromBlock, toBlock) => {
  const all = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
    try {
      const res = await sdk.api.util.getLogs({
        target: GBLIN_V6,
        topic: MINTED_TOPIC,
        fromBlock: start,
        toBlock: end,
        chain: 'base',
        keys: [],
      });
      if (Array.isArray(res?.output)) all.push(...res.output);
    } catch (e) {
      console.warn(`GBLIN: getLogs chunk ${start}-${end} failed: ${e.message}`);
    }
  }
  return all;
};

const getApy = async () => {
  try {
    const protocolData = await utils.getData(
      'https://api.llama.fi/protocol/global-balanced-liquidity-index'
    );

    if (!protocolData?.tvl?.length) {
      console.warn('GBLIN: TVL array empty or missing');
      return [];
    }

    const latest = protocolData.tvl[protocolData.tvl.length - 1];
    const tvlUsd = latest?.totalLiquidityUSD;

    if (typeof tvlUsd !== 'number' || tvlUsd <= 0) {
      console.warn(`GBLIN: invalid TVL (${tvlUsd})`);
      return [];
    }

    const currentBlock = await sdk.api.util.getLatestBlock('base');
    const fromBlock = Math.max(
      0,
      currentBlock.number - BLOCKS_PER_DAY_BASE * LOOKBACK_DAYS
    );

    const logs = await fetchLogsChunked(fromBlock, currentBlock.number);

    let totalVolumeWei = 0n;
    for (const log of logs) {
      if (typeof log?.data !== 'string') continue;
      const dataHex = log.data.startsWith('0x') ? log.data.slice(2) : log.data;
      if (dataHex.length < 64) continue;
      const ethInHex = '0x' + dataHex.slice(0, 64);
      try {
        totalVolumeWei += BigInt(ethInHex);
      } catch (_) {
        continue;
      }
    }

    let apyBase = 0;

    if (totalVolumeWei > 0n) {
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
        pool: `${GBLIN_V6}-base`.toLowerCase(),
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
