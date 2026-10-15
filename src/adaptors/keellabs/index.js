const sdk = require('@defillama/sdk');
const utils = require('../utils');

// KeelLabs: every depositor gets their own vault (EIP-1167 clone) from a VaultFactory. Each vault
// holds ONE concentrated-liquidity NFT position on an underlying CL pool and a keeper keeps it in
// range. Here all Keel vaults sitting on the same underlying pool are aggregated into one yield pool.
//
// tvlUsd = idle token balances of each vault + the token amounts backing its open position.
// apyBase = net fees earned over the last 7 days by the vaults that currently hold capital,
// annualized, over their current TVL (fees of vaults emptied since are not counted). Every path that collects fees in a vault (plain collect, rebalance close, partial withdraw, exit)
// goes through the same internal function, which emits
//   PerfFeeTaken(address indexed treasury, uint256 fee0, uint256 fee1)
// with fee = gross * perfFeeBps / 10000 (perfFeeBps is read from the vault's factory). The fees the
// depositor keeps are therefore fee * (10000 - bps) / bps. All data is read on-chain.

const PROJECT = 'keellabs';
const DAYS = 7;

const PERF_FEE_TAKEN =
  'event PerfFeeTaken(address indexed treasury, uint256 fee0, uint256 fee1)';

const config = {
  arbitrum: {
    dex: 'Uniswap V3',
    npm: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factories: [
      '0xBfdDA6efE302fC8743Deb9cD7DB4A24Ffcb9E836',
      '0x3031B1661Bb584bBA566D74Ba0c86Ab6f525AF07',
      '0xAd7f3B6C7D16e19A3284BE0cE14578296feA471A',
      '0xF41AA2bb58952F490E2DFe437d50489Ac3c6A4bC',
      '0x3e682FEC310d297cB109AC0b1Fe53F4EB0C8a5F8',
      '0x61C6dEc573505125EBc2b7e569250262b8dF33bC',
      '0xDa877e3A5896dba00309684A5B40441f6A37e6e5',
      '0xcebfd0ed307e095b320d73fa83b770c693e164c9',
      '0x3bfe98518FBE39F368395EdB82a1D6e8A581Fe39',
    ],
  },
  robinhood: {
    dex: 'Uniswap V3',
    npm: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
    factories: [
      '0x7CfCEd5dFeF1884b057553B2b60F5d387005Cd3d',
      '0xAc17cF95525796F81587c47Bb78d4ce7a187e5C7',
      '0x62fC42AA2Aa1F8743d97daBeD925E70E04682a1c',
      '0x3031B1661Bb584bBA566D74Ba0c86Ab6f525AF07',
      '0x7c32443061e54681ebc9f8581E4fc2867A2D6384',
      '0x2fA41b881d194628160d7f95f10442Dc6BC5e06F',
      '0xc92bf423d730f1CA42F852d5Fc85467A10bCa572',
      '0xd4be8c553b7b26b3bae22b93498e035a4a923092',
      '0x041CA7A5F1113279edEC154B9B31Ee9380d55A70',
    ],
  },
  hyperliquid: {
    dex: 'Project X',
    npm: '0xeaD19AE861c29bBb2101E834922B2FEee69B9091',
    factories: [
      '0x9d1B8796FB080e07aa26F26765f12e2012DD0d26',
      '0x811e2843c2a55b70D9C867988D69E624c35dAF4C',
      '0x609B9A1c089cb29a38bf19901a39259493997AB4',
      '0x1E2c70bbEB3A156443B6ECBa23105FedD74a71a8',
      '0xb2AA23f1664dB2AC87816ad69a2C19f217F57fc4',
      '0x309b918A4EBf5aB960B7787FE154d10229ED928b',
      '0xf02a1944b264dad67ed096c00d27c2b6d846faa9',
      '0xbE14445dcDab8d00d8497b3BA09CB2bA156353Fc',
    ],
  },
  bsc: {
    dex: 'PancakeSwap V3',
    npm: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    factories: [
      '0x52dc92C7e3FdbD4fff7892dFc9DC7bc1d7a01ecf',
      '0x0982a86fc8e14653f263f1fe08d0f32227e383ff',
      '0x1326b172e8419b6057e85fAA3605826b2DddAB60',
    ],
  },
  base: {
    dex: 'Aerodrome Slipstream',
    npm: '0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53',
    factories: ['0xa215f5c5b1A0Fc322376593F75fA422fcEB6712d'],
  },
  ethereum: {
    dex: 'Uniswap V3',
    npm: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factories: ['0xcc5E6AE42dD0D3DB2aD9016994cFEf460d05E781'],
  },
};

