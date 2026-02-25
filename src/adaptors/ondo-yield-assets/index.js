const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

// Ondo Finance RWA tokens with oracle configuration
// USDY oracles have getPriceHistorical(timestamp) for direct historical queries
// OUSG oracle uses getAssetPrice(token) - requires block-based historical queries

// EVM chain configurations
const evmConfig = {
  ethereum: {
    tokens: [
      {
        address: '0x96f6ef951840721adbf46ac996b59e0235cb985c',
        symbol: 'USDY',
        name: 'US Dollar Yield',
        oracle: '0xA0219AA5B31e65Bc920B5b6DFb8EdF0988121De0',
        oracleType: 'usdy',
      },
      {
        // USDYc is "Cooking USDY" - interim token during subscription, counts as USDY TVL
        address: '0xe86845788d6e3e5c2393ade1a051ae617d974c09',
        symbol: 'USDYc',
        name: 'US Dollar Yield (Cooking)',
        oracle: '0xA0219AA5B31e65Bc920B5b6DFb8EdF0988121De0',
        oracleType: 'usdy',
      },
      {
        address: '0x1b19c19393e2d034d8ff31ff34c81252fcbbee92',
        symbol: 'OUSG',
        name: 'Short-term US Government Securities',
        oracle: '0x9Cad45a8BF0Ed41Ff33074449B357C7a1fAb4094',
        oracleType: 'ousg',
      },
    ],
  },
  arbitrum: {
    tokens: [
      {
        address: '0x35e050d3c0ec2d29d269a8ecea763a183bdf9a9d',
        symbol: 'USDY',
        name: 'US Dollar Yield',
        // Use Ethereum oracle as canonical source
        canonicalOracle: {
          chain: 'ethereum',
          address: '0xA0219AA5B31e65Bc920B5b6DFb8EdF0988121De0',
        },
        oracleType: 'usdy',
      },
    ],
  },
  mantle: {
    tokens: [
      {
        address: '0x5be26527e817998a7206475496fde1e68957c5a6',
        symbol: 'USDY',
        name: 'US Dollar Yield',
        oracle: '0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f',
        oracleType: 'usdy',
      },
    ],
  },
  polygon: {
    tokens: [
      {
        address: '0xbA11C5effA33c4D6F8f593CFA394241CfE925811',
        symbol: 'OUSG',
        name: 'Short-term US Government Securities',
        // Use Ethereum oracle as canonical source
        canonicalOracle: {
          chain: 'ethereum',
          address: '0x9Cad45a8BF0Ed41Ff33074449B357C7a1fAb4094',
          tokenAddress: '0x1b19c19393e2d034d8ff31ff34c81252fcbbee92', // ETH OUSG address for oracle query
        },
        oracleType: 'ousg',
      },
    ],
  },
  sei: {
    tokens: [
      {
        address: '0x54cD901491AeF397084453F4372B93c33260e2A6',
        symbol: 'USDY',
        name: 'US Dollar Yield',
        // Use Ethereum oracle as canonical source
        canonicalOracle: {
          chain: 'ethereum',
          address: '0xA0219AA5B31e65Bc920B5b6DFb8EdF0988121De0',
        },
        oracleType: 'usdy',
      },
    ],
  },
};

// Solana configuration - uses Ethereum oracle as canonical price source
const solanaConfig = {
  usdy: {
    address: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6',
    symbol: 'USDY',
    name: 'US Dollar Yield',
  },
  ousg: {
    address: 'i7u4r16TcsJTgq1kAG8opmVZyVnAKBwLKu6ZPMwzxNc',
    symbol: 'OUSG',
    name: 'Short-term US Government Securities',
  },
};

// XRPL configuration - OUSG issuer address
// Currency code is hex-encoded: "OUSG" = 4F555347 padded to 40 chars
const xrplConfig = {
  ousg: {
    issuer: 'rHuiXXjHLpMP8ZE9sSQU5aADQVWDwv6h5p',
    currency: '4F55534700000000000000000000000000000000',
    symbol: 'OUSG',
    name: 'Short-term US Government Securities',
  },
};

