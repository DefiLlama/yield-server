// UnblockEquity yield adapter for DefiLlama yield-server
// 24 MetaMorpho V2 vaults on Base — USDC lending against tokenized residential property liens.
//
// TVL  : live totalAssets() per vault (ERC4626), summed via SDK multicall.
// APY  : live supply APY computed from each market's Morpho Blue IRM:
//          supply APY = (1 + borrowRatePerSec)^(secondsPerYear) - 1, scaled by
//          utilization × (1 - fee). Mirrors Morpho's own SDK math.
//        Vaults are NOT yet whitelisted in Morpho's GraphQL API, so this
//        adapter goes directly to chain via DefiLlama SDK.

const sdk = require('@defillama/sdk');

const CHAIN = 'base';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
const SECONDS_PER_YEAR = 31_536_000;

// 24 vaults: { id, vault, marketId, name }
// id format: {Verification}-{Recovery}-{BreathingRoom}
const VAULTS = [
  { id: 'V-LO-NONE', vault: '0x287397Fd29aBCdb1f514179099121895A2f5bEAF', marketId: '0x986fdbe36a48d06b417e2478df6a36749b6bc3007d213d64a663717457dfc145', name: 'Verified Lien-Only' },
  { id: 'V-LO-BR3',  vault: '0x376736A69B8F9c350F76E0b2802466Eaee7E058f', marketId: '0x7a829ded90784f87677ce6c3937e3be72fe50dff94b88c270801297bfee2a1d1', name: 'Verified Lien BR3' },
  { id: 'V-LO-BR6',  vault: '0xd6313868B5CeBAd6fDc3aE48F80917B385C01c71', marketId: '0x2200d499132537a83f7ef3819523ace5be21c56ac34db532e3d90d9b2fdb4994', name: 'Verified Lien BR6' },
  { id: 'V-LO-BR12', vault: '0x2FFcbDEa42311515E3dB1F873A1Cea0D463B5Ced', marketId: '0x15161eae104e3be16ae1396a92fd36edfd8f68915e309a4268f2d224243b77fc', name: 'Verified Lien BR12' },
  { id: 'V-FC-NONE', vault: '0x0eD4c2cfff2Ec06079e723F51aeFC8cdF073ea68', marketId: '0xbceb193d1d38c2175cbbb67150adea23faa59bea039bf98ff24ea87c1f519dd9', name: 'Verified Foreclosure' },
  { id: 'V-FC-BR3',  vault: '0x34dDd63FEA2868EeF439279D6FeCa7d5AcFc4F53', marketId: '0xf0ef2374ca4e72dcbaafb121a5b2fa6fa37c90aef94285d94f0c585a50f8dffc', name: 'Verified FC BR3' },
  { id: 'V-FC-BR6',  vault: '0xc24C630D27CBF1Da6A78B09821212eb9c5e1be40', marketId: '0xbcdbaf745449618885bc9b191b08b9eae0a89b03bd6cc33934e8a978dba4d23a', name: 'Verified FC BR6' },
  { id: 'V-FC-BR12', vault: '0x8E246a89a7F8ffD4efD7d037bD585F7741C0C482', marketId: '0x363c5d37ecf3d6aaf3a2c863d4af15bb776ddb618d9251c290367af2b4f56d4d', name: 'Verified FC BR12' },
  { id: 'P-LO-NONE', vault: '0x13D2E770cefB62A8Aa4e3393d59F88707AbD4dd5', marketId: '0xf0ff0e31eac71ca3b145e4f8b37c2b0d6d594e7c234216c36e1f7c5ce6561f14', name: 'Prime Lien-Only' },
  { id: 'P-LO-BR3',  vault: '0xCc19805E91C66Ca6a3dd437E8F6d579ca9727804', marketId: '0x6b78a3ac1937aa4a4c3177e870b93676f9227d3a8d4ea220dcf3e6123d836e6c', name: 'Prime Lien BR3' },
  { id: 'P-LO-BR6',  vault: '0x2018963CA1e5ACeb88B7fA8738e4AEC846beD752', marketId: '0xcbe9f0f9be21b71a1e0d8c37a3b1b63a43516191e912219a9ae2d1e23ec602aa', name: 'Prime Lien BR6' },
  { id: 'P-LO-BR12', vault: '0x618fFcf6fF74dC3766B892B7913BF5074B913eF2', marketId: '0x8a6e7b507ba9fe2b2a0fc57ee53b024ebd4cc5352ce53c97e6f794d7a1d1fb9b', name: 'Prime Lien BR12' },
  { id: 'P-FC-NONE', vault: '0x12d6bA2c11Bbb96F8f91b0412593b87dB4E2ABE2', marketId: '0xa156f1200b5619a67d78a694b59d3f6c2327fedd68d4faf712c0f9aea66a9eff', name: 'Prime Foreclosure' },
  { id: 'P-FC-BR3',  vault: '0xFC274721AFdd37dB10419d08bd0db59E5Fcfb219', marketId: '0x90153d38066e766ed2253d015e9dc4992b4dc1ae3d7f01b17b9fe6ab48da38d7', name: 'Prime FC BR3' },
  { id: 'P-FC-BR6',  vault: '0x098A23332008Cffaf283E3b0e8EcDEcfDeb6849c', marketId: '0xd0aab26e360613fa8d1bdbea06dedda8d10a2942269569715640be4475f4d3ce', name: 'Prime FC BR6' },
  { id: 'P-FC-BR12', vault: '0xf6EA5C33F0D33B56AAda9AF7Dd1C4203BB83C82F', marketId: '0xed7346873bf45e21d2e623ba36fc004ad7c2c968a9f81375666aa06cd7b4e190', name: 'Prime FC BR12' },
  { id: 'S-LO-NONE', vault: '0x2BE1d9ddBbd70E7b148E8AdE884600268a0B28BD', marketId: '0x39ed69b74b75b2c1487c7f96e6a744d0fa5369a7f3bacb0b8a253687650e107c', name: 'Standard Lien-Only' },
  { id: 'S-LO-BR3',  vault: '0x060b5d11B1303FaB362bAF100EB37601F04C2AFD', marketId: '0xb992bed8501e65df324a530cf0aefc1f8f6928dcb18c8c44014f165138f92058', name: 'Standard Lien BR3' },
  { id: 'S-LO-BR6',  vault: '0x8Dfc0CaF025E62C634Ea179Ce04015f3ae51938a', marketId: '0x463ec5463398aafe277de322c600a3fd21ed4c9c24a395bc4c332043bfbf8cf1', name: 'Standard Lien BR6' },
  { id: 'S-LO-BR12', vault: '0x012f6f383F13BD437DFBfCBe94D1A8C5fC40E650', marketId: '0xf8c7456ba569730162a499aa3cbc8023a23d619863d7ccb5a64a0b48730a5561', name: 'Standard Lien BR12' },
  { id: 'S-FC-NONE', vault: '0xef7EEeed223a45EB09808F98cA2B15cA16C7306D', marketId: '0xa215e2d5bf02bb47558b24ddb1f23c41d03dd257d3d371f9c0162abafdacc0c8', name: 'Standard Foreclosure' },
  { id: 'S-FC-BR3',  vault: '0x4d390F54327b8d4ca6DFaF8db58BCFdF0270697b', marketId: '0xc50b36a93f2d0315344f0de53665b7d795bc7b887a324ec0191c9a9e41570923', name: 'Standard FC BR3' },
  { id: 'S-FC-BR6',  vault: '0xE6dfc9b8057135165B1aAAA741FbbBe0aF416104', marketId: '0x3cff87edbc5b52ce33155df9503915f84a9f2515911d33430863c61d4442f1fb', name: 'Standard FC BR6' },
  { id: 'S-FC-BR12', vault: '0x01EB25A573F1e86f46326B0DD1b4AB344ccB168E', marketId: '0x2f72395ca8aaaee20aad0a52c0ae379b76c47006d7b86c516c25d5fc46c6ccd7', name: 'Standard FC BR12' },
];

