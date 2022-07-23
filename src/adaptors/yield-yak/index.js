const axios = require('axios');

const main = async () => {
  const [{ data: farms }, { data: apys }] = await Promise.all([
    axios.get('https://staging-api.yieldyak.com/farms'),
    axios.get('https://staging-api.yieldyak.com/apys'),
  ]);

  return farms
    .filter((farm) => apys.hasOwnProperty(farm.address))
    .map((farm) => {
      return {
        pool: farm.address,
        chain: 'Avalanche',
        project: 'yield-yak',
        symbol: farm.name,
        apy: apys[farm.address].apy,
        rewardTokens: [farm.rewardToken.address],
        underlyingTokens: farm.depositToken.underlying,
        // this is in terms of deposit tokens, but there is no simple way to convert this
        // to USD, so for now just adding this. if ever this gets fixed, the graph should still
        // look some kind of proportionally scaled version of the original?
        tvlUsd: +farm.totalDeposits,
      };
    });
};

module.exports = {
  timetravel: false,
  apy: main,
};
