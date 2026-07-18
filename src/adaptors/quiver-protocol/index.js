const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

// Quiver Protocol: AI-managed concentrated-liquidity vaults on Robinhood Chain
// (Uniswap V3 + V4 pools, incl. tokenized-stock pairs). One pool entry per
// vault. apyBase is the depositor share (90%) of gross LP fees harvested over
// the trailing window, annualized against the vault's current position value.
const CHAIN = 'robinhood'; // DefiLlama slug (DB + prices API)
const SDK_CHAIN = 'robinhoodchain'; // @defillama/sdk provider key for chainId 4663

const FACTORY_V3 = '0xa511D763a79293b306BeAfd3e7eEB5e2884A71d5';
const FACTORY_V4 = '0x3941116A9fF2d3e0B4CFa396d7927e8462dF7b38';
const FACTORY_DEPLOY_BLOCK = 11197493; // 2026-07-16
const STATE_VIEW = '0xF3334192D15450CdD385c8B70e03f9A6bD9E673b'; // Uniswap V4
const FEE_CONFIG = '0x777bBe1F53ae75f478DaF22b0E5A5d9513e98E31';

const HARVEST_ABI =
  'event Harvest(address indexed caller, uint256 fees0, uint256 fees1, uint256 ppsAfter)';
const WINDOW_DAYS = 7;

const ABI = {
  vaultCount: 'function vaultCount() view returns (uint256)',
  allVaults: 'function allVaults(uint256) view returns (address)',
  strategy: 'function strategy() view returns (address)',
  token0: 'function token0() view returns (address)',
  token1: 'function token1() view returns (address)',
  tickLower: 'function tickLower() view returns (int24)',
  tickUpper: 'function tickUpper() view returns (int24)',
  totalLiquidity: 'function totalLiquidity() view returns (uint128)',
  pool: 'function pool() view returns (address)',
  poolId: 'function poolId() view returns (bytes32)',
  slot0:
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  getSlot0:
    'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  getFees:
    'function getFees(address vault) view returns (uint256 totalBps, uint256 callerBps, address treasury)',
  balanceOf: 'function balanceOf(address) view returns (uint256)',
  symbol: 'function symbol() view returns (string)',
  decimals: 'function decimals() view returns (uint8)',
};

const call = (target, abi, params = []) =>
  sdk.api.abi
    .call({ target, abi, params, chain: SDK_CHAIN })
    .then((r) => r.output);

const multiCall = (calls, abi) =>
  sdk.api.abi
    .multiCall({ calls, abi, chain: SDK_CHAIN, permitFailure: false })
    .then((r) => r.output.map((o) => o.output));

// Same sqrt-price math as DefiLlama-Adapters' addUniV3LikePosition.
const positionAmounts = ({ liquidity, tickLower, tickUpper, tick }) => {
  const sa = 1.0001 ** (tickLower / 2);
  const sb = 1.0001 ** (tickUpper / 2);
  let amount0 = 0;
  let amount1 = 0;
  if (tick < tickLower) {
    amount0 = (liquidity * (sb - sa)) / (sa * sb);
  } else if (tick < tickUpper) {
    const sp = 1.0001 ** (tick / 2);
    amount0 = (liquidity * (sb - sp)) / (sp * sb);
    amount1 = liquidity * (sp - sa);
  } else {
    amount1 = liquidity * (sb - sa);
  }
  return { amount0, amount1 };
};

// coins.llama.fi/block has no Robinhood support yet — binary-search on-chain.
const blockAtTimestamp = async (timestamp) => {
  const provider = sdk.getProvider(SDK_CHAIN);
  let lo = FACTORY_DEPLOY_BLOCK;
  let hi = await provider.getBlockNumber();
  if ((await provider.getBlock(lo)).timestamp >= timestamp) return lo;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { timestamp: ts } = await provider.getBlock(mid);
    if (ts < timestamp) lo = mid;
    else hi = mid;
  }
  return hi;
};

const listVaults = async (factory) => {
  const count = Number(await call(factory, ABI.vaultCount));
  return multiCall(
    [...Array(count).keys()].map((i) => ({ target: factory, params: [i] })),
    ABI.allVaults
  );
};