// Morpho market struct: (uint128 supplyAssets, uint128 supplyShares, uint128 borrowAssets,
//                        uint128 borrowShares, uint128 lastUpdate, uint128 fee)
const MARKET_ABI = {
  name: 'market',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ type: 'bytes32', name: 'id' }],
  outputs: [
    { type: 'uint128', name: 'totalSupplyAssets' },
    { type: 'uint128', name: 'totalSupplyShares' },
    { type: 'uint128', name: 'totalBorrowAssets' },
    { type: 'uint128', name: 'totalBorrowShares' },
    { type: 'uint128', name: 'lastUpdate' },
    { type: 'uint128', name: 'fee' },
  ],
};

const MARKET_PARAMS_ABI = {
  name: 'idToMarketParams',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ type: 'bytes32', name: 'id' }],
  outputs: [
    { type: 'address', name: 'loanToken' },
    { type: 'address', name: 'collateralToken' },
    { type: 'address', name: 'oracle' },
    { type: 'address', name: 'irm' },
    { type: 'uint256', name: 'lltv' },
  ],
};

// IRM.borrowRateView((MarketParams), (Market)) -> uint256 ratePerSecondWad
const IRM_BORROW_RATE_VIEW_ABI = {
  name: 'borrowRateView',
  type: 'function',
  stateMutability: 'view',
  inputs: [
    {
      type: 'tuple',
      name: 'marketParams',
      components: [
        { type: 'address', name: 'loanToken' },
        { type: 'address', name: 'collateralToken' },
        { type: 'address', name: 'oracle' },
        { type: 'address', name: 'irm' },
        { type: 'uint256', name: 'lltv' },
      ],
    },
    {
      type: 'tuple',
      name: 'market',
      components: [
        { type: 'uint128', name: 'totalSupplyAssets' },
        { type: 'uint128', name: 'totalSupplyShares' },
        { type: 'uint128', name: 'totalBorrowAssets' },
        { type: 'uint128', name: 'totalBorrowShares' },
        { type: 'uint128', name: 'lastUpdate' },
        { type: 'uint128', name: 'fee' },
      ],
    },
  ],
  outputs: [{ type: 'uint256', name: '' }],
};

