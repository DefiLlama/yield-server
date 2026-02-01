const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const PAYOUT_EVENT =
  'event PayoutEvent(uint256 profit, uint256 newLiquidityIndex, uint256 excessProfit, uint256 insurancePremium, uint256 insuranceLoss)';

const CHAIN_TIMEOUT_MS = 60_000;

const BASE_URL = 'https://app.overnight.fi/market';

// Map symbol to URL path (lowercase, without '+')
const getPoolUrl = (symbol) => {
  const slug = symbol.toLowerCase().replace('+', '');
  return `${BASE_URL}/${slug}`;
};

const pools = [
  {
    chain: 'arbitrum',
    token: '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65',
    exchange: '0x73cb180bf0521828d8849bc8CF2B920918e23032',
    symbol: 'xUSD',
    decimals: 6,
  },
  {
    chain: 'arbitrum',
    token: '0xeb8E93A0c7504Bffd8A8fFa56CD754c63aAeBFe8',
    exchange: '0xc8261DC93428F0D2dC04D675b7852CdCdC19d4fd',
    symbol: 'DAI+',
    decimals: 18,
  },
  {
    chain: 'arbitrum',
    token: '0xb1084db8D3C05CEbd5FA9335dF95EE4b8a0edc30',
    exchange: '0x8b80Da76AAb8798Fd537A9A83f462CDA69eC1EE4',
    symbol: 'USDT+',
    decimals: 6,
  },
  {
    chain: 'arbitrum',
    token: '0xD4939D69B31fbE981ed6904A3aF43Ee1dc777Aab',
    exchange: '0xbb5ea28ec8044E3ce55c459C47EEDed8c6CB685f',
    symbol: 'ETH+',
    decimals: 18,
    priceFromCoingecko: 'ethereum',
  },
  {
    chain: 'base',
    token: '0xB79DD08EA68A908A97220C76d19A6aA9cBDE4376',
    exchange: '0x7cb1B38591021309C64f451859d79312d8Ca2789',
    symbol: 'USD+',
    decimals: 6,
  },
  {
    chain: 'base',
    token: '0x8cd408bBb63B804AFDcf2110A34E123B0F9BA132',
    exchange: '0xFa3743e120E7f6f620f930B4B15316dd90928Bfe',
    symbol: 'OVN+',
    decimals: 18,
    priceFromCoingecko: 'overnight-finance',
  },
  {
    chain: 'base',
    token: '0x65a2508C429a6078a7BC2f7dF81aB575BD9D9275',
    exchange: '0xF7d693CE960e70721F0353F967360046Ba7d4eFA',
    symbol: 'DAI+',
    decimals: 18,
  },
  {
    chain: 'base',
    token: '0x85483696Cc9970Ad9EdD786b2C5ef735F38D156f',
    exchange: '0x868D69875BF274E7Bd3d8b97b1Acd89dbdeb67af',
    symbol: 'USDC+',
    decimals: 6,
  },
  {
    chain: 'blast',
    token: '0x4fEE793d435c6D2c10C135983BB9d6D4fC7B9BBd',
    exchange: '0x46B0Bc31238195fBdc7258f91fE848FFFDe5d123',
    symbol: 'USD+',
    decimals: 18,
  },
  {
    chain: 'blast',
    token: '0x870a8F46b62B8BDeda4c02530C1750CddF2ED32e',
    exchange: '0x756D97C96aE80796C4c7A0ba4BfE607119366789',
    symbol: 'USDC+',
    decimals: 18,
  },
];

const SECONDS_PER_DAY = 86400;

// Calculate APY from a single payout event
// profit and totalSupply should be in the same units (tokens, not USD)
const calcApy = (profit, totalSupply, elapsedTime) => {
  if (profit === 0 || totalSupply === 0 || elapsedTime === 0) {
    return 0;
  }
  const dailyRate = (profit / totalSupply / elapsedTime) * SECONDS_PER_DAY;
  const apy = (dailyRate + 1) ** 365 - 1;
  return apy * 100;
};

