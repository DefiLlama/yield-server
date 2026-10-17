const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Borro (borro.markets) is a stock loan desk on Robinhood Chain built on Morpho. It curates one Morpho Vault V2 per
// stock, which lends the stock to shorters through its own isolated Morpho Blue market, and one USDG vault (bUSDG),
// which lends USDG against those stock vaults' shares in isolated Morpho Blue markets.
//
// apyBase: what the vault's Morpho markets pay its lenders now (borrow rate from the market's IRM, times
// utilization, less the market fee), weighted by what the vault supplies to each market, less the vault's
// performance fee.
// apyReward: the $BORRO Drip, a fixed on-chain schedule (BorroDrip) paid daily to lenders by deposit value,
// 60% to stock lenders and 40% to USDG lenders. The day's amount is read from the schedule on chain and valued at
// $BORRO's price; each side is divided by that side's whole TVL (the Drip counts eligible deposits only, so this
// is the conservative figure).
const CHAIN = 'robinhood';
const MORPHO = '0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010';
const DRIP = '0x2bb82b74623df82135a06f737ed16323f9bc8115';
const BORRO = '0x89b76dcdda801f2e456765742c64950eb2a0c93c'; // $BORRO, the coin BorroDrip pays (its token())
const BORRO_GECKO_ID = 'borro-markets';
const USDG_VAULT = '0xf8e0ab443098c0738489b5baffbd32a1341f2289';
const USDG_ADAPTER = '0x45233242b7afa26bd36cd7e7c9db23bd8668cbec';
const STOCK_SHARE = 0.6;
const USDG_SHARE = 0.4;
const DAY = 86400;
const SECONDS_PER_YEAR = 365 * DAY;

// symbol: [stock vault, its market adapter, the stock-loan market id, the USDG market id]
const DESKS = {
  SPY: ['0xc3ed4a5a7db4102f4ed37af26ef0d3f21e2360c1', '0x852901d03805020d4f714b3e15d3d45c4a326427', '0x1cd22321a4d27054a8cd029c73c53432e8a231f8df1a3981b1ae1c274175d381', '0xb1453a889f92101054ab8095e0cc5e303f8c797f6ece3f688c7a1e1780a134a6'],
  QQQ: ['0xbad8a97da1050092d6a14194d53e72d407d6cc17', '0x8d4d75f43da7b2d6eee6414ec1096cd48a7c8aee', '0xfbeb9596a8a0202dde46de7a49af15ee963c8678a71edb6dd1c8b283595cbdae', '0xea3cf9bf1f245dc905b007312ca7f9cc83ddd4f163398fa2ff22a829d8615454'],
  NVDA: ['0x508e23274c39c60c345e35b1f0188be180717cb9', '0x6a4e9c59c263f55d7c65343c004fcf5189e210df', '0x7ff4053d7caa99de7aa19febadcc2178377e8a31b163046539d6fb35c5abc08b', '0xf3524baf7647833311fe49cfea9153664b0284574e804f5078ec7e100fb86529'],
  TSLA: ['0x60b3d353e7e5bd12ed4ea2589c11b5603dd4c988', '0x2a8da2814d2087eebeda53012c54249c47bd23a5', '0x5c0a634f28ac0f699be3b2db5265a935d63cfb680fd28bc5b225adaaabda8b88', '0x0036d2bac326d26797b9247d61db7b034290cad2bb210f1c6e6853ad0e4fbf0f'],
  MSTR: ['0x2b74f8f2b76cd4e97265bc37fb2578a04b8437e9', '0xe6ee3d1cbd208c3380dbfe72ad02c9898479aa2b', '0x0fc6938b8b73689ee822ff59b775972931f33dfda49880b43b05a14396111a9d', '0xcc55ee44304cf35b1ad5b10512619a7101d0d4424750b8075338501d571dbccb'],
  COIN: ['0x7ba71bccecb12860ae7e141b6b6f1f8b96d31257', '0x9e5277c993b7722c5f522ee87cc90af9de1e46e1', '0x7eb15a4033030e5cbf34ea1823545b918d29e5e59e7d8c1d35aee2df3e114c98', '0xd6dd43ddb2ffeb1119e2df2a651b342b323ab34fa9bb39dfb5651717f909e997'],
  PLTR: ['0xfe9419e70e5481f7a2ddddc18f856b09b3687b27', '0xf561b62990f491fb92266bb81d85ae5cc8dac734', '0x85571555a4d98cb7efaf91ffd5a9d6b2db33d4a631c6b16633e537ac6cb4b590', '0x405485f81cee0d066bd29d3556b17f5c50b01f542314d52ca93612f1d0a315ca'],
  SPCX: ['0x1261210e19052157fce2064d9aa9a2140bd89791', '0x8ac106efa66423e2ce4438153a4040b521283183', '0x4219a85fc09ae2ff5d3aa29013c67c89142f80a9c71d5c15ed7dbf9f6e14ae81', '0xb7da3d3030524ffc9438524054d4adf337904e228a842f8b35bf472ad16426e6'],
  GME: ['0x328461fb01f54c2ab73909ea947c583d0dc24c3d', '0x6b80c9c8e4d1c7b772ed6cd2ccfb5043c06d3f71', '0xde233c6decb5b2ad4a2fd63ef8c95ee9b1934c0bd849e87fb5604e845ceb2c82', '0x75d38c9976e6d899662a19a39ac679cfbf711edb6e8ea4762ad2746c480f894c'],
  AAPL: ['0x24fe7bcaeb75bc2202a42ecd48a177a27782c64a', '0xc3e15c9a7bbd5fead0cf3e6ee6d3820cc007833a', '0x5242d7dcb608526f2f76b3f6914b9adf34634cdf67220c54bfce0718540c4550', '0x4cb59d58f0752990c41de36de0fe47a28179f50e69eae0cc727011162614ddcc'],
  GOOGL: ['0xf0731b1022abd1e3f543cfd837c7eba42ed60e4f', '0x4dfcbdb111cdbbe5b9d62ea0a6a1edebdd808022', '0x5826469e3b7df54fe18c921aafe850865552bc79b366a90ad0dc23c330ee0b75', '0x3abd7c179f694a9b3cf1008c97aa005ace5c6378e0298007154c563d3fd5b1a1'],
  MSFT: ['0x8032c80a7817a3c4c401b096515b27b2ceda4e71', '0x9741b3b9de584de3a9e80ea53bab99ebfaef40df', '0x00f685fcd58b2a04c6953ac74b5d6b8f288e45e9a393077acf6711d6c51957bf', '0x098b730c59fbac64a01db3d3e0751386c2a68ced08754170a74ffdb9c6d0ed57'],
};

