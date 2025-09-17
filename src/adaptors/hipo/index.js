const utils = require('../utils');

const address = 'EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ';

module.exports = {
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

    await sleep(1000);

    const getTimes = await utils.getData(
      'https://toncenter.com/api/v3/runGetMethod',
      {
        address,
        method: 'get_times',
        stack: [],
      }
    );
    if (getTimes.exit_code !== 0) {
      throw new Error(
        'Expected a zero exit code, but got ' + getTimes.exit_code
      );
    }

    const lastStaked = Number(getTreasuryState.stack[11].value);
    const lastRecovered = Number(getTreasuryState.stack[12].value);

    const currentRoundSince = Number(getTimes.stack[0].value);
    const nextRoundSince = Number(getTimes.stack[3].value);

    const duration = 2 * (nextRoundSince - currentRoundSince);
    const year = 365 * 24 * 60 * 60;
    const compoundingFrequency = year / duration;
    const apyBase =
      (Math.pow(
        lastRecovered / lastStaked || 1,
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
