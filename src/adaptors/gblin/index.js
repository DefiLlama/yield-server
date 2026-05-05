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

// Lookback window for APY estimation
const LOOKBACK_DAYS = 30;
const BLOCKS_PER_DAY_BASE = 43200; // Base ~2s blocks

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

    if (!tvlUsd || tvlUsd < 100) {
      console.warn(`GBLIN: TVL below threshold (${tvlUsd})`);
      return [];
    }

    // 2) Sum Minted event ETH volumes over the last LOOKBACK_DAYS days
    const currentBlock = await sdk.api.util.getLatestBlock('base');
    const fromBlock = Math.max(
      0,
      currentBlock.number - BLOCKS_PER_DAY_BASE * LOOKBACK_DAYS
    );

    const logs = await sdk.api.util.getLogs({
      target: GBLIN_V5,
      topic: MINTED_TOPIC,
      fromBlock,
      toBlock: currentBlock.number,
      chain: 'base',
      keys: [],
    });

    let totalVolumeWei = 0n;
    for (const log of logs?.output || []) {
      // log.data = abi.encode(ethIn, gblinOut) -> first 32 bytes = ethIn
      const dataHex = log.data.startsWith('0x') ? log.data.slice(2) : log.data;
      if (dataHex.length < 64) continue;
      const ethInHex = '0x' + dataHex.slice(0, 64);
      totalVolumeWei += BigInt(ethInHex);
    }

    let apyBase = 0;

    if (totalVolumeWei > 0n) {
      // Convert ETH volume to USD (current ETH price)
      const priceResp = await utils.getData(
        'https://coins.llama.fi/prices/current/coingecko:ethereum'
      );
      const ethUsd = priceResp?.coins?.['coingecko:ethereum']?.price;

      if (ethUsd && ethUsd > 0) {
        const totalVolumeEth = Number(totalVolumeWei) / 1e18;
        const totalVolumeUsd = totalVolumeEth * ethUsd;

        // Stability fees accrued in window = volume * 0.05%
        const periodFeesUsd =
          totalVolumeUsd * (STABILITY_FEE_BPS / BPS_DENOMINATOR);

        // Annualize (period -> 365d)
        const annualizedFeesUsd = periodFeesUsd * (365 / LOOKBACK_DAYS);

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
