const BN = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const DualV1 = require('./abis/v1/Dual.json');
const DualV2 = require('./abis/v2/Dual.json');

const CHAINS = {
  bsc: {
    dual: {
      address: '0x3185b7c3a4e646fb23c6c04d979e61da7871b5c1',
      abi: DualV1,
    },

    vault: {
      address: '0xd476ce848c61650e3051f7571f3ae437fe9a32e0',
    },
  },

  polygon: {
    dual: {
      address: '0x868a943ca49a63eb0456a00ae098d470915eea0d',
      abi: DualV2,
    },

    vault: {
      address: '0xd476ce848c61650e3051f7571f3ae437fe9a32e0',
    },
  },

  arbitrum: {
    dual: {
      address: '0x868a943ca49a63eb0456a00ae098d470915eea0d',
      abi: DualV2,
    },

    vault: {
      address: '0xd476ce848c61650e3051f7571f3ae437fe9a32e0',
    },
  },

  optimism: {
    dual: {
      address: '0x868a943ca49a63eb0456a00ae098d470915eea0d',
      abi: DualV2,
    },

    vault: {
      address: '0xd476ce848c61650e3051f7571f3ae437fe9a32e0',
    },
  },

  avax: {
    dual: {
      address: '0x868a943ca49a63eb0456a00ae098d470915eea0d',
      abi: DualV2,
    },

    vault: {
      address: '0xd476ce848c61650e3051f7571f3ae437fe9a32e0',
    },
  },

  fantom: {
    dual: {
      address: '0x868a943ca49a63eb0456a00ae098d470915eea0d',
      abi: DualV2,
    },

    vault: {
      address: '0xd476ce848c61650e3051f7571f3ae437fe9a32e0',
    },
  },
};

const SLUG = 'rehold';

const POOL_META =
  'Calculated as: 24h yield * 365. APY is fixed, and extendable with no limits after the staking period ends';

function _map(array) {
  return array.reduce((acc, item) => {
    acc[item.input.target.toLowerCase()] = item.output;
    return acc;
  }, {});
}

async function _getPrices(chain, tokens) {
  const [{ coins: prices1 }, prices2] = await Promise.all([
    utils.getData(
      `https://coins.llama.fi/prices/current/${tokens
        .map((t) => `${chain}:${t}`)
        .join(',')}`
    ),

    // DefiLlama missed some prices (e.g. VET, 0x6fdcdfef7c496407ccb0cec90f9c5aaa1cc8d888),
    // so we're using our API as fallback prices
    utils.getData('https://app.rehold.io/api/v1/rates'),
  ]);

  return {
    prices1: Object.values(prices1).reduce((acc, item) => {
      acc[item.symbol.toUpperCase()] = item.price;
      return acc;
    }, {}),

    prices2: Object.entries(prices2).reduce((acc, [symbol, rate]) => {
      const [baseTicker, quoteTicker] = symbol.toUpperCase().split('/');

      if (quoteTicker === 'USD') {
        acc[baseTicker] = rate.price;
      }

      return acc;
    }, {}),
  };
}

async function _apy(chain) {
  const pairs = {};
  const tokens = {};

  const { output } = await sdk.api.abi.call({
    chain,
    target: CHAINS[chain].dual.address,
    abi: CHAINS[chain].dual.abi.find((m) => m.name === 'tariffs'),
  });

  output.forEach((tariff) => {
    const { baseToken, quoteToken, stakingPeriod, yield: _yield } = tariff;
    const apr = +new BN(_yield)
      .div(stakingPeriod)
      .times(24 * 365)
      .div(1e6)
      .toFixed(0);

    if (!tokens[baseToken] || tokens[baseToken] < apr) {
      tokens[baseToken] = apr;
    }

    if (!tokens[quoteToken] || tokens[quoteToken] < apr) {
      tokens[quoteToken] = apr;
    }

    if (
      !pairs[`${baseToken}-${quoteToken}`] ||
      pairs[`${baseToken}-${quoteToken}`] < apr
    ) {
      pairs[`${baseToken}-${quoteToken}`] = apr;
    }
  });

  const pools = [];

  Object.entries(pairs).forEach(([symbol, apr], i) => {
    const [baseToken, quoteToken] = symbol.split('-');

    pools.push({
      pool: `${CHAINS[chain].vault.address}-${i}-${chain}`, // we don't have a specific contract address for each pool
      chain: utils.formatChain(chain),
      project: SLUG,
      symbol,
      apyBase: apr,
      underlyingTokens: [baseToken, quoteToken],
    });
  });

  Object.entries(tokens).forEach(([token, apr]) => {
    pools.push({
      pool: `${token}-${chain}`,
      chain: utils.formatChain(chain),
      project: SLUG,
      symbol: token,
      apyBase: apr,
      underlyingTokens: [token],
    });
  });

  const tokenAddresses = Object.keys(tokens);

  const [{ output: _balances }, { output: _symbols }, { output: _decimals }] =
    await Promise.all([
      sdk.api.abi.multiCall({
        abi: 'erc20:balanceOf',
        calls: tokenAddresses.map((token) => ({
          target: token,
          params: CHAINS[chain].vault.address,
        })),
        chain,
      }),

      sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        calls: tokenAddresses.map((token) => ({
          target: token,
        })),
        chain,
      }),

      sdk.api.abi.multiCall({
        abi: 'erc20:decimals',
        calls: tokenAddresses.map((token) => ({
          target: token,
        })),
        chain,
      }),
    ]);

  const symbols = _map(_symbols);
  const decimals = _map(_decimals);

  const { prices1, prices2 } = await _getPrices(chain, tokenAddresses);

  const balances = _balances.reduce((acc, balance) => {
    const token = balance.input.target.toLowerCase();
    const tokenSymbol = symbols[token];
    const tokenDecimals = +decimals[token];
    const tokenPrice = prices1[tokenSymbol] || prices2[tokenSymbol] || 0;

    acc[token] = +new BN(balance.output)
      .div(10 ** tokenDecimals)
      .times(tokenPrice)
      .toFixed(2);

    return acc;
  }, {});

  pools.forEach((pool) => {
    const [tokenA, tokenB] = pool.symbol.toLowerCase().split('-');

    const balanceA = tokenA ? balances[tokenA] : 0;
    const balanceB = tokenB ? balances[tokenB] : 0;

    const symbolA = tokenA && symbols[tokenA];
    const symbolB = tokenB && symbols[tokenB];

    pool.symbol = [symbolA, symbolB].filter(Boolean).join('-');
    pool.tvlUsd = balanceA + balanceB;
    pool.poolMeta = POOL_META;
  });

  return pools;
}

async function apy() {
  const pools = [];

  for (const chain in CHAINS) {
    pools.push(...(await _apy(chain)));
  }

  return pools;
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.rehold.io/?utm_source=DefiLlama',
};
