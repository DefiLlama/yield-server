const axios = require('axios');
const superagent = require('superagent');
const { get } = require('lodash');

const STARGATE_USDT = '0x29e38769f23701a2e4a8ef0492e19da4604be62c';

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .map((address) => `avax:${address}`)
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesBySymbol = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [price.symbol.toLowerCase()]: price.price,
    }),
    {}
  );

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return { pricesByAddress, pricesBySymbol };
};

const main = async () => {
  const [{ data: farms }, { data: apys }] = await Promise.all([
    axios.get('https://staging-api.yieldyak.com/farms'),
    axios.get('https://staging-api.yieldyak.com/apys'),
  ]);

  const tokens = [
    ...new Set(
      farms
        .map(({ depositToken }) =>
          (depositToken.underlying || []).map((token) => token.toLowerCase())
        )
        .flat()
    ),
  ];
  const { pricesByAddress, pricesBySymbol } = await getPrices(tokens);

  const res = farms
    .filter((farm) => apys.hasOwnProperty(farm.address))
    .map((farm) => {
      let tvlUsd = 0;

      const isLp = !!farm.lpToken;
      if (isLp) {
        const token0Symbol = get(farm, 'token0.symbol', '').toLowerCase();
        const token1Symbol = get(farm, 'token1.symbol', '').toLowerCase();
        const token0Reserves = Number(get(farm, 'token0.reserves', 0));
        const token1Reserves = Number(get(farm, 'token1.reserves', 0));
        const token0Price = pricesBySymbol[token0Symbol];
        const token1Price = pricesBySymbol[token1Symbol];

        if (token0Price && token1Price) {
          const token0Usd = token0Price * token0Reserves;
          const token1Usd = token1Price * token1Reserves;
          tvlUsd =
            (token0Usd > token1Usd ? token1Usd : token0Usd) *
            2 *
            (farm.totalDeposits / farm.lpToken.supply);
        }
      } else {
        let tokenPrice = 0;

        if (farm.platform == 'wombat') {
          const tokenSymbol = farm.depositToken.underlying[0].toLowerCase();
          tokenPrice = pricesByAddress[tokenSymbol];
        } else {
          const tokenSymbol = farm.depositToken.address.toLowerCase();
          const tokenName = farm.name.toLowerCase();
          tokenPrice =
            pricesByAddress[tokenSymbol] || pricesBySymbol[tokenName];
        }

        if (farm.depositToken.stablecoin) tvlUsd = Number(farm.totalDeposits);
        else if (tokenPrice) tvlUsd = tokenPrice * Number(farm.totalDeposits);
      }

      return {
        pool: farm.address,
        chain: 'Avalanche',
        project: 'yield-yak-aggregator',
        symbol: farm.name,
        poolMeta: farm.platform,
        apyBase: apys[farm.address].apy,
        underlyingTokens: farm.depositToken.underlying,
        tvlUsd: tvlUsd,
      };
    });

  return res;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://yieldyak.com/farms',
};