// Sui configuration
const suiConfig = {
  usdy: {
    coinType: '0x960b531667636f39e85867775f52f6b1f220a058c4de786905bdf761e06a56bb::usdy::USDY',
    symbol: 'USDY',
    name: 'US Dollar Yield',
    decimals: 6,
  },
};

// Stellar configuration
const stellarConfig = {
  usdy: {
    issuer: 'GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6',
    assetCode: 'USDY',
    symbol: 'USDY',
    name: 'US Dollar Yield',
  },
};

// Osmosis configuration - USDY via IBC from Noble
const osmosisConfig = {
  usdy: {
    ibcDenom: 'ibc/23104D411A6EB6031FA92FB75F227422B84989969E91DCAD56A535DD7FF0A373',
    symbol: 'USDY',
    name: 'US Dollar Yield',
    decimals: 18,
  },
};

// Noble (Cosmos) configuration - native USDY
const nobleConfig = {
  usdy: {
    denom: 'ausdy',
    symbol: 'USDY',
    name: 'US Dollar Yield',
    decimals: 18,
  },
};

// ABIs for oracle interactions
const usdyOracleAbi = {
  getPrice: {
    inputs: [],
    name: 'getPrice',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  getPriceHistorical: {
    inputs: [{ internalType: 'uint256', name: 'timestamp', type: 'uint256' }],
    name: 'getPriceHistorical',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
};

const ousgOracleAbi = {
  getAssetPrice: {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'getAssetPrice',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
};

const getBlock = async (chain, timestamp) => {
  const response = await axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp}`
  );
  return response.data.height;
};

// Get USDY price using the dedicated oracle with historical timestamp support
const getUsdyPrice = async (oracleAddress, chain, timestamp = null) => {
  if (timestamp) {
    const result = await sdk.api.abi.call({
      target: oracleAddress,
      abi: usdyOracleAbi.getPriceHistorical,
      params: [timestamp],
      chain,
    });
    return Number(result.output) / 1e18;
  }
  const result = await sdk.api.abi.call({
    target: oracleAddress,
    abi: usdyOracleAbi.getPrice,
    chain,
  });
  return Number(result.output) / 1e18;
};

// Get OUSG price using the unified oracle (requires block for historical)
const getOusgPrice = async (oracleAddress, tokenAddress, chain, block = null) => {
  const result = await sdk.api.abi.call({
    target: oracleAddress,
    abi: ousgOracleAbi.getAssetPrice,
    params: [tokenAddress],
    chain,
    block,
  });
  return Number(result.output) / 1e18;
};

const calculateApy = (currentPrice, historicalPrice, days) => {
  if (historicalPrice > 0 && currentPrice > historicalPrice) {
    const growth = currentPrice / historicalPrice;
    const annualizationFactor = 365 / days;
    return (Math.pow(growth, annualizationFactor) - 1) * 100;
  }
  return 0;
};

const getPoolsForChain = async (chain, sharedData) => {
  const chainConfig = evmConfig[chain];
  if (!chainConfig || chainConfig.tokens.length === 0) return [];

  const chainTokens = chainConfig.tokens;
  const poolData = [];

  // Get total supply and decimals for all tokens
  const [supplyResults, decimalsResults] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: chainTokens.map((t) => ({ target: t.address })),
      abi: 'erc20:totalSupply',
      chain,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: chainTokens.map((t) => ({ target: t.address })),
      abi: 'erc20:decimals',
      chain,
      permitFailure: true,
    }),
  ]);

  const supplies = supplyResults.output.map((o) =>
    o.success ? BigInt(o.output) : BigInt(0)
  );
  const decimals = decimalsResults.output.map((o) =>
    o.success ? Number(o.output) : 18
  );

  for (let i = 0; i < chainTokens.length; i++) {
    const token = chainTokens[i];
    const supply = supplies[i];
    const decimal = decimals[i];

    if (supply === BigInt(0)) continue;

    try {
      let currentPrice, price7d, price30d;

      if (token.oracleType === 'usdy') {
        // USDY oracle supports direct timestamp queries
        const oracleChain = token.canonicalOracle?.chain || chain;
        const oracleAddress = token.canonicalOracle?.address || token.oracle;

        [currentPrice, price7d, price30d] = await Promise.all([
          getUsdyPrice(oracleAddress, oracleChain),
          getUsdyPrice(oracleAddress, oracleChain, sharedData.timestamp7d),
          getUsdyPrice(oracleAddress, oracleChain, sharedData.timestamp30d),
        ]);
      } else if (token.oracleType === 'ousg') {
        // OUSG oracle requires block-based queries
        const oracleChain = token.canonicalOracle?.chain || chain;
        const oracleAddress = token.canonicalOracle?.address || token.oracle;
        const tokenForOracle = token.canonicalOracle?.tokenAddress || token.address;

        [currentPrice, price7d, price30d] = await Promise.all([
          getOusgPrice(oracleAddress, tokenForOracle, oracleChain),
          getOusgPrice(oracleAddress, tokenForOracle, oracleChain, sharedData.block7d),
          getOusgPrice(oracleAddress, tokenForOracle, oracleChain, sharedData.block30d),
        ]);
      }

      if (!currentPrice || currentPrice === 0) continue;

      const supplyNum = Number(supply) / 10 ** decimal;
      const tvlUsd = supplyNum * currentPrice;

      if (tvlUsd < 10000) continue;

      const apyBase = calculateApy(currentPrice, price30d, 30);
      const apyBase7d = calculateApy(currentPrice, price7d, 7);

      poolData.push({
        pool: `${token.address}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'ondo-yield-assets',
        symbol: utils.formatSymbol(token.symbol),
        tvlUsd,
        apyBase: Number(apyBase.toFixed(2)),
        apyBase7d: Number(apyBase7d.toFixed(2)),
        underlyingTokens: [token.address],
        poolMeta: token.name,
        url: token.oracleType === 'usdy'
          ? 'https://app.ondo.finance/assets/usdy'
          : 'https://app.ondo.finance/assets/ousg',
      });
    } catch (e) {
      console.error(`Ondo Finance: Error processing ${token.symbol} on ${chain}:`, e.message);
      continue;
    }
  }

  return poolData;
};

