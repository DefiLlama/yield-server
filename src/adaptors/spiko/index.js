const sdk = require('@defillama/sdk');
const utils = require('../utils');

const project = 'spiko';

// Each fund publishes its NAV per share on Ethereum through its own
// Chainlink-style feed (6 decimals). The same share class is issued on every
// chain below, so one feed gives the fund's rate everywhere.
const FUNDS = {
  USTBL: {
    feed: '0x477e363c51Ab0C4D13B22CD6B57D56d4a3Cb7Abe',
    name: 'US T-Bills',
    tokens: {
      ethereum: '0xe4880249745eAc5F1eD9d8F7DF844792D560e750',
      polygon: '0xe4880249745eAc5F1eD9d8F7DF844792D560e750',
      arbitrum: '0x021289588cd81dC1AC87ea91e91607eEF68303F5',
      base: '0xe4880249745eAc5F1eD9d8F7DF844792D560e750',
    },
  },
  EUTBL: {
    feed: '0xfD628af590c4150A9651C1f4ddD0b4f532B703ae',
    name: 'EU T-Bills',
    tokens: {
      ethereum: '0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80',
      polygon: '0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80',
      arbitrum: '0xcbeb19549054cc0a6257a77736fc78c367216ce7',
      base: '0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80',
    },
  },
  SAFO: {
    feed: '0xC1E5FA6d48ba11cA163b03f2aBf843471eB7B2fB',
    name: 'Secured Assets Fund (USD)',
    tokens: {
      ethereum: '0xcbade7d9bdee88411cb6cbcbb29952b742036992',
      polygon: '0x6f64f47f95cf656f21b40e14798f6b49f80b3dc5',
      arbitrum: '0x0c709396739b9cfb72bcea6ac691ce0ddf66479c',
      base: '0x0bb754d8940e283d9ff6855ab5dafbc14165c059',
    },
  },
  eurSAFO: {
    feed: '0x799fdc55150583b5Baa0b47065E1C901862c95d5',
    name: 'Secured Assets Fund (EUR)',
    tokens: {
      ethereum: '0x0990b149e915cb08e2143a5c6f669c907eddc8b0',
      polygon: '0x272ea767712cc4839f4a27ee35eb73116158c8a2',
      arbitrum: '0x1412632f2b89e87bfa20c1318a43ced25f1d7b76',
      base: '0xd879846cbe20751bde8a9342a3cca00a3e56ca47',
    },
  },
};

const latestRoundDataAbi =
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)';

const readNavs = async (block) =>
  (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      abi: latestRoundDataAbi,
      calls: Object.values(FUNDS).map(({ feed }) => ({ target: feed })),
      block,
      permitFailure: true,
    })
  ).output.map((o) =>
    o.output
      ? { nav: Number(o.output.answer), at: Number(o.output.updatedAt) }
      : null
  );

// Annualise over the time between the two NAV publications, not over the
// nominal window: the feeds do not publish on weekends or holidays, so a
// reading taken on a Sunday still holds Friday's NAV, and dividing by a fixed
// 30 days would overstate the rate by the missing days.
const simpleApy = (now, prior) => {
  if (!now || !prior || !prior.nav || now.at <= prior.at) return null;
  const days = (now.at - prior.at) / 86400;
  return ((now.nav - prior.nav) / prior.nav) * (365 / days) * 100;
};

const apy = async () => {
  const timestampNow = Math.floor(Date.now() / 1000);
  const [block7d, block30d] = await Promise.all([
    utils.getPriceApiData(`/block/ethereum/${timestampNow - 86400 * 7}`),
    utils.getPriceApiData(`/block/ethereum/${timestampNow - 86400 * 30}`),
  ]).then((res) => res.map((r) => r.height));

  const [navNow, nav7d, nav30d] = await Promise.all([
    readNavs(),
    readNavs(block7d),
    readNavs(block30d),
  ]);

  // Every share class is priced through its Ethereum address: DefiLlama's
  // coin price for these already equals the fund NAV, converted to USD.
  const { pricesByAddress: prices } = await utils.getPrices(
    Object.values(FUNDS).map((f) => f.tokens.ethereum),
    'ethereum'
  );

  const chains = [
    ...new Set(Object.values(FUNDS).flatMap((f) => Object.keys(f.tokens))),
  ];
  const supplies = {};
  await Promise.all(
    chains.map(async (chain) => {
      // Isolated per chain: an RPC outage on one chain drops only that
      // chain's pools, not every fund on every chain.
      try {
        const entries = Object.entries(FUNDS).filter(
          ([, f]) => f.tokens[chain]
        );
        const calls = entries.map(([, f]) => ({ target: f.tokens[chain] }));
        const [supplyRes, decimalsRes] = await Promise.all([
          sdk.api.abi.multiCall({
            chain,
            abi: 'erc20:totalSupply',
            calls,
            permitFailure: true,
          }),
          sdk.api.abi.multiCall({
            chain,
            abi: 'erc20:decimals',
            calls,
            permitFailure: true,
          }),
        ]);
        entries.forEach(([symbol], i) => {
          const supply = supplyRes.output[i].output;
          const decimals = decimalsRes.output[i].output;
          if (supply == null || decimals == null) return;
          supplies[`${symbol}-${chain}`] =
            Number(supply) / 10 ** Number(decimals);
        });
      } catch (e) {
        console.log(`spiko: ${chain} supply read skipped`, e.message);
      }
    })
  );

  const pools = [];
  Object.entries(FUNDS).forEach(([symbol, fund], i) => {
    const apyBase = simpleApy(navNow[i], nav30d[i]);
    const apyBase7d = simpleApy(navNow[i], nav7d[i]);
    const price = prices[fund.tokens.ethereum.toLowerCase()];
    if (apyBase === null || !price) return;

    for (const [chain, address] of Object.entries(fund.tokens)) {
      const supply = supplies[`${symbol}-${chain}`];
      if (supply === undefined) continue;
      pools.push({
        pool: `${address}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project,
        symbol,
        poolMeta: fund.name,
        tvlUsd: supply * price,
        apyBase,
        apyBase7d,
        // NAV per share from the fund's feed (6 decimals), in the fund's own
        // currency: USD for USTBL/SAFO, EUR for EUTBL/eurSAFO.
        pricePerShare: navNow[i].nav / 1e6,
        underlyingTokens: [address],
        url: 'https://www.spiko.io',
      });
    }
  });

  return pools.filter((p) => p.tvlUsd > 0 && utils.keepFinite(p));
};

module.exports = {
  protocolId: '4980',
  timetravel: false,
  apy,
  url: 'https://www.spiko.io',
};
