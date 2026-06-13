const axios = require('axios');
const sdk = require('@defillama/sdk');
const { mapKeys, camelCase } = require('lodash');

// Token addresses by chain
const tokenAddresses = {
  binance: {
    WING: '0x3CB7378565718c64Ab86970802140Cc48eF1f969',
    ONT: '0xFd7B3A77848f1C2D67E05E54d78d174a0C850335',
    ONG: '0x308bfaeAaC8BDab6e9Fc5Ead8EdCb5f95b0599d9',
    BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    DAI: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    XRP: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE',
    DOGE: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
    LINK: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
    BCH: '0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf',
    ADA: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47',
    CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    LTC: '0x4338665CBB7B2485A8855A139b75D5e34AB0DB94',
    DOT: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',
    FIL: '0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153',
  },
  ethereum: {
    WING: '0xDb0f18081b505A7DE20B18ac41856BCB4Ba86A1a',
    ETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI: '0x6B175474E89094C44Da98b954EeadCfC6E03e6B5',
    PAXG: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
    LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    SNX: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
    BAL: '0xba100000625a3754423978a60c9317c58a424e3D',
    UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  },
  ontology: {
    pWBTC: 'coingecko:bitcoin',
    pETH: 'coingecko:ethereum',
    pUSDT: 'coingecko:tether',
    pUSDC: 'coingecko:usd-coin',
    pDAI: 'coingecko:dai',
    pUNI: 'coingecko:uniswap',
    ONTd: 'coingecko:ontology',
    ONG: 'coingecko:ong',
    WING: 'coingecko:wing-finance',
    pSUSD: 'coingecko:nusd',
    prenBTC: 'coingecko:bitcoin',
    pNEO: 'coingecko:neo',
    FLM: 'coingecko:flamingo-finance',
    pYFI: 'coingecko:yearn-finance',
  },
  ontologyEvm: {
    WING: '0x004835c1Df02F9128b6d88dEb52E808eb2B2714e',
    ONT: '0xEBA8B0C65beEf1B86f1e153B16d4B00A7317FA4B',
    ONG: '0x4eE8BC3F57F68a05dB8f0E0a95a6c4f60b587A6C',
    WBTC: 'coingecko:bitcoin',
    USDT: 'coingecko:tether',
    ETH: 'coingecko:ethereum',
    WONT: 'coingecko:ontology',
  },
};

const normalizedTokenAddresses = Object.fromEntries(
  Object.entries(tokenAddresses).map(([chain, tokens]) => [
    chain,
    Object.fromEntries(
      Object.entries(tokens).map(([symbol, address]) => [
        symbol.toLowerCase(),
        address,
      ])
    ),
  ])
);

const API_URL = {
  ontology: 'https://flashapi.wing.finance/api/v1/userflashpooloverview',
  binance: 'https://ethapi.wing.finance/bsc/flash-pool/overview',
  ontologyEvm: 'https://ethapi.wing.finance/ontevm/flash-pool/overview',
  ethereum: 'https://ethapi.wing.finance/eth/flash-pool/overview',
};

const EVM_MARKET_SOURCES = {
  binance: {
    sdkChain: 'bsc',
    comptroller: '0x49620e9bfd117c7b05b4732980b05b7afee60a69',
    nativeToken: tokenAddresses.binance.BNB,
    nativeSymbols: ['bnb'],
  },
  ontologyEvm: {
    sdkChain: 'ontology_evm',
    comptroller: '0x000A4d6b9E553a7f4bc1B8F94bB7Dd37BfF6d79b',
    nativeToken: tokenAddresses.ontologyEvm.ONG,
    nativeSymbols: ['ong'],
  },
  ethereum: {
    sdkChain: 'ethereum',
    comptroller: '0x2F9fa63066cfA2d727F57ddf1991557bA86F12c9',
    nativeToken: tokenAddresses.ethereum.ETH,
    nativeSymbols: ['eth'],
  },
};

const abi = {
  getAllMarkets: 'function getAllMarkets() view returns (address[])',
  symbol: 'function symbol() view returns (string)',
  underlying: 'function underlying() view returns (address)',
};

const normalizeSymbol = (symbol) => String(symbol || '').toLowerCase();

const stripMarketPrefix = (symbol) => {
  const value = String(symbol || '');
  return value[0]?.toLowerCase() === 'f' ? value.slice(1) : value;
};

const isZeroAddress = (address) =>
  !address || /^0x0{40}$/i.test(String(address));

const addToken = (tokens, symbol, address, stripPrefix = false) => {
  if (!symbol || isZeroAddress(address)) return;

  const symbols = [symbol];
  if (stripPrefix) symbols.push(stripMarketPrefix(symbol));

  for (const value of symbols) {
    if (!value) continue;
    if (!tokens[value]) tokens[value] = address;

    const normalized = normalizeSymbol(value);
    if (normalized && !tokens[normalized]) tokens[normalized] = address;
  }
};