const abi = {
  vaultsCount: 'uint256:vaultsCount',
  allVaults: 'function allVaults(uint256) view returns (address)',
  perfFeeBps: 'uint16:perfFeeBps',
  pool: 'address:pool',
  token0: 'address:token0',
  token1: 'address:token1',
  tokenId: 'uint256:tokenId',
  fee: 'uint24:fee',
  decimals: 'uint8:decimals',
  symbol: 'string:symbol',
  balanceOf: 'function balanceOf(address) view returns (uint256)',
  // Only the first two words of slot0 are read; they are identical across Uniswap V3,
  // PancakeSwap V3, PRJX and Aerodrome Slipstream.
  slot0: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick)',
  // Uniswap-style positions(); on Slipstream word 4 is tickSpacing instead of fee (unused here).
  positions:
    'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
};

const Q96 = 2 ** 96;

// token amounts (raw units) backing `liquidity` between two ticks at the current pool price
const positionAmounts = (liquidity, tickLower, tickUpper, sqrtPriceX96) => {
  const L = Number(liquidity);
  if (!L) return [0, 0];
  const sp = Number(sqrtPriceX96) / Q96;
  const sa = Math.sqrt(1.0001 ** Number(tickLower));
  const sb = Math.sqrt(1.0001 ** Number(tickUpper));
  if (sp <= sa) return [(L * (sb - sa)) / (sa * sb), 0];
  if (sp >= sb) return [0, L * (sb - sa)];
  return [(L * (sb - sp)) / (sp * sb), L * (sp - sa)];
};

