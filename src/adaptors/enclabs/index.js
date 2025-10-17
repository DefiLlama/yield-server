const sdk = require("@defillama/sdk");

const CORE_POOL = {
  name: "Core Sonic Pool",
  comptroller: "0xccAdFCFaa71407707fb3dC93D7d83950171aA2c9",
  oracle: "0xd05b05590609c3610161e60eb41eC317c7562408",
};

const abi = {
  getAllMarkets: "function getAllMarkets() view returns (address[])",
  symbol: "function symbol() view returns (string)",
  decimals: "function decimals() view returns (uint8)",
  totalSupply: "function totalSupply() view returns (uint256)",
  exchangeRateStored: "function exchangeRateStored() view returns (uint256)",
  totalBorrows: "function totalBorrows() view returns (uint256)",
  supplyRatePerBlock: "function supplyRatePerBlock() view returns (uint256)",
  borrowRatePerBlock: "function borrowRatePerBlock() view returns (uint256)",
  getUnderlyingPrice: "function getUnderlyingPrice(address cToken) view returns (uint256)",
  underlying: "function underlying() view returns (address)",
  markets: "function markets(address) view returns (bool, uint256, bool)",
};

const BLOCKS_PER_YEAR = 31_536_000; 

function round(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  const { output: markets } = await sdk.api.abi.call({
    target: CORE_POOL.comptroller,
    abi: abi.getAllMarkets,
    chain: "sonic",
  });

  const pools = [];

  for (const market of markets) {
    const { output: cTokenSymbol } = await sdk.api.abi.call({
      target: market,
      abi: abi.symbol,
      chain: "sonic",
    });

    let underlying = market;
    try {
      const { output } = await sdk.api.abi.call({
        target: market,
        abi: abi.underlying,
        chain: "sonic",
      });
      underlying = output;
    } catch {}

    let underlyingSymbol = cTokenSymbol;
    try {
      const { output: symbol } = await sdk.api.abi.call({
        target: underlying,
        abi: abi.symbol,
        chain: "sonic",
      });
      underlyingSymbol = symbol;
    } catch {}

    let decimals = 18;
    try {
      const { output: d } = await sdk.api.abi.call({
        target: underlying,
        abi: abi.decimals,
        chain: "sonic",
      });
      decimals = Number(d);
    } catch {}

    const [
      { output: totalSupplyRaw },
      { output: exchangeRateRaw },
      { output: totalBorrowsRaw },
      { output: supplyRateRaw },
      { output: borrowRateRaw },
      { output: priceRaw },
      { output: marketData },
    ] = await Promise.all([
      sdk.api.abi.call({ target: market, abi: abi.totalSupply, chain: "sonic" }),
      sdk.api.abi.call({ target: market, abi: abi.exchangeRateStored, chain: "sonic" }),
      sdk.api.abi.call({ target: market, abi: abi.totalBorrows, chain: "sonic" }),
      sdk.api.abi.call({ target: market, abi: abi.supplyRatePerBlock, chain: "sonic" }),
      sdk.api.abi.call({ target: market, abi: abi.borrowRatePerBlock, chain: "sonic" }),
      sdk.api.abi.call({
        target: CORE_POOL.oracle,
        abi: abi.getUnderlyingPrice,
        params: [market],
        chain: "sonic",
      }),
      sdk.api.abi.call({
        target: CORE_POOL.comptroller,
        abi: abi.markets,
        params: [market],
        chain: "sonic",
      }),
    ]);

    const exchangeRate = Number(exchangeRateRaw) / 1e18;
    const totalSupplyUnderlying = (Number(totalSupplyRaw) / 10 ** decimals) * exchangeRate;
    const totalBorrowsUnderlying = Number(totalBorrowsRaw) / 10 ** decimals;
    const price = Number(priceRaw) / 10 ** (36 - decimals);

    const totalSupplyUsd = totalSupplyUnderlying * price;
    const totalBorrowUsd = totalBorrowsUnderlying * price;
    const tvlUsd = totalSupplyUsd - totalBorrowUsd;

    const supplyRatePerBlock = Number(supplyRateRaw) / 1e18;
    const borrowRatePerBlock = Number(borrowRateRaw) / 1e18;

    const apyBase = (Math.pow(1 + supplyRatePerBlock, BLOCKS_PER_YEAR) - 1) * 100;
    const apyBaseBorrow = borrowRatePerBlock * BLOCKS_PER_YEAR * 100;

    let ltv = 0;
    try {
      ltv = Number(marketData[1]) / 1e18;
    } catch {}

    pools.push({
      pool: `${market}-sonic`.toLowerCase(),
      chain: "Sonic",
      project: "enclabs",
      symbol: underlyingSymbol,
      tvlUsd: round(tvlUsd),
      apyBase: Number(apyBase),
      apyBaseBorrow: Number(apyBaseBorrow),
      totalSupplyUsd: round(totalSupplyUsd),
      totalBorrowUsd: round(totalBorrowUsd),
      ltv: round(ltv),
      underlyingTokens: [underlying],
      poolMeta: CORE_POOL.name,
    });
  }

  return pools;
}

module.exports = {
  timetravel: false,
  apy: main,
  url: "https://www.enclabs.finance",
};