const MARKET_PARAMS_ABI = 'function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)';
const MARKET_ABI = 'function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)';
const POSITION_ABI = 'function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)';
const IRM_ABI = {
  name: 'borrowRateView',
  type: 'function',
  stateMutability: 'view',
  inputs: [
    { type: 'tuple', name: 'marketParams', components: [
      { type: 'address', name: 'loanToken' }, { type: 'address', name: 'collateralToken' }, { type: 'address', name: 'oracle' },
      { type: 'address', name: 'irm' }, { type: 'uint256', name: 'lltv' },
    ] },
    { type: 'tuple', name: 'market', components: [
      { type: 'uint128', name: 'totalSupplyAssets' }, { type: 'uint128', name: 'totalSupplyShares' }, { type: 'uint128', name: 'totalBorrowAssets' },
      { type: 'uint128', name: 'totalBorrowShares' }, { type: 'uint128', name: 'lastUpdate' }, { type: 'uint128', name: 'fee' },
    ] },
  ],
  outputs: [{ type: 'uint256', name: '' }],
};

const multi = async (abi, calls) => (await sdk.api.abi.multiCall({ abi, calls, chain: CHAIN })).output.map((o) => o.output);

// Supply APY of a Morpho Blue market, in %: borrow APY from the IRM's per-second rate, times utilization, less the
// market fee.
const supplyApy = (rateWad, m) => {
  const supply = Number(m.totalSupplyAssets);
  if (!supply) return 0;
  const borrowApy = Math.pow(1 + Number(rateWad) / 1e18, SECONDS_PER_YEAR) - 1;
  return borrowApy * (Number(m.totalBorrowAssets) / supply) * (1 - Number(m.fee) / 1e18) * 100;
};

// Assets a supplier holds in a market, from its supply shares.
const supplied = (pos, m) => (Number(m.totalSupplyShares) ? (Number(pos.supplyShares) * Number(m.totalSupplyAssets)) / Number(m.totalSupplyShares) : 0);