const getChainPools = async (chain) => {
  const { dex, npm, factories } = config[chain];
  const api = new sdk.ChainApi({ chain });

  // ---- vaults and the factory each one belongs to
  const lists = await Promise.all(
    factories.map((target) =>
      api.fetchList({
        target,
        lengthAbi: abi.vaultsCount,
        itemAbi: abi.allVaults,
      })
    )
  );
  const bpsList = await api.multiCall({
    calls: factories,
    abi: abi.perfFeeBps,
    permitFailure: true,
  });
  const vaults = [];
  const vaultBps = [];
  lists.forEach((list, i) =>
    list.forEach((v) => {
      vaults.push(v);
      vaultBps.push(Number(bpsList[i] || 0));
    })
  );
  if (!vaults.length) return [];

  const [pools, token0s, token1s, tokenIds] = await Promise.all([
    api.multiCall({ calls: vaults, abi: abi.pool, permitFailure: true }),
    api.multiCall({ calls: vaults, abi: abi.token0, permitFailure: true }),
    api.multiCall({ calls: vaults, abi: abi.token1, permitFailure: true }),
    api.multiCall({ calls: vaults, abi: abi.tokenId, permitFailure: true }),
  ]);

  const idx = vaults
    .map((_, i) => i)
    .filter((i) => pools[i] && token0s[i] && token1s[i]);

  // ---- idle balances held by each vault (owner-withdrawable)
  const [bal0, bal1] = await Promise.all([
    api.multiCall({
      calls: idx.map((i) => ({ target: token0s[i], params: [vaults[i]] })),
      abi: abi.balanceOf,
      permitFailure: true,
    }),
    api.multiCall({
      calls: idx.map((i) => ({ target: token1s[i], params: [vaults[i]] })),
      abi: abi.balanceOf,
      permitFailure: true,
    }),
  ]);

  // ---- open CL positions
  const withPos = idx.filter((i) => tokenIds[i] && tokenIds[i] !== '0');
  const positions = await api.multiCall({
    target: npm,
    calls: withPos.map((i) => tokenIds[i]),
    abi: abi.positions,
    permitFailure: true,
  });
  const posByVault = {};
  withPos.forEach((i, k) => (posByVault[i] = positions[k]));

  // ---- underlying pool state
  const uniqPools = [...new Set(idx.map((i) => pools[i].toLowerCase()))];
  const [slot0s, fees] = await Promise.all([
    api.multiCall({ calls: uniqPools, abi: abi.slot0, permitFailure: true }),
    api.multiCall({ calls: uniqPools, abi: abi.fee, permitFailure: true }),
  ]);
  const poolState = {};
  uniqPools.forEach(
    (p, k) => (poolState[p] = { slot0: slot0s[k], fee: fees[k] })
  );

  // ---- token metadata and prices
  const tokens = [
    ...new Set(
      idx.flatMap((i) => [token0s[i].toLowerCase(), token1s[i].toLowerCase()])
    ),
  ];
  const [decimals, symbols, prices] = await Promise.all([
    api.multiCall({ calls: tokens, abi: abi.decimals, permitFailure: true }),
    api.multiCall({ calls: tokens, abi: abi.symbol, permitFailure: true }),
    utils.getPrices(tokens, chain),
  ]);
  const tok = {};
  tokens.forEach((t, k) => {
    tok[t] = {
      decimals: Number(decimals[k] ?? 18),
      symbol: symbols[k],
      price: prices.pricesByAddress[t],
    };
  });
  const usd = (token, raw) => {
    const t = tok[token.toLowerCase()];
    if (!t || !t.price) return 0;
    return (Number(raw) / 10 ** t.decimals) * t.price;
  };

  // ---- current value of each vault: idle balances + its open CL position
  const vaultUsd = {};
  idx.forEach((i, k) => {
    const state = poolState[pools[i].toLowerCase()];
    let amt0 = Number(bal0[k] || 0);
    let amt1 = Number(bal1[k] || 0);
    const pos = posByVault[i];
    if (pos && state && state.slot0) {
      const [x0, x1] = positionAmounts(
        pos.liquidity,
        pos.tickLower,
        pos.tickUpper,
        state.slot0.sqrtPriceX96
      );
      amt0 += x0 + Number(pos.tokensOwed0 || 0);
      amt1 += x1 + Number(pos.tokensOwed1 || 0);
    }
    vaultUsd[i] = usd(token0s[i], amt0) + usd(token1s[i], amt1);
  });

  // ---- net fees earned over the last DAYS days by the vaults that currently hold capital
  // (fees of vaults that have since been emptied are not attributed to capital still deployed)
  const funded = idx.filter((i) => vaultUsd[i] >= 1);
  const toBlock = (await api.getBlock()) - 5;
  const logs = funded.length
    ? await sdk.getEventLogs({
        chain,
        targets: funded.map((i) => vaults[i]),
        eventAbi: PERF_FEE_TAKEN,
        fromTimestamp: Math.floor(Date.now() / 1000) - DAYS * 86400,
        toBlock,
        onlyArgs: true,
        flatten: false,
      })
    : [];

  // ---- aggregate per underlying pool
  const agg = {};
  idx.forEach((i) => {
    const p = pools[i].toLowerCase();
    if (!agg[p]) {
      const state = poolState[p];
      agg[p] = {
        token0: token0s[i],
        token1: token1s[i],
        fee: state && state.fee,
        tvlUsd: 0,
        feesUsd: 0,
      };
    }
    agg[p].tvlUsd += vaultUsd[i];
  });
  funded.forEach((i, k) => {
    const bps = vaultBps[i];
    if (!bps) return;
    for (const { fee0, fee1 } of logs[k] || []) {
      const perfFeeUsd = usd(token0s[i], fee0) + usd(token1s[i], fee1);
      agg[pools[i].toLowerCase()].feesUsd += (perfFeeUsd * (10000 - bps)) / bps;
    }
  });

  return Object.entries(agg)
    .filter(([, a]) => a.tvlUsd >= 1)
    .map(([p, a]) => {
      const t0 = tok[a.token0.toLowerCase()];
      const t1 = tok[a.token1.toLowerCase()];
      const apr =
        a.tvlUsd > 0 ? (a.feesUsd / a.tvlUsd) * (365 / DAYS) * 100 : 0;
      const feeTier =
        a.fee !== undefined && a.fee !== null ? ` ${Number(a.fee) / 1e4}%` : '';
      return {
        pool: `${p}-keellabs-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: PROJECT,
        symbol: utils.formatSymbol(`${t0.symbol}-${t1.symbol}`),
        tvlUsd: a.tvlUsd,
        apyBase: apr,
        underlyingTokens: [a.token0, a.token1],
        poolMeta: `${dex}${feeTier}`,
        url: 'https://keellabs.app',
        token: null,
      };
    });
};

const apy = async () => {
  const results = await Promise.allSettled(
    Object.keys(config).map((chain) => getChainPools(chain))
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected')
      console.error(
        `keellabs ${Object.keys(config)[i]}:`,
        r.reason?.message || r.reason
      );
  });
  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '8357',
  timetravel: false,
  apy,
  url: 'https://keellabs.app',
};
