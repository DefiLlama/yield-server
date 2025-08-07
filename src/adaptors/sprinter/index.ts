const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const {
  BigNumber,
  utils: { formatUnits },
} = require('ethers');

const utils = require('../utils');

const SUBGRAPH_URL = sdk.graph.modifyEndpoint("https://api.studio.thegraph.com/query/117634/sprinter-stash/v0.0.2");
const HUB_CONTRACT_ADDRESS = "0xa593A9bBBc65be342FF610a01e96da2EB8539FF2";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const INITIAL_DATE = '2025-06-17T00:00:00';
const USDC_DECIMALS = 6;

const DataQuery = gql`
    query DataQuery($from: BigInt = "", $to: BigInt = "") {
        depositProfits(where: {blockTimestamp_gte: $from, blockTimestamp_lte: $to}) {
            assets
            totalAssets
            blockTimestamp
        }
    }
`;

const startDate = new Date(INITIAL_DATE);
async function apy() {
  const currentYear = new Date(
    Date.UTC(new Date().getUTCFullYear(), 0, 1, 0, 0, 0),
  );

  const startTimestamp =
    startDate.getUTCFullYear() === currentYear.getUTCFullYear()
      ? startDate.getTime()
      : currentYear.getTime();

  let endTimestamp = Date.now();
  const { depositProfits } = await request(SUBGRAPH_URL, DataQuery, {
    from: Math.floor(startTimestamp / 1000),
    to: Math.floor(endTimestamp / 1000),
  });

  const totalProfit = depositProfits.reduce((sum, deposit) => {
    return sum.add(BigNumber.from(deposit.assets));
  }, BigNumber.from(0));

  const averageSupply =
    depositProfits.reduce((sum, deposit) => {
      return sum.add(BigNumber.from(deposit.totalAssets));
    }, BigNumber.from(0)).div(depositProfits.length);

  const lastDepositProfit = depositProfits[0];

  const timeDiff =
    new Date(parseInt(lastDepositProfit.blockTimestamp) * 1000).getTime() - startTimestamp;
  const daysInPeriod = Math.max(1, Math.floor(timeDiff / DAY_IN_MS));

  const ratio =
    Number(formatUnits(totalProfit, USDC_DECIMALS)) /
    Number(formatUnits(averageSupply, USDC_DECIMALS));
  const rate = Math.pow(1 + ratio, 365 / daysInPeriod) - 1;

  return [{
    project: "sprinter",
    pool: HUB_CONTRACT_ADDRESS,
    chain: utils.formatChain("base"),
    symbol: utils.formatSymbol("USDC"),
    tvlUsd: Number(formatUnits(lastDepositProfit.totalAssets, USDC_DECIMALS)),
    apy: rate * 100,
  }];
}

module.exports = {
  apy: apy,
  url: 'https://app.sprinter.tech/',
}
