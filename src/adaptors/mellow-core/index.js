const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Mellow Core (flexible-vaults) vaults. Not ERC-4626: the share price is the
// latest oracle report for the vault's base asset, where
// shares = assets * priceD18 / 1e18, so 1 share = 1e18 / priceD18 base units.
// Deposits and redeems settle through queues at these reported prices.
const ZERO = '0x0000000000000000000000000000000000000000';
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// base is the vault's FeeManager.baseAsset; priceToken is its coins key.
const VAULTS = {
  ethereum: [
    {
      oracle: '0xAda1f4c24603aB2fe5aBd35BCD12370e98A20358',
      shareManager: '0xBBFC8683C8fE8cF73777feDE7ab9574935fea0A4',
      symbol: 'earnETH', poolMeta: 'Lido earnETH',
      base: ETH, baseDecimals: 18, priceToken: ZERO,
    },
    {
      oracle: '0x827044735c9708a2cf850e7Ea37EBa43bc786028',
      shareManager: '0x4Ce1ac8F43E0E5BD7A346A98aF777bF8fbeA1981',
      symbol: 'earnUSD', poolMeta: 'Lido earnUSD',
      base: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', baseDecimals: 6,
      priceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
  ],
  robinhood: [
    {
      oracle: '0x4336739985da716436460f8E644c03120d334521',
      shareManager: '0xf04c58853D54f2445989108C29087F1A61C034cB',
      symbol: 'rUSDG', poolMeta: 'USDG Yield Vault',
      base: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', baseDecimals: 6,
      priceToken: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    },
  ],
  // ponytail: Tyr Capital (rsk, vault 0x97Bb…42Eb) left out: its only report
  // (2026-05-12) is still suspicious, so no price was ever applied. Add it
  // here once it reports again.
};

const DAY = 86400;
const MAX_REPORT_AGE = 3 * DAY; // reports land daily

const chainPools = async (chain, vaults) => {
  const now = Math.floor(Date.now() / 1000);
  const [block7d] = await utils.getBlocksByTime([now - 7 * DAY], chain);
  const getReports = (block) =>
    sdk.api.abi
      .multiCall({
        chain,
        block,
        abi: 'function getReport(address asset) view returns (uint224 priceD18, uint32 timestamp, bool isSuspicious)',
        calls: vaults.map((v) => ({ target: v.oracle, params: [v.base] })),
        permitFailure: true,
      })
      .then(({ output }) => output.map((r) => r.output));

  const [reportsNow, reports7d, { output: totalShares }, { pricesByAddress }] =
    await Promise.all([
      getReports(),
      getReports(block7d),
      sdk.api.abi.multiCall({
        chain,
        abi: 'function totalShares() view returns (uint256)',
        calls: vaults.map((v) => ({ target: v.shareManager })),
        permitFailure: true,
      }),
      utils.getPrices(vaults.map((v) => v.priceToken), chain),
    ]);

  return vaults.map((v, i) => {
    // A suspicious report is stored but not applied to the vault until
    // accepted, so its price is not one holders can transact at.
    const read = (r) =>
      r && !r.isSuspicious && Number(r.priceD18) > 0
        ? {
            pps: (1e18 / Number(r.priceD18)) * 10 ** (18 - v.baseDecimals),
            t: Number(r.timestamp),
          }
        : null;
    const last = read(reportsNow[i]);
    const then = read(reports7d[i]);
    const price = pricesByAddress[v.priceToken.toLowerCase()];
    const shares = totalShares[i].output;

    if (
      !last ||
      !then ||
      !(then.t < last.t) ||
      now - last.t > MAX_REPORT_AGE ||
      !(price > 0) ||
      shares == null
    ) {
      console.log(`mellow-core: skipping ${v.symbol} on ${chain}`);
      return null;
    }
    return {
      pool: `${v.shareManager}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'mellow-core',
      symbol: v.symbol,
      tvlUsd: (Number(shares) / 1e18) * last.pps * price,
      // Price only moves on reports (daily, with a larger weekly step), so
      // annualise over the actual time between the two reports.
      apyBase: ((last.pps / then.pps) ** ((365 * DAY) / (last.t - then.t)) - 1) * 100,
      underlyingTokens: [v.priceToken],
      token: v.shareManager,
      pricePerShare: last.pps,
      poolMeta: v.poolMeta,
      url: 'https://app.mellow.finance/vaults',
    };
  });
};

const apy = async () => {
  const pools = await Promise.all(
    Object.entries(VAULTS).map(([chain, vaults]) =>
      chainPools(chain, vaults).catch((e) => {
        // one chain's RPC failure must not drop the others
        console.log(`mellow-core: ${chain} failed: ${e.message}`);
        return [];
      })
    )
  );
  return pools.flat().filter(Boolean);
};

module.exports = {
  protocolId: '7330',
  timetravel: false,
  apy,
  url: 'https://app.mellow.finance/vaults',
};