function computeSupplyApy(ratePerSecWad, supply, borrow, feeWad) {
  if (!supply || supply === 0n) return 0;
  const rate = Number(ratePerSecWad) / 1e18;
  const borrowApy = (Math.pow(1 + rate, SECONDS_PER_YEAR) - 1) * 100;
  const utilization = Number(borrow) / Number(supply);
  const feeFactor = 1 - Number(feeWad) / 1e18;
  return borrowApy * utilization * feeFactor;
}

const poolsFunction = async () => {
  // 1a. TVL — multicall totalAssets() across all 24 vaults
  const totalAssetsRes = await sdk.api.abi.multiCall({
    abi: 'uint256:totalAssets',
    calls: VAULTS.map((v) => ({ target: v.vault })),
    chain: CHAIN,
  });

  // 1b. Share supply — needed for pricePerShare
  const totalSharesRes = await sdk.api.abi.multiCall({
    abi: 'erc20:totalSupply',
    calls: VAULTS.map((v) => ({ target: v.vault })),
    chain: CHAIN,
  });

  // 2. Market state — multicall market(id) across all 24 markets
  const marketRes = await sdk.api.abi.multiCall({
    abi: MARKET_ABI,
    calls: VAULTS.map((v) => ({ target: MORPHO_BLUE, params: [v.marketId] })),
    chain: CHAIN,
  });

  // 3. Market params — multicall idToMarketParams(id)
  const paramsRes = await sdk.api.abi.multiCall({
    abi: MARKET_PARAMS_ABI,
    calls: VAULTS.map((v) => ({ target: MORPHO_BLUE, params: [v.marketId] })),
    chain: CHAIN,
  });

  // 4. Borrow rate per market — only call if market has supply.
  //    Target the market's own IRM address (from market params) so this stays
  //    correct if any market ever uses a non-AdaptiveCurve IRM in the future.
  const irmCalls = VAULTS.map((v, i) => {
    const m = marketRes.output[i]?.output;
    const p = paramsRes.output[i]?.output;
    if (!m || !p || BigInt(m.totalSupplyAssets || 0) === 0n) return null;
    return {
      target: p.irm,
      params: [
        [p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv],
        [m.totalSupplyAssets, m.totalSupplyShares, m.totalBorrowAssets, m.totalBorrowShares, m.lastUpdate, m.fee],
      ],
    };
  });

  const irmRes = await sdk.api.abi.multiCall({
    abi: IRM_BORROW_RATE_VIEW_ABI,
    calls: irmCalls.filter((c) => c !== null),
    chain: CHAIN,
    permitFailure: true,
  });

  // Symmetric guard with the TVL check: if every funded market's borrowRateView
  // failed, all pools would silently publish apyBase = 0 — abort instead.
  const expectedRateCalls = irmCalls.filter((c) => c !== null).length;
  const successfulRateCalls = irmRes.output.filter(
    (r) => r?.success !== false && r?.output != null
  ).length;
  if (expectedRateCalls > 0 && successfulRateCalls === 0) {
    throw new Error('unblock-equity: failed to fetch borrowRateView() for all funded markets');
  }

  // Map borrow-rate responses back to vault indices
  const rateByIndex = new Map();
  let rateCursor = 0;
  for (let i = 0; i < VAULTS.length; i++) {
    if (irmCalls[i] !== null) {
      rateByIndex.set(i, irmRes.output[rateCursor]?.output);
      rateCursor += 1;
    }
  }

  // 5. Assemble pools + count failures for RPC-outage guard
  // pricePerShare: assets-per-share, in human units.
  //   assets = USDC (6 dec), shares = vault token (18 dec).
  //   pricePerShare = (totalAssets * 10^12) / totalSupply, with 1.0 fallback for empty vaults.
  let tvlFailures = 0;
  const pools = VAULTS.map((v, i) => {
    const totalAssetsRaw = totalAssetsRes.output[i]?.output;
    let tvlUsd = 0;
    if (totalAssetsRaw == null) {
      tvlFailures += 1;
    } else {
      tvlUsd = Number(totalAssetsRaw) / 1e6;
    }

    const totalSharesRaw = totalSharesRes.output[i]?.output;
    let pricePerShare = 1;
    if (totalAssetsRaw != null && totalSharesRaw != null && BigInt(totalSharesRaw) > 0n) {
      // shares are 18-dec, assets are 6-dec → scale by 10^12 to express pps in assets
      const scaled = (BigInt(totalAssetsRaw) * 10n ** 12n * 10n ** 9n) / BigInt(totalSharesRaw);
      pricePerShare = Number(scaled) / 1e9;
    }

    const m = marketRes.output[i]?.output;
    const rate = rateByIndex.get(i);
    let apyBase = 0;
    if (m && rate != null) {
      apyBase = computeSupplyApy(
        BigInt(rate),
        BigInt(m.totalSupplyAssets || 0),
        BigInt(m.totalBorrowAssets || 0),
        BigInt(m.fee || 0),
      );
    }

    return {
      pool: `${v.vault.toLowerCase()}-base`,
      chain: 'Base',
      project: 'unblock-equity',
      symbol: 'USDC',
      tvlUsd,
      apyBase,
      pricePerShare,
      underlyingTokens: [USDC],
      url: 'https://app.unblockequity.com/earn',
      poolMeta: v.name,
    };
  });

  if (tvlFailures === VAULTS.length) {
    throw new Error('unblock-equity: failed to fetch totalAssets() for all vaults');
  }

  return pools;
};

module.exports = {
  protocolId: '7796',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.unblockequity.com/earn',
};
