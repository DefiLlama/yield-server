const sdk = require('@defillama/sdk');
const utils = require('../utils');

// SoneVibe DEX (VibeFactory / VibePair, a Uniswap V2 fork).
// Swap fee: 0.25% (amountIn * 9975 / 10000). When the factory's feeTo is set,
// 1/6 of the fee growth is minted to feeTo, so LPs keep 5/6 of the fee.
// apyBase is computed only from real swap fees over the last 24h:
//   apyBase = volume24hUsd * 0.25% * lpShare * 365 / tvlUsd * 100
// The deprecated Soneium factory 0x06C0b58287794a0bdce20ce768b601CA974618DC is
// intentionally not listed.
const FACTORIES = {
  soneium: '0x77b141dCFDa726e239efF005E3DE7A47AeBFf948',
  arbitrum: '0xA95107ebE4e54480bA755061eF3207c3421150f0',
};

const SWAP_FEE = 0.0025;
const PROTOCOL_FEE_SHARE = 1 / 6;
const DAY = 86400;
// some public RPCs cap eth_getLogs ranges; only used on the RPC fallback
const MAX_LOG_BLOCK_RANGE = 10_000;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const URL = 'https://sonevibe.github.io/Lending/pools.html';

const SWAP_EVENT =
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)';

const abi = {
  allPairsLength: 'function allPairsLength() view returns (uint256)',
  allPairs: 'function allPairs(uint256) view returns (address)',
  feeTo: 'function feeTo() view returns (address)',
  token0: 'function token0() view returns (address)',
  token1: 'function token1() view returns (address)',
  getReserves:
    'function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
};

const getChainPools = async (chain, factory) => {
  const [pairsLength, feeTo] = await Promise.all([
    sdk.api2.abi.call({ target: factory, abi: abi.allPairsLength, chain }),
    sdk.api2.abi.call({ target: factory, abi: abi.feeTo, chain }),
  ]);
  if (!Number(pairsLength)) return [];

  const pairs = await sdk.api2.abi.multiCall({
    abi: abi.allPairs,
    calls: [...Array(Number(pairsLength)).keys()].map((i) => ({
      target: factory,
      params: [i],
    })),
    chain,
  });

  const [tokens0, tokens1, reserves] = await Promise.all(
    [abi.token0, abi.token1, abi.getReserves].map((method) =>
      sdk.api2.abi.multiCall({
        abi: method,
        calls: pairs.map((target) => ({ target })),
        chain,
      })
    )
  );

  const tokens = [
    ...new Set([...tokens0, ...tokens1].map((t) => t.toLowerCase())),
  ];
  const [decimals, symbols, { pricesByAddress: prices }] = await Promise.all([
    sdk.api2.abi.multiCall({
      abi: 'erc20:decimals',
      calls: tokens.map((target) => ({ target })),
      chain,
    }),
    sdk.api2.abi.multiCall({
      abi: 'erc20:symbol',
      calls: tokens.map((target) => ({ target })),
      chain,
      permitFailure: true,
    }),
    utils.getPrices(tokens, chain),
  ]);
  const tokenInfo = {};
  tokens.forEach((t, i) => {
    tokenInfo[t] = {
      decimals: Number(decimals[i]),
      symbol: symbols[i],
      price: prices[t],
    };
  });

  const latest = await sdk.api.util.getLatestBlock(chain);
  const fromBlock = (
    await sdk.api.util.lookupBlock(latest.timestamp - DAY, { chain })
  ).block;

  const lpShare =
    feeTo.toLowerCase() === ZERO_ADDRESS ? 1 : 1 - PROTOCOL_FEE_SHARE;

  const pools = await Promise.all(
    pairs.map(async (pair, i) => {
      const t0 = tokenInfo[tokens0[i].toLowerCase()];
      const t1 = tokenInfo[tokens1[i].toLowerCase()];
      if (!t0.symbol || !t1.symbol) return null;
      if (!t0.price && !t1.price) return null;

      const amt0 = (x) => Number(x) / 10 ** t0.decimals;
      const amt1 = (x) => Number(x) / 10 ** t1.decimals;

      // TVL: both sides when both are priced, otherwise twice the priced side
      const r0Usd = t0.price ? amt0(reserves[i]._reserve0) * t0.price : null;
      const r1Usd = t1.price ? amt1(reserves[i]._reserve1) * t1.price : null;
      const tvlUsd =
        r0Usd !== null && r1Usd !== null ? r0Usd + r1Usd : 2 * (r0Usd ?? r1Usd);
      if (!(tvlUsd > 0)) return null;

      const logs = await sdk.getEventLogs({
        chain,
        target: pair,
        eventAbi: SWAP_EVENT,
        fromBlock,
        toBlock: latest.number,
        onlyArgs: true,
        maxBlockRange: MAX_LOG_BLOCK_RANGE,
      });

      // volume = USD value of the input side; if an input token has no price,
      // fall back to the priced token's output amount
      let volumeUsd1d = 0;
      for (const l of logs) {
        const in0 = amt0(l.amount0In);
        const in1 = amt1(l.amount1In);
        if ((in0 === 0 || t0.price) && (in1 === 0 || t1.price)) {
          volumeUsd1d += in0 * (t0.price || 0) + in1 * (t1.price || 0);
        } else {
          volumeUsd1d += t0.price
            ? amt0(l.amount0Out) * t0.price
            : amt1(l.amount1Out) * t1.price;
        }
      }

      const apyBase = ((volumeUsd1d * SWAP_FEE * lpShare * 365) / tvlUsd) * 100;

      return {
        pool: `${pair}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'sonevibe',
        symbol: utils.formatSymbol(`${t0.symbol}-${t1.symbol}`),
        tvlUsd,
        apyBase,
        volumeUsd1d,
        underlyingTokens: [tokens0[i], tokens1[i]],
        token: pair,
        url: URL,
      };
    })
  );

  return pools.filter(Boolean);
};

const apy = async () => {
  const pools = await Promise.all(
    Object.entries(FACTORIES).map(([chain, factory]) =>
      getChainPools(chain, factory).catch((e) => {
        console.error(
          `sonevibe: ${chain} failed: ${e?.message || JSON.stringify(e)}`
        );
        return [];
      })
    )
  );
  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '9105',
  timetravel: false,
  apy,
  url: URL,
};