const apy = async () => {
  const [vaultsV3, vaultsV4] = await Promise.all(
    [FACTORY_V3, FACTORY_V4].map(listVaults)
  );
  const vaults = [...vaultsV3, ...vaultsV4];
  const isV4 = vaults.map((_, i) => i >= vaultsV3.length);
  const strategies = await multiCall(
    vaults.map((target) => ({ target })),
    ABI.strategy
  );
  const stratCalls = strategies.map((target) => ({ target }));
  const [token0s, token1s, tickLowers, tickUppers, liquidities, feeSplits] =
    await Promise.all([
      multiCall(stratCalls, ABI.token0),
      multiCall(stratCalls, ABI.token1),
      multiCall(stratCalls, ABI.tickLower),
      multiCall(stratCalls, ABI.tickUpper),
      multiCall(stratCalls, ABI.totalLiquidity),
      multiCall(
        vaults.map((v) => ({ target: FEE_CONFIG, params: [v] })),
        ABI.getFees
      ),
    ]);

  // current tick per vault: V3 from the pool, V4 from StateView by poolId
  const poolsV3 = await multiCall(
    strategies.slice(0, vaultsV3.length).map((target) => ({ target })),
    ABI.pool
  );
  const slot0sV3 = await multiCall(
    poolsV3.map((target) => ({ target })),
    ABI.slot0
  );
  const poolIdsV4 = await multiCall(
    strategies.slice(vaultsV3.length).map((target) => ({ target })),
    ABI.poolId
  );
  const slot0sV4 = await multiCall(
    poolIdsV4.map((id) => ({ target: STATE_VIEW, params: [id] })),
    ABI.getSlot0
  );
  const ticks = [
    ...slot0sV3.map((s) => Number(s.tick)),
    ...slot0sV4.map((s) => Number(s.tick)),
  ];

  // idle strategy balances join the position value
  const [idle0s, idle1s] = await Promise.all([
    multiCall(
      strategies.map((s, i) => ({ target: token0s[i], params: [s] })),
      ABI.balanceOf
    ),
    multiCall(
      strategies.map((s, i) => ({ target: token1s[i], params: [s] })),
      ABI.balanceOf
    ),
  ]);

  const tokens = [...new Set([...token0s, ...token1s].map((t) => t.toLowerCase()))];
  const [symbols, decimalss, { pricesByAddress: prices }] = await Promise.all([
    multiCall(tokens.map((target) => ({ target })), ABI.symbol),
    multiCall(tokens.map((target) => ({ target })), ABI.decimals),
    utils.getPrices(tokens, CHAIN),
  ]);
  const meta = Object.fromEntries(
    tokens.map((t, i) => [
      t,
      { symbol: symbols[i], decimals: Number(decimalss[i]), price: prices[t] },
    ])
  );

  // trailing-window harvests per strategy (gross LP fees collected)
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - WINDOW_DAYS * 24 * 3600;
  const [fromBlock, toBlock] = await Promise.all([
    blockAtTimestamp(windowStart).then((b) => Math.max(b, FACTORY_DEPLOY_BLOCK)),
    blockAtTimestamp(now),
  ]);
  const harvests = await Promise.all(
    strategies.map((target) =>
      sdk.getEventLogs({
        chain: SDK_CHAIN,
        target,
        eventAbi: HARVEST_ABI,
        onlyArgs: true,
        fromBlock,
        toBlock,
      })
    )
  );

  return vaults.map((vault, i) => {
    const t0 = meta[token0s[i].toLowerCase()];
    const t1 = meta[token1s[i].toLowerCase()];
    const { amount0, amount1 } = positionAmounts({
      liquidity: Number(liquidities[i]),
      tickLower: Number(tickLowers[i]),
      tickUpper: Number(tickUppers[i]),
      tick: ticks[i],
    });
    const tvlUsd =
      ((amount0 + Number(idle0s[i])) / 10 ** t0.decimals) * (t0.price ?? 0) +
      ((amount1 + Number(idle1s[i])) / 10 ** t1.decimals) * (t1.price ?? 0);

    const grossFeesUsd = harvests[i].reduce(
      (acc, log) =>
        acc +
        (Number(log.fees0) / 10 ** t0.decimals) * (t0.price ?? 0) +
        (Number(log.fees1) / 10 ** t1.decimals) * (t1.price ?? 0),
      0
    );
    const perfBps = Number(feeSplits[i].totalBps);
    const netFeesUsd = (grossFeesUsd * (10000 - perfBps)) / 10000;
    const windowDaysEffective = Math.min(
      WINDOW_DAYS,
      Math.max((now - 1784198950) / (24 * 3600), 1) // clamp to protocol age
    );
    const apyBase =
      tvlUsd > 0
        ? ((netFeesUsd / windowDaysEffective) * 365 * 100) / tvlUsd
        : 0;

    return {
      pool: `${vault}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'quiver-protocol',
      symbol: utils.formatSymbol(`${t0.symbol}-${t1.symbol}`),
      tvlUsd,
      apyBase,
      underlyingTokens: [token0s[i], token1s[i]],
      poolMeta: isV4[i] ? 'Uniswap V4 CLM' : 'Uniswap V3 CLM',
      url: `https://quiverprotocol.finance/vault/${vault.toLowerCase()}`,
    };
  });
};

module.exports = {
  timetravel: false,
  apy,
  protocolId: '8239',
  url: 'https://quiverprotocol.finance',
};
