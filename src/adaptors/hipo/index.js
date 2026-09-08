const axios = require('axios');
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

// Called through axios directly rather than utils.getData, which forwards only
// headers and so cannot set either of these.
//
// maxRedirects: axios strips Authorization when a redirect crosses hosts but
// leaves custom headers alone, so a redirect off toncenter would carry the key
// with it. Toncenter does not redirect, so refusing to follow one costs nothing
// and fails loudly rather than leaking if that ever changes.
//
// timeout: axios defaults to none, and a stalled connection would hang the
// whole adaptor run. Measured response time for this call is under a second.
const requestOptions = {
  timeout: 30000,
  maxRedirects: 0,
  headers: apiKey ? { 'X-API-Key': apiKey } : {},
};

module.exports = {
  protocolId: '3722',
  timetravel: false,
  url: 'https://app.hipo.finance',
  apy: async () => {
    const protocolData = await utils.getData(
      'https://api.llama.fi/protocol/hipo'
    );
    const tvlUsd = protocolData.currentChainTvls['TON'];

    const getTreasuryState = (
      await axios.post(
        'https://toncenter.com/api/v3/runGetMethod',
        {
          address,
          method: 'get_treasury_state',
          stack: [],
        },
        requestOptions
      )
    ).data;
    if (getTreasuryState.exit_code !== 0) {
      throw new Error(
        'Expected a zero exit code, but got ' + getTreasuryState.exit_code
      );
    }
    // The tuple is append-only, so it only ever grows. Anything shorter, or of
    // the wrong shape, means the read did not return what it should have, and
    // the positions below would be read off the end or off a nullish entry.
    const stack = getTreasuryState.stack;
    if (!Array.isArray(stack) || stack.length < 15) {
      throw new Error(
        'Expected an array of at least 15 treasury state values, but got ' +
          JSON.stringify(stack)?.slice(0, 100)
      );
    }
    for (const i of [12, 13, 14]) {
      if (stack[i]?.value === undefined) {
        throw new Error('Missing treasury state value at position ' + i);
      }
    }

    // The treasury publishes the hGRAM/GRAM exchange rate at both ends of a
    // window (fixed-point, 1e9 = 1.0), and the number of seconds that window
    // spans. get_treasury_state is append-only, so these positions are fixed.
    const previousRate = Number(stack[12].value);
    const currentRate = Number(stack[13].value);

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
    const windowDuration = Number(stack[14].value);

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
