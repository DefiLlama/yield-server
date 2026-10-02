const { ethers } = require('ethers');

const PRICE_EVENT =
  'event SharePriceUpdated(uint256 epoch, uint256 sharePrice, uint256 previousSharePrice, uint256 totalSupply, uint256 timestamp)';
const iface = new ethers.utils.Interface([
  'function epochSettle(uint256 sharePrice)',
  PRICE_EVENT,
  'event PerformanceFeeCollected(uint256 epoch, uint256 sharePrice, uint256 previousHwm, uint256 feeSharesMinted)',
  'event MaintenanceFeeCollected(uint256 epoch, uint256 feeAssets, uint256 sharePriceBefore, uint256 sharePriceAfter)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const ZERO = ethers.constants.AddressZero;

const verifySettlement = ({
  tx,
  receipt,
  vault,
  share,
  epoch,
  current,
  anchorBlock,
}) => {
  const fail = () => {
    throw new Error('risexUSDC: unverified NAV settlement');
  };
  const input = tx?.input ?? tx?.data;
  if (
    tx?.to?.toLowerCase() !== vault.toLowerCase() ||
    Number(receipt?.status) !== 1 ||
    !Number.isSafeInteger(Number(receipt.blockNumber)) ||
    Number(receipt.blockNumber) > anchorBlock ||
    typeof input !== 'string' ||
    input.length !== 74
  )
    fail();
  let proposal;
  try {
    proposal = iface.decodeFunctionData('epochSettle', input)[0];
  } catch (e) {
    fail();
  }
  // An emergency zero proposal can refresh the snapshot timestamp without NAV.
  if (proposal.isZero()) fail();

  const events = [];
  let minted = ethers.BigNumber.from(0);
  for (const log of receipt.logs) {
    const address = log.address.toLowerCase();
    if (![vault.toLowerCase(), share.toLowerCase()].includes(address)) continue;
    let event;
    try {
      event = iface.parseLog(log);
    } catch (e) {
      continue;
    }
    if (
      address === share.toLowerCase() &&
      event.name === 'Transfer' &&
      event.args.from === ZERO
    ) {
      minted = minted.add(event.args.value);
    } else if (address === vault.toLowerCase()) {
      events.push(event);
    }
  }
  const prices = events.filter((e) => e.name === 'SharePriceUpdated');
  if (prices.length !== 1) fail();
  const observed = prices[0].args;
  if (
    !observed.epoch.eq(epoch) ||
    !observed.sharePrice.eq(current.sharePrice ?? current[0]) ||
    !observed.totalSupply.eq(current.totalSupply ?? current[1]) ||
    !observed.timestamp.eq(current.timestamp ?? current[2]) ||
    observed.totalSupply.lte(minted)
  )
    fail();
  const supplyBefore = observed.totalSupply.sub(minted);
  const performance = events.filter(
    (e) => e.name === 'PerformanceFeeCollected'
  );
  const maintenance = events.filter(
    (e) => e.name === 'MaintenanceFeeCollected'
  );
  if (performance.length > 1 || maintenance.length > 1) fail();
  if (performance.length) {
    const fee = performance[0].args;
    if (
      !fee.epoch.eq(epoch) ||
      !fee.sharePrice.eq(proposal) ||
      fee.feeSharesMinted.gt(minted)
    )
      fail();
    proposal = proposal
      .mul(supplyBefore)
      .div(supplyBefore.add(fee.feeSharesMinted));
  }
  if (maintenance.length) {
    const fee = maintenance[0].args;
    if (
      !fee.epoch.eq(epoch) ||
      !fee.sharePriceBefore.eq(proposal) ||
      fee.sharePriceAfter.gt(proposal)
    )
      fail();
    proposal = fee.sharePriceAfter;
  }
  // Reject a nonzero proposal ignored during allocator-active grace as well.
  if (!proposal.eq(observed.sharePrice)) fail();
};

module.exports = { PRICE_EVENT, iface, verifySettlement };
