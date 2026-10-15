const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

// QuantumPools vaults hold concentrated-liquidity NFTs (one NonfungiblePositionManager per vault).
// The same address can be a different vault on another chain, so everything is keyed per chain.
// QuantumPools has no unauthenticated public API, so APY is computed on-chain:
// fees earned in the last 24h by each vault-held position = liquidity * (feeGrowthInside(now) - feeGrowthInside(24h ago)),
// net of the vault's 15% performance fee, annualised over the position value.
const UNI = 'uni', PCS = 'pcs', AERO = 'aero';
const PERFORMANCE_FEE = 0.15;
const PCS_NPM = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
const UNI_NPM = {
  robinhood: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
  base: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
  bsc: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613',
  arbitrum: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  ethereum: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
};
const AERO_NPM = { base: '0x827922686190790b37229fd06084350E74485b72' };
const npmOf = (chain, t) => (t === PCS ? PCS_NPM : t === AERO ? AERO_NPM[chain] : UNI_NPM[chain]);
const DEX_NAME = { [UNI]: 'Uniswap V3', [PCS]: 'PancakeSwap V3', [AERO]: 'Aerodrome Slipstream' };

const VAULTS = {
  robinhood: [
    ['0x5433f385F538Fa11b8A25B82230a306d25dF8EB3', UNI],
    ['0xd3AAb853758c81c09C4510D1b05b9152F71B30F5', UNI],
    ['0xeBdfa133432bC0321ed1073Fe776F4701956E0e7', PCS],
  ],
  base: [
    ['0x9597f68203d1bc85744A5Fc11D890aA7777e386B', UNI],
    ['0x0e8A7c9Fd76e718202B3c3530f3B587ba52FB1A8', UNI],
  ],
  bsc: [
    ['0x9597f68203d1bc85744A5Fc11D890aA7777e386B', PCS],
    ['0x57cB3160D59e967D3ac62620Fc69f7e0898d2690', UNI],
  ],
  arbitrum: [
    ['0x1b884346B79185c862Fc573b68bfDC1f4590102C', UNI],
    ['0x3a0aeB338159c160Df34Faf2E42b050361660871', PCS],
  ],
  ethereum: [
    ['0x77B24e193D9c7dA62660CDBe83B16f695fAA4d42', UNI], // V2.1 Uniswap
  ],
};

const ABI = {
  balanceOf: 'function balanceOf(address) view returns (uint256)',
  tokenOfOwnerByIndex: 'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
  factory: 'function factory() view returns (address)',
  positions: 'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  positionsAero: 'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  getPool: 'function getPool(address, address, uint24) view returns (address)',
  getPoolAero: 'function getPool(address, address, int24) view returns (address)',
  slot0: {
    [UNI]: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
    [PCS]: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool)',
    [AERO]: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, bool)',
  },
  ticks: {
    [UNI]: 'function ticks(int24) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56, uint160, uint32, bool)',
    [PCS]: 'function ticks(int24) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56, uint160, uint32, bool)',
    [AERO]: 'function ticks(int24) view returns (uint128 liquidityGross, int128 liquidityNet, int128 stakedLiquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, uint256 rewardGrowthOutsideX128, int56, uint160, uint32, bool)',
  },
  fg0: 'function feeGrowthGlobal0X128() view returns (uint256)',
  fg1: 'function feeGrowthGlobal1X128() view returns (uint256)',
};

const MOD = 2n ** 256n;
const Q128 = 2n ** 128n;
const sub = (a, b) => (((BigInt(a) - BigInt(b)) % MOD) + MOD) % MOD;

function feeGrowthInside(tick, lower, upper, tl, tu, g0, g1) {
  const below0 = tick >= lower ? BigInt(tl.feeGrowthOutside0X128) : sub(g0, tl.feeGrowthOutside0X128);
  const below1 = tick >= lower ? BigInt(tl.feeGrowthOutside1X128) : sub(g1, tl.feeGrowthOutside1X128);
  const above0 = tick < upper ? BigInt(tu.feeGrowthOutside0X128) : sub(g0, tu.feeGrowthOutside0X128);
  const above1 = tick < upper ? BigInt(tu.feeGrowthOutside1X128) : sub(g1, tu.feeGrowthOutside1X128);
  return [sub(sub(g0, below0), above0), sub(sub(g1, below1), above1)];
}

