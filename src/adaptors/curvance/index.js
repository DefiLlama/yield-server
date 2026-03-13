const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const { getDynamicMarketDataAbi } = require('./abi');

const SECONDS_PER_YEAR = 365 * 24 * 3600; // 31_536_000

// Rates are per-second in WAD (1e18 = 100% per second)
const calcApy = (ratePerSecond) => {
  const rate = Number(ratePerSecond) / 1e18;
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return rate * SECONDS_PER_YEAR * 100;
};

const getPrices = async (addresses) => {
  if (!addresses.length) {
    return {};
  }
  
  const chunkSize = 50;
  const prices = {};
  for (let i = 0; i < addresses.length; i += chunkSize) {
    const chunk = addresses.slice(i, i + chunkSize);
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/current/${chunk.join(',')}`
    );
    for (const [key, val] of Object.entries(data.coins)) {
      prices[key.split(':')[1].toLowerCase()] = val.price;
    }
  }
  return prices;
};

const config = {
  monad: {
    centralRegistry: '0x1310f352f1389969Ece6741671c4B919523912fF',
    protocolReader: '0x878cDfc2F3D96a49A5CbD805FAF4F3080768a6d2',
  },
};

const getPoolsForChain = async (chain, { centralRegistry, protocolReader }) => {
  const managersRes = await sdk.api.abi.call({
    target: centralRegistry,
    chain,
    abi: 'address[]:marketManagers',
    permitFailure: true,
  });
  const managers = managersRes.output;
  if (!managers || !managers.length) {
    return [];
  }

  const marketsRes = await sdk.api.abi.multiCall({
    chain,
    abi: 'address[]:queryTokensListed',
    calls: managers.map((addr) => ({ target: addr })),
    permitFailure: true,
  });

  // Preserve manager -> market mapping for poolMeta
  const marketToManager = {};
  const markets = [];
  for (let i = 0; i < managers.length; i++) {
    const list = marketsRes.output[i].output || [];
    for (const addr of list) {
      markets.push(addr);
      marketToManager[addr.toLowerCase()] = managers[i].toLowerCase();
    }
  }

  if (!markets.length) {
    return [];
  }

  const underlyingRes = await sdk.api.abi.multiCall({
    chain,
    abi: 'address:asset',
    calls: markets.map((addr) => ({ target: addr })),
    permitFailure: true,
  });
  const underlyings = underlyingRes.output.map((res) =>  
    res.success ? res.output : null  
  ); 

  // Fetch dynamic market data (rates, debt, liquidity) + token metadata
  const [dynamicDataRes, symbolRes, decimalsRes] = await Promise.all([
    sdk.api.abi.call({
      target: protocolReader,
      chain,
      abi: getDynamicMarketDataAbi,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: 'string:symbol',
      calls: underlyings.map((addr) => ({
        target: addr,
      })),
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: 'uint8:decimals',
      calls: underlyings.map((addr) => ({
        target: addr,
      })),
      permitFailure: true,
    }),
  ]);

  // Index dynamic data by market token address for O(1) lookup
  const dynamicData = dynamicDataRes.output || [];
  const dynamicByMarket = {};
  for (const manager of dynamicData) {
    for (const token of (manager.tokens || [])) {
      dynamicByMarket[token._address.toLowerCase()] = token;
    }
  }

  const symbols = symbolRes.output.map((res) =>  
    res.success ? res.output : null  
  );  
  const allDecimals = decimalsRes.output.map((res) =>  
    res.success ? res.output : null  
  );

  // Build manager -> symbols map for poolMeta disambiguation
  const managerSymbols = {};
  markets.forEach((market, i) => {
    const manager = marketToManager[market.toLowerCase()];
    if (!manager || !symbols[i]) {
      return;
    }
    if (!managerSymbols[manager]) {
      managerSymbols[manager] = [];
    }
    managerSymbols[manager].push(symbols[i]);
  });

  const uniqueUnderlyings = [
    ...new Set(underlyings.filter(Boolean).map((a) => a.toLowerCase())),
  ];
  const prices = await getPrices(
    uniqueUnderlyings.map((a) => `${chain}:${a}`)
  );

  return markets
    .map((market, i) => {
      const marketData = dynamicByMarket[market.toLowerCase()];

      const underlying = underlyings[i];
      const symbol = symbols[i];
      const decimals = Number(allDecimals[i]) || 18;
      const price = underlying ? prices[underlying.toLowerCase()] ?? 0 : 0;

      if (!symbol || !underlying || !price) {
        return null;
      }

      const factor = 10 ** decimals;
      const cash = marketData ? Number(marketData.liquidity) : 0;
      const debt = marketData ? Number(marketData.debt) : 0;

      const totalSupplyUsd = ((cash + debt) / factor) * price;
      const totalBorrowUsd = (debt / factor) * price;
      const tvlUsd = (cash / factor) * price;

      const apyBase = calcApy(marketData ? marketData.supplyRate : '0');
      const isBorrowable = marketData ? Number(marketData.borrowRate) > 0 : false;
      const apyBaseBorrow = isBorrowable ? calcApy(marketData.borrowRate) : null;

      const manager = marketToManager[market.toLowerCase()];
      const poolMeta = managerSymbols[manager].join("/");

      return {
        pool: `${market.toLowerCase()}-${chain}`,
        chain: utils.formatChain(chain),
        project: 'curvance',
        symbol: utils.formatSymbol(symbol),
        tvlUsd,
        apyBase,
        poolMeta,
        ...(isBorrowable && {
          apyBaseBorrow,
          totalSupplyUsd,
          totalBorrowUsd,
          borrowable: true,
        }),
        underlyingTokens: [underlying],
        url: 'https://app.curvance.com',
      };
    })
    .filter(Boolean);
};

const main = async () => {
  const results = await Promise.all(
    Object.entries(config).map(([chain, addresses]) =>
      getPoolsForChain(chain, addresses)
    )
  );
  return results.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.curvance.com',
};