const getSymbols = async (chain, targets) => {
  return (
    await sdk.api.abi.multiCall({
      chain,
      calls: targets.map((target) => ({ target })),
      abi: abi.symbol,
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const discoverUnderlyingTokens = async (chains) => {
  const entries = await Promise.all(
    chains.map(async (chain) => [chain, await discoverChainTokens(chain)])
  );

  return Object.fromEntries(entries);
};

const discoverChainTokens = async (chain) => {
  const source = EVM_MARKET_SOURCES[chain];
  if (!source) return {};

  const { output: markets } = await sdk.api.abi.call({
    target: source.comptroller,
    chain: source.sdkChain,
    abi: abi.getAllMarkets,
  });

  const [marketSymbols, underlyingResults] = await Promise.all([
    getSymbols(source.sdkChain, markets),
    sdk.api.abi.multiCall({
      chain: source.sdkChain,
      calls: markets.map((target) => ({ target })),
      abi: abi.underlying,
      permitFailure: true,
    }),
  ]);

  const rows = markets.map((market, index) => {
    const marketSymbol = marketSymbols[index];
    let underlying = underlyingResults.output[index]?.output;
    const symbol = normalizeSymbol(stripMarketPrefix(marketSymbol));

    if (!underlying && source.nativeSymbols.includes(symbol)) {
      underlying = source.nativeToken;
    }

    return {
      market,
      marketSymbol,
      underlying,
    };
  });

  const tokens = {};
  rows.forEach(({ marketSymbol, underlying }) => {
    addToken(tokens, marketSymbol, underlying, true);
  });

  const rowsWithUnderlying = rows.filter(({ underlying }) => underlying);
  const underlyingSymbols = await getSymbols(
    source.sdkChain,
    rowsWithUnderlying.map(({ underlying }) => underlying)
  );

  rowsWithUnderlying.forEach(({ underlying }, index) => {
    addToken(tokens, underlyingSymbols[index], underlying);
  });

  return tokens;
};

const getUnderlyingToken = (chain, poolName, discoveredTokens) => {
  const staticTokens = tokenAddresses[chain] || {};
  const normalizedStaticTokens = normalizedTokenAddresses[chain] || {};
  const discoveredChainTokens = discoveredTokens[chain] || {};

  return (
    staticTokens[poolName] ||
    normalizedStaticTokens[normalizeSymbol(poolName)] ||
    discoveredChainTokens[poolName] ||
    discoveredChainTokens[normalizeSymbol(poolName)]
  );
};

const apy = async () => {
  const data = await Promise.all(
    Object.entries(API_URL).map(async ([chain, url]) => [
      chain,
      (await axios.post(url, { address: '' })).data.result,
    ])
  );

  const normalizedData = data.map(([chain, data]) => [
    chain,
    chain === 'ontology'
      ? data.UserFlashPoolOverview.AllMarket
      : data.allMarket,
  ]);

  const discoveryChains = normalizedData
    .filter(([chain, chainPools]) => {
      if (!EVM_MARKET_SOURCES[chain]) return false;

      return chainPools.some((pool) => {
        const poolName = pool.name || pool.Name;
        return !getUnderlyingToken(chain, poolName, {});
      });
    })
    .map(([chain]) => chain);

  const discoveredTokens = await discoverUnderlyingTokens(discoveryChains);

  const pools = normalizedData.map(([chain, chainPools]) => {
    return chainPools
      .map((pool) => mapKeys(pool, (v, k) => camelCase(k)))
      .map((pool) => {
        // Get underlying token address
        const underlyingToken = getUnderlyingToken(
          chain,
          pool.name,
          discoveredTokens
        );
        const apyReward =
          (Number(pool.annualSupplyWingDistributedDollar) /
            Number(pool.totalSupplyDollar)) *
          100;

        return {
          pool: `${pool.name}-wing-finance-${chain}`,
          chain: chain === 'ontologyEvm' ? 'ontology' : chain,
          project: 'wing-finance',
          symbol: pool.name,
          tvlUsd:
            Number(pool.totalSupplyDollar) -
            Number(pool.totalValidBorrowDollar),
          apyBase: Number(pool.supplyApy) * 100,
          apyReward,
          ...(apyReward > 0 && {
            rewardTokens: ['coingecko:wing-finance'],
          }),
          // borrow fields
          totalSupplyUsd: Number(pool.totalSupplyDollar),
          totalBorrowUsd: Number(pool.totalValidBorrowDollar),
          apyBaseBorrow: Number(pool.borrowApy) * 100,
          apyRewardBorrow:
            (Number(pool.annualBorrowWingDistributedDollar) /
              Number(pool.totalValidBorrowDollar)) *
            100,
          ltv: Number(pool.collateralFactor),
          underlyingTokens: underlyingToken ? [underlyingToken] : undefined,
        };
      });
  });

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://flash.wing.finance/',
};
