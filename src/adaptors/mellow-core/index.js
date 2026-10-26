const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Lido earnETH, a Mellow Core (flexible-vaults) vault. Not ERC-4626: the share
// price is the latest Oracle report for the base asset, where
// shares = assets * priceD18 / 1e18, so 1 share = 1e18 / priceD18 ETH.
// Deposits and redeems settle through queues at these reported prices.
const VAULT = '0x6a37725ca7f4CE81c004c955f7280d5C704a249e';
const EARN_ETH = '0xBBFC8683C8fE8cF73777feDE7ab9574935fea0A4'; // ShareManager = earnETH token
const ORACLE = '0xAda1f4c24603aB2fe5aBd35BCD12370e98A20358';
const ZERO = '0x0000000000000000000000000000000000000000';
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'; // vault base asset
const DAY = 86400;
const MAX_REPORT_AGE = 3 * DAY; // reports land daily (oracle timeout is 20h)

const abi = {
  getReport:
    'function getReport(address asset) view returns (uint224 priceD18, uint32 timestamp, bool isSuspicious)',
  totalShares: 'function totalShares() view returns (uint256)',
};

// Latest oracle report. A suspicious report is stored but not applied to the
// vault until accepted, so its price is not one holders can transact at.
async function report(block) {
  const { output } = await sdk.api.abi.call({
    target: ORACLE, abi: abi.getReport, params: [ETH], chain: 'ethereum', block,
  });
  const priceD18 = Number(output.priceD18);
  if (!(priceD18 > 0) || output.isSuspicious)
    throw new Error(`earnETH: unusable oracle report at block ${block ?? 'latest'}`);
  return { pps: 1e18 / priceD18, timestamp: Number(output.timestamp) };
}

const apy = async () => {
  const now = await report();
  if (Date.now() / 1000 - now.timestamp > MAX_REPORT_AGE)
    throw new Error('earnETH: oracle report is stale');

  const [block7d] = await utils.getBlocksByTime(
    [Math.floor(Date.now() / 1000) - 7 * DAY], 'ethereum'
  );
  const then = await report(block7d);
  if (!(then.timestamp < now.timestamp))
    throw new Error('earnETH: no report in the last 7 days');
  // Reports step daily with a larger weekly step, so annualise over the
  // actual time between the two reports.
  const apyBase =
    ((now.pps / then.pps) ** ((365 * DAY) / (now.timestamp - then.timestamp)) - 1) * 100;

  const { output: totalShares } = await sdk.api.abi.call({
    target: EARN_ETH, abi: abi.totalShares, chain: 'ethereum',
  });
  const ethPrice = (await utils.getPrices([ZERO], 'ethereum')).pricesByAddress[ZERO];
  if (!(ethPrice > 0)) throw new Error('earnETH: missing ETH price');

  return [
    {
      pool: `${EARN_ETH}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'mellow-core',
      symbol: 'earnETH',
      tvlUsd: (Number(totalShares) / 1e18) * now.pps * ethPrice,
      apyBase,
      underlyingTokens: [ZERO],
      token: EARN_ETH,
      pricePerShare: now.pps,
      poolMeta: 'Lido earnETH',
      url: `https://app.mellow.finance/vaults/ethereum-${VAULT.toLowerCase()}`,
    },
  ];
};

module.exports = {
  protocolId: '7330',
  timetravel: false,
  apy,
  url: 'https://stake.lido.fi/earn',
};
