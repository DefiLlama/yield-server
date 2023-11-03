const utils = require('../utils');

const address = 'EQBNo5qAG8I8J6IxGaz15SfQVB-kX98YhKV_mT36Xo5vYxUa';

module.exports = {
  timetravel: false,
  url: 'https://app.hipo.finance',
  apy: async () => {
    const protocolData = await utils.getData(
      'https://api.llama.fi/protocol/hipo'
    );
    const tvlUsd = protocolData.currentChainTvls['TON'];

    const response1 = await utils.getData(
      'https://toncenter.com/api/v2/runGetMethod',
      {
        address,
        method: 'get_treasury_state',
        stack: [],
      }
    );
    if (!response1.ok) {
      throw new Error('Error in calling toncenter.com/api/v2/runGetMethod');
    }
    const getTreasuryState = response1.result;
    if (getTreasuryState.exit_code !== 0) {
      throw new Error(
        'Expected a zero exit code, but got ' + getTreasuryState.exit_code
      );
    }

    await sleep(1000);

    const response2 = await utils.getData(
      'https://toncenter.com/api/v2/runGetMethod',
      {
        address,
        method: 'get_times',
        stack: [],
      }
    );
    if (!response2.ok) {
      throw new Error('Error in calling toncenter.com/api/v2/runGetMethod');
    }
    const getTimes = response2.result;
    if (getTimes.exit_code !== 0) {
      throw new Error(
        'Expected a zero exit code, but got ' + getTimes.exit_code
      );
    }

    const lastStaked = Number(getTreasuryState.stack[5][1]);
    const lastRecovered = Number(getTreasuryState.stack[6][1]);

    const currentRoundSince = Number(getTimes.stack[0][1]);
    const nextRoundSince = Number(getTimes.stack[3][1]);

    const duration = 2 * (nextRoundSince - currentRoundSince);
    const year = 365 * 24 * 60 * 60;
    const compoundingFrequency = year / duration;
    const apyBase =
      (Math.pow(
        Number(lastRecovered) / Number(lastStaked) || 1,
        compoundingFrequency
      ) -
        1) *
      100;

    return [
      {
        pool: (address + '-ton').toLowerCase(),
        chain: utils.formatChain('ton'),
        project: 'hipo',
        symbol: utils.formatSymbol('hTON'),
        tvlUsd,
        apyBase,
      },
    ];
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