const apy = async () => {
  const symbols = Object.keys(DESKS);
  const vaults = [...symbols.map((s) => DESKS[s][0]), USDG_VAULT];

  const [assets, totalAssets, perfFees] = await Promise.all([
    multi('address:asset', vaults.map((target) => ({ target }))),
    multi('uint256:totalAssets', vaults.map((target) => ({ target }))),
    multi('uint96:performanceFee', vaults.map((target) => ({ target }))),
  ]);
  const decimals = await multi('erc20:decimals', assets.map((target) => ({ target })));

  // Every market the vaults supply: each stock vault's stock-loan market, and the USDG vault's USDG markets.
  const marketIds = [...symbols.map((s) => DESKS[s][2]), ...symbols.map((s) => DESKS[s][3])];
  const suppliers = [...symbols.map((s) => DESKS[s][1]), ...symbols.map(() => USDG_ADAPTER)];
  const [params, markets, positions] = await Promise.all([
    multi(MARKET_PARAMS_ABI, marketIds.map((id) => ({ target: MORPHO, params: [id] }))),
    multi(MARKET_ABI, marketIds.map((id) => ({ target: MORPHO, params: [id] }))),
    multi(POSITION_ABI, marketIds.map((id, i) => ({ target: MORPHO, params: [id, suppliers[i]] }))),
  ]);
  const rates = await multi(IRM_ABI, marketIds.map((_, i) => {
    const p = params[i], m = markets[i];
    return {
      target: p.irm,
      params: [
        [p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv],
        [m.totalSupplyAssets, m.totalSupplyShares, m.totalBorrowAssets, m.totalBorrowShares, m.lastUpdate, m.fee],
      ],
    };
  }));

  // The Drip: the day's $BORRO from the on-chain schedule (nothing once the schedule is stopped).
  const now = Math.floor(Date.now() / 1000);
  const [stoppedAt, sNow, sNext] = await Promise.all([
    sdk.api.abi.call({ target: DRIP, abi: 'uint256:stoppedAt', chain: CHAIN }).then((r) => Number(r.output)),
    sdk.api.abi.call({ target: DRIP, abi: 'function scheduled(uint256) view returns (uint256)', params: [now], chain: CHAIN }).then((r) => r.output),
    sdk.api.abi.call({ target: DRIP, abi: 'function scheduled(uint256) view returns (uint256)', params: [now + DAY], chain: CHAIN }).then((r) => r.output),
  ]);
  const dripPerDay = stoppedAt ? 0 : (Number(sNext) - Number(sNow)) / 1e18;

  const { pricesByAddress } = await utils.getPrices(assets, CHAIN);
  const price = (a) => pricesByAddress[a.toLowerCase()];
  // $BORRO is priced through its CoinGecko listing (borro-markets), as on Borro's DefiLlama protocol page.
  const borroPrices = (await utils.getPrices([`coingecko:${BORRO_GECKO_ID}`])).pricesByAddress;

  const tvl = vaults.map((_, i) => (Number(totalAssets[i]) / 10 ** Number(decimals[i])) * (price(assets[i]) || 0));
  const stockTvl = tvl.slice(0, symbols.length).reduce((a, b) => a + b, 0);
  const usdgTvl = tvl[symbols.length];
  const borroUsd = borroPrices[BORRO_GECKO_ID] || 0;
  const stockReward = stockTvl > 0 ? ((dripPerDay * STOCK_SHARE * borroUsd * 365) / stockTvl) * 100 : 0;
  const usdgReward = usdgTvl > 0 ? ((dripPerDay * USDG_SHARE * borroUsd * 365) / usdgTvl) * 100 : 0;

  const pools = vaults.map((vault, i) => {
    const isUsdg = i === symbols.length;
    const symbol = isUsdg ? 'USDG' : symbols[i];
    const assetsHeld = Number(totalAssets[i]);
    // Weighted supply APY over what this vault supplies, less its performance fee.
    const idx = isUsdg ? symbols.map((_, k) => symbols.length + k) : [i];
    const earned = idx.reduce((acc, k) => acc + supplyApy(rates[k], markets[k]) * supplied(positions[k], markets[k]), 0);
    const apyBase = assetsHeld ? (earned / assetsHeld) * (1 - Number(perfFees[i]) / 1e18) : 0;
    const apyReward = isUsdg ? usdgReward : stockReward;
    return {
      pool: `${vault}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'borro',
      symbol,
      tvlUsd: tvl[i],
      apyBase,
      apyReward,
      rewardTokens: apyReward > 0 ? [BORRO] : [],
      underlyingTokens: [assets[i]],
      token: vault,
      poolMeta: isUsdg ? 'USDG vault, lent against stock' : `${symbol} vault, lent to shorters`,
      url: `https://borro.markets/app#trade=lend/${symbol}`,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://borro.markets/app',
  protocolId: '9140',
};
