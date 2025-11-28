const {
  borrowingAPR,
  getMarkets,
  lendingAPR,
  getTvl,
  getMarketsLiquidity,
} = require('./api');
const sdk = require('@defillama/sdk');
const AaveV3Pool = require('../aave-v3/poolAbi');
const { apy: veryLiquidVaultsApy } = require('./very-liquid-vaults');

const AaveProtocolDataProvider = {
  ethereum: '0x41393e5e337606dc3821075Af65AeE84D7688CBD',
  optimism: '0x7F23D86Ee20D869112572136221e173428DD740B',
  arbitrum: '0x7F23D86Ee20D869112572136221e173428DD740B',
  polygon: '0x7F23D86Ee20D869112572136221e173428DD740B',
  fantom: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  avax: '0x374a2592f0265b3bb802d75809e61b1b5BbD85B7',
  metis: '0xC01372469A17b6716A38F00c277533917B6859c0',
  base: '0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad',
  xdai: '0x57038C3e3Fe0a170BB72DE2fD56E98e4d1a69717',
  bsc: '0x23dF2a19384231aFD114b036C14b6b03324D79BC',
  scroll: '0xe2108b60623C6Dcf7bBd535bD15a451fd0811f7b',
  era: '0x5F2A704cE47B373c908fE8A29514249469b52b99',
  lido: '0x08795CFE08C7a81dCDFf482BbAAF474B240f31cD', // on ethereum
  etherfi: '0xE7d490885A68f00d9886508DF281D67263ed5758', // on ethereum
};

const TENOR_DAYS = 3;
const DAYS_TO_SECONDS = 24 * 60 * 60;

const DEPTH_BORROW_TOKEN = 10;

function uppercaseFirst(str /*: string*/) /*: string*/ {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function apy() /*: Promise<Pool[]>*/ {
  const [markets, marketsLiquidity] = await Promise.all([
    getMarkets(),
    getMarketsLiquidity(),
  ]);

  const pools = await Promise.all(
    markets.map(async (market) => {
      const tvl = await getTvl(market);
      const uppercaseChain = uppercaseFirst(market.chain);
      let apyBase = await lendingAPR(
        market,
        TENOR_DAYS * DAYS_TO_SECONDS,
        DEPTH_BORROW_TOKEN
      );
      if (apyBase === undefined) {
        // no limit borrow offers available, use Aave v3 as a variable-rate lending pool
        const { output: getReserveData } = await sdk.api.abi.call({
          target: AaveProtocolDataProvider[market.chain],
          abi: AaveV3Pool.find((m) => m.name === 'getReserveData'),
          params: [market.debt_token.address],
          chain: market.chain,
        });
        apyBase = getReserveData.liquidityRate / 10 ** 25;
      }
      return {
        pool: `rheo-${market.id}`,
        chain: uppercaseFirst(market.chain),
        project: 'rheo',
        symbol: market.base_symbol,
        tvlUsd: marketsLiquidity[market.id].buy_side_liquidity_usd,
        apyBase,
        underlyingTokens: [market.debt_token.address],
        url: `https://app.rheo.xyz/borrow?action=market&type=lend&market_id=${market.id}`,
        apyBaseBorrow: await borrowingAPR(
          market,
          TENOR_DAYS * DAYS_TO_SECONDS,
          DEPTH_BORROW_TOKEN
        ),
        totalSupplyUsd: tvl.debt_tvl_usd,
        totalBorrowUsd: tvl.total_borrow_usd,
        ltv: 1e18 / market.risk_config.cr_liquidation,
        poolMeta: `${TENOR_DAYS}-day maturity`,
      };
    })
  );
  const veryLiquidVaults = await veryLiquidVaultsApy();
  return [...pools, ...veryLiquidVaults];
}

module.exports = {
  apy,
};