// Wrap getEventLogs with timeout to prevent hanging
const getLogsWithTimeout = async (params, chain) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out fetching logs for ${chain}`)),
      CHAIN_TIMEOUT_MS
    );
  });

  return Promise.race([sdk.getEventLogs(params), timeoutPromise]).finally(() =>
    clearTimeout(timer)
  );
};

// Calculate average APY from multiple payout events
const calcAvgApy = (apyValues) => {
  if (apyValues.length === 0) return 0;
  const sum = apyValues.reduce((a, b) => a + b, 0);
  return sum / apyValues.length;
};

const apy = async () => {
  // Group pools by chain for efficient batching
  const poolsByChain = pools.reduce((acc, pool) => {
    if (!acc[pool.chain]) acc[pool.chain] = [];
    acc[pool.chain].push(pool);
    return acc;
  }, {});

  const chains = Object.keys(poolsByChain);

  // Batch fetch total supplies by chain (parallel across chains)
  const supplyResultsArray = await Promise.all(
    chains.map(async (chain) => {
      const chainPools = poolsByChain[chain];
      try {
        const { output } = await sdk.api.abi.multiCall({
          chain,
          abi: 'erc20:totalSupply',
          calls: chainPools.map((p) => ({ target: p.token })),
          permitFailure: true,
        });
        return { chain, results: output.map((o) => (o.success ? o.output : '0')) };
      } catch (e) {
        console.error(`Error fetching supplies for ${chain}: ${e.message}`);
        return { chain, results: chainPools.map(() => '0') };
      }
    })
  );

  const supplyResults = supplyResultsArray.reduce((acc, { chain, results }) => {
    acc[chain] = results;
    return acc;
  }, {});

  // Pre-fetch block info for each chain (avoids redundant lookups per pool)
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - SECONDS_PER_DAY * 7;

  const blockInfoArray = await Promise.all(
    chains.map(async (chain) => {
      try {
        const [currentBlock, block7d] = await Promise.all([
          sdk.api.util.getLatestBlock(chain),
          sdk.api.util.lookupBlock(sevenDaysAgo, chain),
        ]);
        return { chain, currentBlock: currentBlock.number, block7d: block7d.block };
      } catch (e) {
        console.error(`Error fetching blocks for ${chain}: ${e.message}`);
        return { chain, currentBlock: null, block7d: null };
      }
    })
  );

  const blockInfo = blockInfoArray.reduce((acc, info) => {
    acc[info.chain] = info;
    return acc;
  }, {});

  // Build price keys for batch fetch
  const priceKeys = pools
    .map((p) =>
      p.priceFromCoingecko
        ? `coingecko:${p.priceFromCoingecko}`
        : `${p.chain}:${p.token}`
    )
    .join(',');

  // Batch fetch all prices in one API call
  let prices = {};
  try {
    const priceResponse = await axios.get(
      `https://coins.llama.fi/prices/current/${priceKeys}`
    );
    prices = priceResponse.data.coins;
  } catch (e) {
    console.error(`Error fetching prices: ${e.message}`);
  }

  // Build lookup map for O(1) index access
  const poolIndexMap = {};
  for (const [chain, chainPools] of Object.entries(poolsByChain)) {
    poolIndexMap[chain] = {};
    chainPools.forEach((p, idx) => {
      poolIndexMap[chain][p.token] = idx;
    });
  }

  // Process each pool
  const results = await Promise.all(
    pools.map(async (pool) => {
      try {
        const { chain, token, exchange, symbol, decimals, priceFromCoingecko } =
          pool;
        const divisor = 10 ** decimals;

        // Get supply from batched results using O(1) lookup
        const chainIdx = poolIndexMap[chain][token];
        const totalSupplyRaw = supplyResults[chain][chainIdx];
        const totalSupply = Number(totalSupplyRaw) / divisor;

        if (totalSupply === 0) {
          return null;
        }

        // Get price from batched results
        const priceKey = priceFromCoingecko
          ? `coingecko:${priceFromCoingecko}`
          : `${chain}:${token}`;
        const price = prices[priceKey]?.price;

        // Skip if no price available
        if (!price || price === 0) {
          return null;
        }

        const tvlUsd = totalSupply * price;

        // Skip pools with very low TVL
        if (tvlUsd < 1000) {
          return null;
        }

        // Get recent payout events for APY calculation
        let apyBase = 0;
        let apyBase7d = 0;
        try {
          const { currentBlock, block7d } = blockInfo[chain];

          // Skip if block info failed to fetch
          if (!currentBlock || !block7d) {
            return {
              pool: `${token}-${chain}`.toLowerCase(),
              chain: utils.formatChain(chain),
              project: 'overnight-finance',
              symbol,
              tvlUsd,
              apyBase: 0,
              apyBase7d: 0,
              underlyingTokens: [token],
              url: getPoolUrl(symbol),
            };
          }

          const logs = (
            await getLogsWithTimeout(
              {
                target: exchange,
                eventAbi: PAYOUT_EVENT,
                fromBlock: block7d,
                toBlock: currentBlock,
                chain,
              },
              chain
            )
          ).sort((a, b) => b.blockNumber - a.blockNumber);

          if (logs.length >= 2) {
            // Get timestamps for consecutive events to calculate individual APYs
            const timestamps = await Promise.all(
              logs.slice(0, Math.min(logs.length, 8)).map((log) =>
                sdk.api.util.getTimestamp(log.blockNumber, chain)
              )
            );

            // Calculate APY for each payout event
            // Use totalSupply (in tokens) since profit is in tokens
            const apyValues = [];
            for (let i = 0; i < timestamps.length - 1; i++) {
              const profit = Number(logs[i].args.profit) / divisor;
              const elapsedTime = timestamps[i] - timestamps[i + 1];
              if (elapsedTime > 0 && profit > 0) {
                const eventApy = calcApy(profit, totalSupply, elapsedTime);
                // Filter out anomalous APYs (> 1000%)
                if (eventApy < 1000) {
                  apyValues.push(eventApy);
                }
              }
            }

            // apyBase = most recent payout APY
            if (apyValues.length > 0) {
              apyBase = apyValues[0];
            }

            // apyBase7d = average of all payouts in the window
            if (apyValues.length > 0) {
              apyBase7d = calcAvgApy(apyValues);
            }
          }
        } catch (e) {
          console.error(`Error fetching events for ${symbol} on ${chain}: ${e.message}`);
        }

        return {
          pool: `${token}-${chain}`.toLowerCase(),
          chain: utils.formatChain(chain),
          project: 'overnight-finance',
          symbol,
          tvlUsd,
          apyBase,
          apyBase7d,
          underlyingTokens: [token],
          url: getPoolUrl(symbol),
        };
      } catch (e) {
        console.error(`Error processing pool: ${e.message}`);
        return null;
      }
    })
  );

  return results.filter((pool) => pool !== null);
};

module.exports = {
  timetravel: false,
  apy,
};
