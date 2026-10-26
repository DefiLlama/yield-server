const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Mellow Core (flexible-vaults) vaults. Not ERC-4626: the share price is the
// last oracle report the vault applied for its base asset, where
// shares = assets * priceD18 / 1e18, so 1 share = 1e18 / priceD18 base units.
// Deposits and redeems settle through queues at these prices. The vault emits
// ReportHandled only for applied reports: suspicious reports are held back
// until accepted, and accepted ones carry their original timestamp.
const ZERO = '0x0000000000000000000000000000000000000000';
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// base is the vault's FeeManager.baseAsset; priceToken is its coins key.
const VAULTS = {
  ethereum: [
    {
      vault: '0x6a37725ca7f4CE81c004c955f7280d5C704a249e',
      shareManager: '0xBBFC8683C8fE8cF73777feDE7ab9574935fea0A4',
      symbol: 'earnETH', poolMeta: 'Lido earnETH',
      base: ETH, baseDecimals: 18, priceToken: ZERO,
    },
    {
      vault: '0x014e6DA8F283C4aF65B2AA0f201438680A004452',
      shareManager: '0x4Ce1ac8F43E0E5BD7A346A98aF777bF8fbeA1981',
      symbol: 'earnUSD', poolMeta: 'Lido earnUSD',
      base: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', baseDecimals: 6,
      priceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
  ],
  robinhood: [
    {
      vault: '0xCe939C136cFfd80747e61f45F17EFdcd4D4abD3B',
      shareManager: '0xf04c58853D54f2445989108C29087F1A61C034cB',
      symbol: 'rUSDG', poolMeta: 'USDG Yield Vault',
      base: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', baseDecimals: 6,
      priceToken: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    },
  ],
  // ponytail: Tyr Capital (rsk, 0x97Bb…42Eb) left out: its only stored report
  // (2026-05-12) is still suspicious, and no public rsk RPC serves eth_getLogs.
  // Add it here once it reports again and rsk logs resolve.
};

const REPORT_HANDLED =
  'event ReportHandled(address indexed asset, uint224 indexed priceD18, uint32 depositTimestamp, uint32 redeemTimestamp, uint256 fees)';
const DAY = 86400;
const LOOKBACK = 14 * DAY;
const MAX_REPORT_AGE = 3 * DAY;

const chainPools = async (chain, vaults) => {
  const now = Math.floor(Date.now() / 1000);
  const [logs, { output: totalShares }, { pricesByAddress }] = await Promise.all([
    sdk.getEventLogs({
      chain,
      targets: vaults.map((v) => v.vault),
      eventAbi: REPORT_HANDLED,
      fromTimestamp: now - LOOKBACK,
      toTimestamp: now,
      onlyArgs: true,
      flatten: false,
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: 'function totalShares() view returns (uint256)',
      calls: vaults.map((v) => ({ target: v.shareManager })),
      permitFailure: true,
    }),
    utils.getPrices(vaults.map((v) => v.priceToken), chain),
  ]);

  return vaults.map((v, i) => {
    // depositTimestamp = report time - depositInterval, so differences between
    // reports are exact report-to-report times.
    const reports = logs[i]
      .filter((l) => l.asset.toLowerCase() === v.base.toLowerCase() && BigInt(l.priceD18) > 0n)
      .map((l) => ({
        pps: (1e18 / Number(l.priceD18)) * 10 ** (18 - v.baseDecimals),
        t: Number(l.depositTimestamp),
      }))
      .sort((a, b) => a.t - b.t);
    const last = reports[reports.length - 1];
    // last report applied at least 7 days before the latest one
    const then = last && reports.filter((r) => r.t <= last.t - 7 * DAY).pop();
    const price = pricesByAddress[v.priceToken.toLowerCase()];
    const shares = totalShares[i].output;

    if (!then || now - last.t > MAX_REPORT_AGE || !(price > 0) || shares == null) {
      console.log(`mellow-core: skipping ${v.symbol} on ${chain}`);
      return null;
    }
    return {
      pool: `${v.shareManager}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'mellow-core',
      symbol: v.symbol,
      tvlUsd: (Number(shares) / 1e18) * last.pps * price,
      // compounded over the actual time between reports (earnETH steps daily
      // with a larger weekly step, so a 1d window would alias)
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
        // one chain's RPC/log failure must not drop the others
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