// Get Sui USDY supply via RPC
const getSuiUsdySupply = async () => {
  try {
    const response = await axios.post('https://fullnode.mainnet.sui.io', {
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_getTotalSupply',
      params: [suiConfig.usdy.coinType],
    });
    if (response.data?.result?.value) {
      return Number(response.data.result.value) / 10 ** suiConfig.usdy.decimals;
    }
    return 0;
  } catch (error) {
    console.error('Ondo Finance: Error fetching Sui USDY supply:', error.message);
    return 0;
  }
};

// Get Stellar USDY supply via Horizon API
const getStellarUsdySupply = async () => {
  try {
    const response = await axios.get(
      `https://horizon.stellar.org/assets?asset_code=${stellarConfig.usdy.assetCode}&asset_issuer=${stellarConfig.usdy.issuer}`
    );
    const record = response.data?._embedded?.records?.[0];
    if (record) {
      // Total supply = authorized + liquidity_pools + contracts
      const authorized = parseFloat(record.balances?.authorized || '0');
      const liquidityPools = parseFloat(record.liquidity_pools_amount || '0');
      const contracts = parseFloat(record.contracts_amount || '0');
      return authorized + liquidityPools + contracts;
    }
    return 0;
  } catch (error) {
    console.error('Ondo Finance: Error fetching Stellar USDY supply:', error.message);
    return 0;
  }
};

// Get Osmosis USDY supply via LCD
const getOsmosisUsdySupply = async () => {
  try {
    const response = await axios.get(
      `https://lcd.osmosis.zone/cosmos/bank/v1beta1/supply/by_denom?denom=${osmosisConfig.usdy.ibcDenom}`
    );
    if (response.data?.amount?.amount) {
      return Number(response.data.amount.amount) / 10 ** osmosisConfig.usdy.decimals;
    }
    return 0;
  } catch (error) {
    console.error('Ondo Finance: Error fetching Osmosis USDY supply:', error.message);
    return 0;
  }
};

