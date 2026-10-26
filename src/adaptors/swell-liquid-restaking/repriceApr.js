const sdk = require('@defillama/sdk');

const { getPriceApiData } = require('../utils');

// swETH and rswETH share the same Reprice event (only the rate field is named after the token).
//
// A plain rate delta cannot be used: Reprice also fires when reserves change without any rewards.
// From 2026-10-21 23:02 UTC (swETH) and 23:35 UTC (rswETH) a compromised repricer key pushed both rates up the maximum 1% per call
// with zero node operator and treasury rewards, which a rate-delta APR annualizes into thousands of
// percent. So the APR compounds the rate change of each reprice that reported rewards and skips the
// ones that reported none; on normal days every reprice reports rewards and this equals the rate delta.
const REPRICE_EVENT = (rateName) =>
  `event Reprice(uint256 newEthReserves, uint256 ${rateName}, uint256 nodeOperatorRewards, uint256 swellTreasuryRewards, uint256 totalETHDeposited)`;

const getRepriceApr = async (target, rateName, days) => {
  const now = Math.floor(Date.now() / 1000);
  const [fromBlock, bufferBlock, toBlock] = await Promise.all([
    getPriceApiData(`/block/ethereum/${now - 86400 * days}`).then((b) => b.height),
    // one extra day so the first reprice in the window has a previous rate to compare with
    getPriceApiData(`/block/ethereum/${now - 86400 * (days + 1)}`).then((b) => b.height),
    sdk.api.util.getLatestBlock('ethereum').then((b) => b.number),
  ]);

  const events = await sdk.getEventLogs({
    target,
    eventAbi: REPRICE_EVENT(rateName),
    fromBlock: bufferBlock,
    toBlock,
    chain: 'ethereum',
  });
  events.sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber));

  let growth = 1;
  for (let i = 1; i < events.length; i++) {
    const { blockNumber, args } = events[i];
    if (Number(blockNumber) < fromBlock) continue;
    if (Number(args.nodeOperatorRewards) + Number(args.swellTreasuryRewards) === 0) continue;
    growth *= Number(args[rateName]) / Number(events[i - 1].args[rateName]);
  }

  return (growth - 1) * (365 / days) * 100;
};

module.exports = { getRepriceApr };
