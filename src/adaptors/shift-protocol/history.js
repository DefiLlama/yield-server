const { ethers } = require('ethers');
const { findPast } = require('./metrics');

const HISTORY_ABI =
  'function getLastTvlEntries(uint256 count) view returns (tuple(uint256 value, uint256 timestamp, uint256 supplySnapshot)[])';
const ENTRY = new ethers.utils.Interface([
  'function getTvlEntry(uint256 index) view returns (tuple(uint256 value, uint256 timestamp, uint256 supplySnapshot))',
]);
const MULTICALL = '0xca11bde05977b3631167028862be2a173976ca11';
const TRY_AGGREGATE =
  'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])';
const OUT_OF_BOUNDS = ethers.utils.id('IndexOutOfBounds()').slice(0, 10);

module.exports = async (call, feed, window) => {
  let entries;
  for (let count = 64; count <= 1024; count *= 2) {
    entries = await call(feed, HISTORY_ABI, [count]);
    if (!entries.length || findPast(entries, window) || entries.length < count)
      return entries;
  }

  // At high update volume, search indexed history instead of increasing the
  // bulk response. Feed timestamps are append-only and nondecreasing.
  const time = (row) => {
    const timestamp = Number(row.timestamp ?? row[1]);
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
      throw new Error('ltLLP: invalid history timestamp');
    return timestamp;
  };
  const cutoff = time(entries[0]) - window;
  const read = async (index) => {
    if (!Number.isSafeInteger(index))
      throw new Error('ltLLP: invalid history index');
    // Preserve revert bytes: the SDK otherwise flattens RPC/contract errors.
    const result = await call(MULTICALL, TRY_AGGREGATE, [
      false,
      [[feed, ENTRY.encodeFunctionData('getTvlEntry', [index])]],
    ]);
    if (result.length !== 1)
      throw new Error('ltLLP: invalid indexed history response');
    const success = result[0].success ?? result[0][0];
    const data = result[0].returnData ?? result[0][1];
    if (success === false && data === OUT_OF_BOUNDS) return;
    if (success !== true)
      throw new Error('ltLLP: indexed history read reverted');
    const row = ENTRY.decodeFunctionResult('getTvlEntry', data)[0];
    return {
      value: row.value.toString(),
      timestamp: row.timestamp.toString(),
      supplySnapshot: row.supplySnapshot.toString(),
    };
  };

  let low = 0;
  let past = await read(low);
  if (!past) throw new Error('ltLLP: inconsistent feed history');
  if (time(past) > cutoff) return entries;

  // Out-of-bounds indices are beyond every valid timestamp. Only the exact
  // contract bounds error may end a bracket; transport failures propagate.
  let high = 1;
  while (true) {
    const row = await read(high);
    if (!row || time(row) > cutoff) break;
    low = high;
    past = row;
    high *= 2;
  }
  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2);
    const row = await read(mid);
    if (row && time(row) <= cutoff) {
      low = mid;
      past = row;
    } else {
      high = mid;
    }
  }
  return [entries[0], past];
};
