import type { Pool } from "../../types/Pool";
import type { BorrowingAPR, GetMarkets, LendingAPR, GetTvl } from "./api";
const { borrowingAPR, getMarkets, lendingAPR, getTvl } = require('./api') as {
  borrowingAPR: BorrowingAPR;
  getMarkets: GetMarkets;
  lendingAPR: LendingAPR;
  getTvl: GetTvl;
};
const sdk = require('@defillama/sdk');
const { protocolDataProviders: AaveProtocolDataProvider } = require('../aave-v3');
const AaveV3Pool = require('../aave-v3/poolAbi');

const TENORS_SECONDS = 60 * 60 * 24 * 3

const DEPTH_BORROW_TOKEN = 10;

function uppercaseFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function apy(): Promise<Pool[]> {
  const markets = await getMarkets();

  return Promise.all(
    markets.map(async (market) => {
      const tvl = await getTvl(market);
      let apyBase = await lendingAPR(market, TENORS_SECONDS, DEPTH_BORROW_TOKEN)
      if (apyBase === undefined) { // no limit borrow offers available, use Aave v3 as a variable-rate lending pool
        const { output: getReserveData } = await sdk.api.abi.call({
          target: AaveProtocolDataProvider[market.chain],
          abi: AaveV3Pool.find((m) => m.name === 'getReserveData'),
          params: [market.debt_token.address],
          chain: market.chain,
        })
        apyBase = getReserveData.liquidityRate / 10 ** 25
      }
      return {
        pool: market.id,
        chain: uppercaseFirst(market.chain),
        project: 'size-credit',
        symbol: market.quote_symbol,
        tvlUsd: tvl.total_tvl_usd, // does not include borrows
        apyBase,
        apyReward: 0,
        underlyingTokens: [market.debt_token.address],
        rewardTokens: [],
        url: `https://app.size.credit/borrow?action=market&type=lend&market_id=${market.id}`,
        apyBaseBorrow: await borrowingAPR(market, TENORS_SECONDS, DEPTH_BORROW_TOKEN),
        apyRewardBorrow: 0,
        totalSupplyUsd: tvl.debt_tvl_usd,
        totalBorrowUsd: tvl.borrow_tvl_usd,
        ltv: 1e20 / market.risk_config.cr_liquidation,
      };
    }),
  );
};

module.exports = {
  timetravel: false,
  apy,
};