function amounts(liquidity, sqrtPriceX96, lower, upper) {
  const L = Number(liquidity);
  const sp = Number(sqrtPriceX96) / 2 ** 96;
  const sa = Math.sqrt(1.0001 ** lower), sb = Math.sqrt(1.0001 ** upper);
  if (sp <= sa) return [L * (sb - sa) / (sa * sb), 0];
  if (sp >= sb) return [0, L * (sb - sa)];
  return [L * (sb - sp) / (sp * sb), L * (sp - sa)];
}

const mc = async (chain, block, abi, calls) =>
  (await sdk.api.abi.multiCall({ chain, block, abi, calls, permitFailure: true })).output.map((o) => o.output);

// Reads pool state (tick, sqrtPrice, global fee growth, boundary ticks) for a list of positions at a block.
async function poolState(chain, block, positions) {
  const pools = positions.map((p) => p.pool);
  const slot0 = await Promise.all(positions.map((p) => mc(chain, block, ABI.slot0[p.type], [{ target: p.pool }]).then((r) => r[0])));
  const g0 = await mc(chain, block, ABI.fg0, pools.map((target) => ({ target })));
  const g1 = await mc(chain, block, ABI.fg1, pools.map((target) => ({ target })));
  const tl = await Promise.all(positions.map((p) => mc(chain, block, ABI.ticks[p.type], [{ target: p.pool, params: [p.tickLower] }]).then((r) => r[0])));
  const tu = await Promise.all(positions.map((p) => mc(chain, block, ABI.ticks[p.type], [{ target: p.pool, params: [p.tickUpper] }]).then((r) => r[0])));
  return positions.map((p, i) => {
    if (!slot0[i] || !tl[i] || !tu[i] || g0[i] == null || g1[i] == null) return null;
    const tick = Number(slot0[i].tick);
    return {
      sqrtPriceX96: slot0[i].sqrtPriceX96,
      fgi: feeGrowthInside(tick, p.tickLower, p.tickUpper, tl[i], tu[i], g0[i], g1[i]),
    };
  });
}