// Get Noble USDY supply via LCD
const getNobleUsdySupply = async () => {
  try {
    const response = await axios.get(
      `https://rest.cosmos.directory/noble/cosmos/bank/v1beta1/supply/by_denom?denom=${nobleConfig.usdy.denom}`
    );
    if (response.data?.amount?.amount) {
      return Number(response.data.amount.amount) / 10 ** nobleConfig.usdy.decimals;
    }
    return 0;
  } catch (error) {
    console.error('Ondo Finance: Error fetching Noble USDY supply:', error.message);
    return 0;
  }
};

// Get XRPL OUSG supply via gateway_balances RPC
const getXrplOusgSupply = async () => {
  try {
    const response = await axios.post('https://xrplcluster.com/', {
      method: 'gateway_balances',
      params: [
        {
          account: xrplConfig.ousg.issuer,
          ledger_index: 'validated',
        },
      ],
    });

    const obligations = response.data?.result?.obligations;
    if (obligations && obligations[xrplConfig.ousg.currency]) {
      // XRPL returns raw supply - no decimal adjustment needed for OUSG
      return parseFloat(obligations[xrplConfig.ousg.currency]);
    }
    return 0;
  } catch (error) {
    console.error('Ondo Finance: Error fetching XRPL OUSG supply:', error.message);
    return 0;
  }
};

// Get XRPL pools
const getXrplPools = async (sharedData) => {
  const poolData = [];
  const { ousgPrices } = sharedData;

  try {
    const supply = await getXrplOusgSupply();
    if (supply && supply > 0) {
      const tvlUsd = supply * ousgPrices.current;
      if (tvlUsd >= 10000) {
        const apyBase = calculateApy(ousgPrices.current, ousgPrices.day30, 30);
        const apyBase7d = calculateApy(ousgPrices.current, ousgPrices.day7, 7);

        poolData.push({
          pool: `${xrplConfig.ousg.issuer}-xrpl`,
          chain: 'Ripple',
          project: 'ondo-yield-assets',
          symbol: utils.formatSymbol(xrplConfig.ousg.symbol),
          tvlUsd,
          apyBase: Number(apyBase.toFixed(2)),
          apyBase7d: Number(apyBase7d.toFixed(2)),
          poolMeta: xrplConfig.ousg.name,
          url: 'https://app.ondo.finance/assets/ousg',
          underlyingTokens: ['ethereum:0x1b19c19393e2d034d8ff31ff34c81252fcbbee92'],
        });
      }
    }
  } catch (e) {
    console.error('Ondo Finance: Error processing OUSG on XRPL:', e.message);
  }

  return poolData;
};

// Get Sui pools
const getSuiPools = async (sharedData) => {
  const poolData = [];
  const { usdyPrices } = sharedData;

  try {
    const supply = await getSuiUsdySupply();
    if (supply && supply > 0) {
      const tvlUsd = supply * usdyPrices.current;
      if (tvlUsd >= 10000) {
        const apyBase = calculateApy(usdyPrices.current, usdyPrices.day30, 30);
        const apyBase7d = calculateApy(usdyPrices.current, usdyPrices.day7, 7);

        poolData.push({
          pool: `${suiConfig.usdy.coinType}-sui`,
          chain: 'Sui',
          project: 'ondo-yield-assets',
          symbol: utils.formatSymbol(suiConfig.usdy.symbol),
          tvlUsd,
          apyBase: Number(apyBase.toFixed(2)),
          apyBase7d: Number(apyBase7d.toFixed(2)),
          underlyingTokens: [suiConfig.usdy.coinType],
          poolMeta: suiConfig.usdy.name,
          url: 'https://app.ondo.finance/assets/usdy',
        });
      }
    }
  } catch (e) {
    console.error('Ondo Finance: Error processing USDY on Sui:', e.message);
  }

  return poolData;
};

