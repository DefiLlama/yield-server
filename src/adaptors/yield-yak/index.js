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
      };
    });
};

module.exports = {
  timetravel: false,
  apy: main,
};
