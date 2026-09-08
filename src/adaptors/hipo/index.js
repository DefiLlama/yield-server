const utils = require('../utils');

const address = 'EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ';

// hGRAM launched at an exchange rate of 1.0 GRAM
const launchTimestamp = 1698685200;

module.exports = {
  protocolId: '3722',
  timetravel: false,
  url: 'https://app.hipo.finance',
  apy: async () => {
    const protocolData = await utils.getData(
      'https://api.llama.fi/protocol/hipo'
    );
    const tvlUsd = protocolData.currentChainTvls['TON'];

    const getTreasuryState = await utils.getData(
      'https://toncenter.com/api/v3/runGetMethod',
      {
        address,
        method: 'get_treasury_state',
        stack: [],
      }
    );
    if (getTreasuryState.exit_code !== 0) {
      throw new Error(
        'Expected a zero exit code, but got ' + getTreasuryState.exit_code
      );
    }

    // The treasury stores the hGRAM/GRAM exchange rate before and after the
    // latest round's loan repayments (fixed-point, 1e9 = 1.0), and alongside
    // them the interval those two rates grew over.
    //
    // get_treasury_state mirrors the treasury's storage order, and an upgrade
    // on 2026-09-06 inserted deficit at index 5 and round_duration +
    // last_settled_round after the rate pair, taking the tuple from 21 values
    // to 24. Every index from 5 on moved.
    const previousRate = Number(getTreasuryState.stack[12].value);
    const currentRate = Number(getTreasuryState.stack[13].value);

    // Seconds that current_rate took to grow out of previous_rate, measured on
    // chain between the last two settled rounds. This used to be worked out
    // from a second get_times call as next_round_since - current_round_since,
    // which is a round LENGTH -- not the same thing. The treasury only moves
    // the rates when a round it lent into settles, so a round in which nothing
    // was lent widens this interval instead of passing unnoticed, and
    // annualising by a round length would report an unchanged APY for a pool
    // whose real rate of growth had halved.
    const roundDuration = Number(getTreasuryState.stack[14].value);

    if (!Number.isFinite(previousRate) || previousRate <= 0) {
      throw new Error('Invalid previous rate: ' + previousRate);
    }
    if (!Number.isFinite(currentRate) || currentRate <= 0) {
      throw new Error('Invalid current rate: ' + currentRate);
    }
    if (!Number.isFinite(roundDuration) || roundDuration <= 0) {
      throw new Error('Invalid round duration: ' + roundDuration);
    }

    const year = 365 * 24 * 60 * 60;
    const compoundingFrequency = year / roundDuration;
    const apyBase =
      (Math.pow(currentRate / previousRate, compoundingFrequency) - 1) * 100;

    const yearsSinceLaunch = (Date.now() / 1000 - launchTimestamp) / year;
    const apyBaseInception =
      (Math.pow(currentRate / 1e9, 1 / yearsSinceLaunch) - 1) * 100;

    return [
      {
        pool: (address + '-ton').toLowerCase(),
        chain: utils.formatChain('ton'),
        project: 'hipo',
        symbol: 'hGRAM',
        tvlUsd,
        apyBase,
        apyBaseInception,
        underlyingTokens: ['EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'], // native TON
      },
    ];
  },
};