// Get Stellar pools
const getStellarPools = async (sharedData) => {
  const poolData = [];
  const { usdyPrices } = sharedData;

  try {
    const supply = await getStellarUsdySupply();
    if (supply && supply > 0) {
      const tvlUsd = supply * usdyPrices.current;
      if (tvlUsd >= 10000) {
        const apyBase = calculateApy(usdyPrices.current, usdyPrices.day30, 30);
        const apyBase7d = calculateApy(usdyPrices.current, usdyPrices.day7, 7);

        poolData.push({
          pool: `${stellarConfig.usdy.issuer}-stellar`,
          chain: 'Stellar',
          project: 'ondo-yield-assets',
          symbol: utils.formatSymbol(stellarConfig.usdy.symbol),
          tvlUsd,
          apyBase: Number(apyBase.toFixed(2)),
          apyBase7d: Number(apyBase7d.toFixed(2)),
          poolMeta: stellarConfig.usdy.name,
          url: 'https://app.ondo.finance/assets/usdy',
          underlyingTokens: ['ethereum:0x96f6ef951840721adbf46ac996b59e0235cb985c'],
        });
      }
    }
  } catch (e) {
    console.error('Ondo Finance: Error processing USDY on Stellar:', e.message);
  }

  return poolData;
};

// Get Osmosis pools
const getOsmosisPools = async (sharedData) => {
  const poolData = [];
  const { usdyPrices } = sharedData;

  try {
    const supply = await getOsmosisUsdySupply();
    if (supply && supply > 0) {
      const tvlUsd = supply * usdyPrices.current;
      if (tvlUsd >= 10000) {
        const apyBase = calculateApy(usdyPrices.current, usdyPrices.day30, 30);
        const apyBase7d = calculateApy(usdyPrices.current, usdyPrices.day7, 7);

        poolData.push({
          pool: `${osmosisConfig.usdy.ibcDenom}-osmosis`,
          chain: 'Osmosis',
          project: 'ondo-yield-assets',
          symbol: utils.formatSymbol(osmosisConfig.usdy.symbol),
          tvlUsd,
          apyBase: Number(apyBase.toFixed(2)),
          apyBase7d: Number(apyBase7d.toFixed(2)),
          poolMeta: osmosisConfig.usdy.name,
          url: 'https://app.ondo.finance/assets/usdy',
          underlyingTokens: [osmosisConfig.usdy.ibcDenom],
        });
      }
    }
  } catch (e) {
    console.error('Ondo Finance: Error processing USDY on Osmosis:', e.message);
  }

  return poolData;
};

// Get Noble pools
const getNoblePools = async (sharedData) => {
  const poolData = [];
  const { usdyPrices } = sharedData;

  try {
    const supply = await getNobleUsdySupply();
    if (supply && supply > 0) {
      const tvlUsd = supply * usdyPrices.current;
      if (tvlUsd >= 10000) {
        const apyBase = calculateApy(usdyPrices.current, usdyPrices.day30, 30);
        const apyBase7d = calculateApy(usdyPrices.current, usdyPrices.day7, 7);

        poolData.push({
          pool: `${nobleConfig.usdy.denom}-noble`,
          chain: 'Noble',
          project: 'ondo-yield-assets',
          symbol: utils.formatSymbol(nobleConfig.usdy.symbol),
          tvlUsd,
          apyBase: Number(apyBase.toFixed(2)),
          apyBase7d: Number(apyBase7d.toFixed(2)),
          poolMeta: nobleConfig.usdy.name,
          url: 'https://app.ondo.finance/assets/usdy',
          underlyingTokens: [nobleConfig.usdy.denom],
        });
      }
    }
  } catch (e) {
    console.error('Ondo Finance: Error processing USDY on Noble:', e.message);
  }

  return poolData;
};

