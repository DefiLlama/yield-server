const utils = require("../utils");
const sdk = require("@defillama/sdk");
const url = "https://api.aurigami.finance/apys";
const abi = {
  inputs: [],
  name: "underlying",
  outputs: [{ internalType: "address", name: "", type: "address" }],
  stateMutability: "view",
  type: "function"
};
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

async function fetchUnderlyings(markets) {
  let underlyings = (
    await sdk.api.abi.multiCall({
      abi,
      calls: markets.map((d) => ({ target: d })),
      chain: "aurora"
    })
  ).output.map((r) => r.output);

  const gasTokenIndex = underlyings.indexOf(null);
  underlyings[gasTokenIndex] = WETH;
  return underlyings;
}

const apy = async () => {
  const data = await utils.getData(url);
  const underlyings = await fetchUnderlyings(data.map((d) => d.market));
  return data.map((d, i) => ({
    pool: d.market,
    chain: "Aurora",
    project: "aurigami",
    symbol: d.symbol,
    tvlUsd: d.tvl,
    apyBase: isNaN(100 * d.deposit.apyBase) ? 0 : 100 * d.deposit.apyBase,
    apyReward: isNaN(100 * d.deposit.apyReward) ? 0 : 100 * d.deposit.apyReward,
    rewardTokens: d.deposit.rewardTokens,
    underlyingTokens: [underlyings[i]]
  }));
};

module.exports = {
  timetravel: false,
  apy
};