async function chainPools(chain) {
  const now = Math.floor(Date.now() / 1000);
  const [, blockPrior] = await utils.getBlocksByTime([now, now - 86400], chain);

  // 1. Enumerate every NFT each vault holds on its own NPM.
  const vaults = VAULTS[chain].map(([vault, type]) => ({ vault, type, npm: npmOf(chain, type) }));
  const bals = await mc(chain, undefined, ABI.balanceOf, vaults.map((v) => ({ target: v.npm, params: [v.vault] })));
  const idCalls = [], idOwners = [];
  vaults.forEach((v, i) => {
    for (let j = 0; j < Number(bals[i] || 0); j++) {
      idCalls.push({ target: v.npm, params: [v.vault, j] });
      idOwners.push(v);
    }
  });
  if (!idCalls.length) return [];
  const ids = await mc(chain, undefined, ABI.tokenOfOwnerByIndex, idCalls);

  // 2. Position data + pool address.
  const factories = {};
  for (const v of vaults) if (!factories[v.npm]) factories[v.npm] = (await mc(chain, undefined, ABI.factory, [{ target: v.npm }]))[0];
  let positions = [];
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] == null) continue;
    const v = idOwners[i];
    const [pos] = await mc(chain, undefined, v.type === AERO ? ABI.positionsAero : ABI.positions, [{ target: v.npm, params: [ids[i]] }]);
    if (!pos || BigInt(pos.liquidity) === 0n) continue;
    const feeOrSpacing = v.type === AERO ? pos.tickSpacing : pos.fee;
    positions.push({
      ...v, id: ids[i], token0: pos.token0, token1: pos.token1, feeOrSpacing,
      tickLower: Number(pos.tickLower), tickUpper: Number(pos.tickUpper), liquidity: pos.liquidity,
    });
  }
  const poolAddrs = await Promise.all(positions.map((p) =>
    mc(chain, undefined, p.type === AERO ? ABI.getPoolAero : ABI.getPool, [{ target: factories[p.npm], params: [p.token0, p.token1, p.feeOrSpacing] }]).then((r) => r[0])));
  positions = positions.map((p, i) => ({ ...p, pool: poolAddrs[i] })).filter((p) => p.pool);
  if (!positions.length) return [];

  // 3. Pool state now and 24h ago.
  const nowState = await poolState(chain, undefined, positions);
  const priorState = await poolState(chain, blockPrior, positions);

  // 4. Prices / decimals / symbols.
  const tokens = [...new Set(positions.flatMap((p) => [p.token0.toLowerCase(), p.token1.toLowerCase()]))];
  const keys = tokens.map((t) => `${chain}:${t}`).join(',');
  const coins = (await axios.get(`https://coins.llama.fi/prices/current/${keys}`)).data.coins;
  const decimals = await mc(chain, undefined, 'erc20:decimals', tokens.map((target) => ({ target })));
  const symbols = await mc(chain, undefined, 'erc20:symbol', tokens.map((target) => ({ target })));
  const info = Object.fromEntries(tokens.map((t, i) => [t, {
    price: coins[`${chain}:${t}`]?.price,
    decimals: Number(decimals[i] ?? coins[`${chain}:${t}`]?.decimals ?? 18),
    symbol: symbols[i] ?? coins[`${chain}:${t}`]?.symbol ?? 'UNKNOWN',
  }]));

  // 5. Aggregate per vault + pool.
  const agg = {};
  positions.forEach((p, i) => {
    const s = nowState[i];
    if (!s) return;
    const t0 = info[p.token0.toLowerCase()], t1 = info[p.token1.toLowerCase()];
    if (t0.price == null || t1.price == null) return;
    const [a0, a1] = amounts(p.liquidity, s.sqrtPriceX96, p.tickLower, p.tickUpper);
    const tvl = (a0 / 10 ** t0.decimals) * t0.price + (a1 / 10 ** t1.decimals) * t1.price;
    let fees = 0;
    const prior = priorState[i];
    if (prior) {
      const L = BigInt(p.liquidity);
      const f0 = Number((sub(s.fgi[0], prior.fgi[0]) * L) / Q128);
      const f1 = Number((sub(s.fgi[1], prior.fgi[1]) * L) / Q128);
      // guard against overflow-wrapped garbage (position re-ranged into uninitialised ticks)
      if (f0 < 1e40 && f1 < 1e40) fees = (f0 / 10 ** t0.decimals) * t0.price + (f1 / 10 ** t1.decimals) * t1.price;
    }
    const key = `${p.vault}-${p.pool}-${chain}`.toLowerCase();
    if (!agg[key]) {
      const feeLabel = p.type === AERO ? `CL${p.feeOrSpacing}` : `${Number(p.feeOrSpacing) / 10000}%`;
      agg[key] = {
        pool: key,
        chain: utils.formatChain(chain),
        project: 'quantum-pools',
        symbol: utils.formatSymbol(`${t0.symbol}-${t1.symbol}`),
        tvlUsd: 0,
        fees: 0,
        underlyingTokens: [p.token0, p.token1],
        poolMeta: `${DEX_NAME[p.type]} ${feeLabel}`,
        url: 'https://app.quantumpools.io',
      };
    }
    agg[key].tvlUsd += tvl;
    agg[key].fees += fees;
  });

  return Object.values(agg).map(({ fees, ...p }) => ({
    ...p,
    apyBase: p.tvlUsd > 0 ? ((fees * (1 - PERFORMANCE_FEE) * 365) / p.tvlUsd) * 100 : 0,
  }));
}

const apy = async () => {
  const out = [];
  for (const chain of Object.keys(VAULTS)) {
    try {
      out.push(...(await chainPools(chain)));
    } catch (e) {
      console.error(`quantum-pools ${chain} failed: ${e.message}`);
    }
  }
  return out.filter((p) => utils.keepFinite(p) && p.tvlUsd >= 1);
};

module.exports = {
  timetravel: false,
  protocolId: '8856',
  apy,
  url: 'https://app.quantumpools.io',
};