// Get Solana pools using getTotalSupply helper and Ethereum oracles for price
const getSolanaPools = async (sharedData) => {
  const poolData = [];
  const { usdyPrices, ousgPrices } = sharedData;

  // USDY on Solana
  try {
    const supply = await utils.getTotalSupply(solanaConfig.usdy.address);
    if (supply && supply > 0) {
      const tvlUsd = supply * usdyPrices.current;
      if (tvlUsd >= 10000) {
        const apyBase = calculateApy(usdyPrices.current, usdyPrices.day30, 30);
        const apyBase7d = calculateApy(usdyPrices.current, usdyPrices.day7, 7);

        poolData.push({
          pool: `${solanaConfig.usdy.address}-solana`,
          chain: 'Solana',
          project: 'ondo-yield-assets',
          symbol: utils.formatSymbol(solanaConfig.usdy.symbol),
          tvlUsd,
          apyBase: Number(apyBase.toFixed(2)),
          apyBase7d: Number(apyBase7d.toFixed(2)),
          underlyingTokens: [solanaConfig.usdy.address],
          poolMeta: solanaConfig.usdy.name,
          url: 'https://app.ondo.finance/assets/usdy',
        });
      }
    }
  } catch (e) {
    console.error('Ondo Finance: Error processing USDY on Solana:', e.message);
  }

  // OUSG on Solana
  try {
    const supply = await utils.getTotalSupply(solanaConfig.ousg.address);
    if (supply && supply > 0) {
      const tvlUsd = supply * ousgPrices.current;
      if (tvlUsd >= 10000) {
        const apyBase = calculateApy(ousgPrices.current, ousgPrices.day30, 30);
        const apyBase7d = calculateApy(ousgPrices.current, ousgPrices.day7, 7);

        poolData.push({
          pool: `${solanaConfig.ousg.address}-solana`,
          chain: 'Solana',
          project: 'ondo-yield-assets',
          symbol: utils.formatSymbol(solanaConfig.ousg.symbol),
          tvlUsd,
          apyBase: Number(apyBase.toFixed(2)),
          apyBase7d: Number(apyBase7d.toFixed(2)),
          underlyingTokens: [solanaConfig.ousg.address],
          poolMeta: solanaConfig.ousg.name,
          url: 'https://app.ondo.finance/assets/ousg',
        });
      }
    }
  } catch (e) {
    console.error('Ondo Finance: Error processing OUSG on Solana:', e.message);
  }

  return poolData;
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp7d = now - 7 * 24 * 60 * 60;
  const timestamp30d = now - 30 * 24 * 60 * 60;

  // Get Ethereum blocks for OUSG oracle queries (canonical source)
  const [block7d, block30d] = await Promise.all([
    getBlock('ethereum', timestamp7d),
    getBlock('ethereum', timestamp30d),
  ]);

  // Pre-fetch canonical prices from Ethereum oracles for Solana pools
  const ethUsdyOracle = '0xA0219AA5B31e65Bc920B5b6DFb8EdF0988121De0';
  const ethOusgOracle = '0x9Cad45a8BF0Ed41Ff33074449B357C7a1fAb4094';
  const ethOusgToken = '0x1b19c19393e2d034d8ff31ff34c81252fcbbee92';

  const [
    usdyPriceCurrent,
    usdyPrice7d,
    usdyPrice30d,
    ousgPriceCurrent,
    ousgPrice7d,
    ousgPrice30d,
  ] = await Promise.all([
    getUsdyPrice(ethUsdyOracle, 'ethereum'),
    getUsdyPrice(ethUsdyOracle, 'ethereum', timestamp7d),
    getUsdyPrice(ethUsdyOracle, 'ethereum', timestamp30d),
    getOusgPrice(ethOusgOracle, ethOusgToken, 'ethereum'),
    getOusgPrice(ethOusgOracle, ethOusgToken, 'ethereum', block7d),
    getOusgPrice(ethOusgOracle, ethOusgToken, 'ethereum', block30d),
  ]);

  const sharedData = {
    timestamp7d,
    timestamp30d,
    block7d,
    block30d,
    usdyPrices: {
      current: usdyPriceCurrent,
      day7: usdyPrice7d,
      day30: usdyPrice30d,
    },
    ousgPrices: {
      current: ousgPriceCurrent,
      day7: ousgPrice7d,
      day30: ousgPrice30d,
    },
  };

  // Get pools from all chains in parallel
  const [evmPools, solanaPools, xrplPools, suiPools, stellarPools, osmosisPools, noblePools] = await Promise.all([
    Promise.all(
      Object.keys(evmConfig).map((chain) => getPoolsForChain(chain, sharedData))
    ),
    getSolanaPools(sharedData),
    getXrplPools(sharedData),
    getSuiPools(sharedData),
    getStellarPools(sharedData),
    getOsmosisPools(sharedData),
    getNoblePools(sharedData),
  ]);

  return [
    ...evmPools.flat(),
    ...solanaPools,
    ...xrplPools,
    ...suiPools,
    ...stellarPools,
    ...osmosisPools,
    ...noblePools,
  ].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ondo.finance/',
};
