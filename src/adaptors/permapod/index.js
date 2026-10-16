const utils = require('../utils');
const BigNumber = require('bignumber.js');

const CHAIN_NAME_LLAMA = 'ZIGChain';
const CHAIN_KEY = 'zigchain';
const LCD_ENDPOINT = 'https://zigchain-mainnet-lcd.zigscan.net';

// Perma Pod v2: positions migrated on 2026-09-28; ZIG moved to azig on 2026-09-30.
const MODULES = {
  red_bank: 'zig1qghek6p63r56j0dd5asxvc5fmu370l6yfql5spc2khsfzn0ennjqtwz3xz',
  oracle: 'zig13ynkhd699jfeptcs3kxezacqptdll3fjnxm3gxlwdezvz4nw9s7qaf3mkk',
  params: 'zig15kyc703g3ra5v9z67x0lp6x95qxs05udjvueullwylrw8x8yp30s5n349e',
};

const TOKENS = {
  'coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig': {
    symbol: 'stZIG',
    decimals: 6,
  },
  'ibc/6490A7EAB61059BFC1CDDEB05917DD70BDF3A611654162A1A47DB930D40D8AF4': {
    symbol: 'USDC',
    decimals: 6,
  },
  // Keep the migrated ZIG market's existing pool ID; use azig for actual queries.
  azig: { symbol: 'ZIG', decimals: 18, poolDenom: 'uzig' },
};

const ORACLE_PRICE_DECIMALS = 6;
const PROJECT_SLUG = 'permapod';
const APP_URL = 'https://app.permapod.xyz';

/** Return live supply and borrow yields for supported, deposit-enabled v2 markets. */
async function apy() {
  const assetParams = await getAllAssetParams();
  const activeParams = assetParams.filter(
    (p) =>
      TOKENS[p.denom] &&
      p.credit_manager?.whitelisted &&
      p.red_bank?.deposit_enabled,
  );

  // Propagate query failures instead of silently returning an empty/partial snapshot.
  return Promise.all(
    activeParams.map(async (p) => {
      const denom = p.denom;
      const token = TOKENS[denom];
      const [market, priceInfo] = await Promise.all([
        queryContract(MODULES.red_bank, { market_v2: { denom } }),
        queryContract(MODULES.oracle, { price: { denom } }),
      ]);

      // Oracle prices are micro-USD per smallest token unit, including 18-decimal azig.
      const price = new BigNumber(priceInfo.price).shiftedBy(
        token.decimals - ORACLE_PRICE_DECIMALS,
      );
      const supplied = new BigNumber(market.collateral_total_amount).shiftedBy(
        -token.decimals,
      );
      const borrowed = new BigNumber(market.debt_total_amount).shiftedBy(
        -token.decimals,
      );
      const depositApr = Number(market.liquidity_rate) * 100;
      const borrowApr = Number(market.borrow_rate) * 100;
      const ltv = Number(p.max_loan_to_value);
      if (
        !price.isFinite() ||
        !price.isGreaterThan(0) ||
        !supplied.isFinite() ||
        supplied.isNegative() ||
        !borrowed.isFinite() ||
        borrowed.isNegative() ||
        !Number.isFinite(depositApr) ||
        depositApr < 0 ||
        !Number.isFinite(borrowApr) ||
        borrowApr < 0 ||
        !Number.isFinite(ltv) ||
        ltv < 0 ||
        ltv > 1
      ) {
        throw new Error(`Invalid Perma Pod market data for ${denom}`);
      }

      const totalSupplyUsd = supplied.times(price).toNumber();
      const totalBorrowUsd = borrowed.times(price).toNumber();
      const tvlUsd = BigNumber.maximum(supplied.minus(borrowed), 0)
        .times(price)
        .toNumber();
      // Do not filter by available liquidity: highly utilized lending markets still earn APY.
      // yield-server applies its own lending size threshold using totalSupplyUsd.
      return {
        pool: `permapod-${token.poolDenom ?? denom}-${CHAIN_KEY}`.toLowerCase(),
        chain: CHAIN_NAME_LLAMA,
        project: PROJECT_SLUG,
        symbol: token.symbol,
        underlyingTokens: [denom],
        tvlUsd,
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd: tvlUsd,
        apyBase: utils.aprToApy(depositApr, 365),
        apyBaseBorrow: utils.aprToApy(borrowApr, 365),
        borrowToken: denom,
        ltv,
        borrowable: p.red_bank.borrow_enabled ?? false,
        url: `${APP_URL}/reserve-overview?denom=${encodeURIComponent(denom)}`,
      };
    }),
  );
}

/** Read every v2 asset-parameter page, rejecting invalid or stalled pagination. */
async function getAllAssetParams() {
  const out = [];
  const limit = 50;
  let startAfter = null;
  while (true) {
    const page = await queryContract(MODULES.params, {
      all_asset_params_v2: { limit, start_after: startAfter },
    });
    if (!Array.isArray(page.data))
      throw new Error('Invalid Perma Pod asset params response');
    out.push(...page.data);
    if (!page.data.length || !page.metadata?.has_more) break;
    const next = page.data[page.data.length - 1].denom;
    if (!next || next === startAfter)
      throw new Error('Perma Pod asset pagination did not advance');
    startAfter = next;
  }
  return out;
}

/** Query a CosmWasm contract through the LCD and return its decoded data. */
async function queryContract(contract, data) {
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
  const result = await utils.getData(
    `${LCD_ENDPOINT}/cosmwasm/wasm/v1/contract/${contract}/smart/${encoded}`,
  );
  if (result?.data == null)
    throw new Error(`Invalid Perma Pod contract response: ${contract}`);
  return result.data;
}

module.exports = {
  protocolId: '7205',
  apy,
  timetravel: false,
  url: APP_URL,
};
