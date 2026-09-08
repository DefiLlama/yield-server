const utils = require('../utils');

const address = 'EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ';

// hGRAM launched at an exchange rate of 1.0 GRAM
const launchTimestamp = 1698685200;

// Toncenter allows one request per second unauthenticated, and under that
// limit it answers often enough with an HTTP 500 to be worth avoiding. That
// surfaces as a thrown error rather than a bad number, but the pool then
// reports nothing for the day. Same variable the TVL repo reads in
// projects/helper/chain/ton.js.
const apiKey = process.env.TONCENTER_API_KEY;

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
      },
      apiKey ? { 'X-API-Key': apiKey } : {}
    );
    if (getTreasuryState.exit_code !== 0) {
      throw new Error(
        'Expected a zero exit code, but got ' + getTreasuryState.exit_code
      );
    }
    // The tuple is append-only, so it only ever grows; a short one means the
    // read did not return what it should have, and the positions below would
    // be read off the end.
    if ((getTreasuryState.stack || []).length < 15) {
      throw new Error(
        'Expected at least 15 treasury state values, but got ' +
          (getTreasuryState.stack || []).length
      );
    }

    // The treasury publishes the hGRAM/GRAM exchange rate at both ends of a
    // window (fixed-point, 1e9 = 1.0), and the number of seconds that window
    // spans. get_treasury_state is append-only, so these positions are fixed.
    const previousRate = Number(getTreasuryState.stack[12].value);
    const currentRate = Number(getTreasuryState.stack[13].value);

    // The span the rate pair actually describes, measured on chain. It is NOT
    // a round length: the treasury lends through two interleaved chains of
    // rounds and rounds_imbalance lets one chain lend more than the other, so
    // the reward booked per settlement alternates. The window is therefore
    // kept two settlements wide -- one high chain and one low one, so the
    // oscillation cancels rather than being annualised into a sawtooth -- and
    // it widens further across rounds the pool did not lend into. Dividing by
    // a round length instead would report roughly double the truth here, and
    // would keep reporting an unchanged APY for a pool whose real rate of
    // growth had halved.
    const windowDuration = Number(getTreasuryState.stack[14].value);

    if (!Number.isFinite(previousRate) || previousRate <= 0) {
      throw new Error('Invalid previous rate: ' + previousRate);
    }
    if (!Number.isFinite(currentRate) || currentRate <= 0) {
      throw new Error('Invalid current rate: ' + currentRate);
    }
    if (!Number.isFinite(windowDuration) || windowDuration <= 0) {
      throw new Error('Invalid window duration: ' + windowDuration);
    }

    const year = 365 * 24 * 60 * 60;
    const compoundingFrequency = year / windowDuration;
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
