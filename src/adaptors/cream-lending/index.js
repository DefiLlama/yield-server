const sdk = require('@defillama/sdk');
const axios = require('axios');
const { ctoken } = require('./abi');

const BLOCKS_PER_DAY = 86400 / 12;

const CR_USDT = '0x19b3bDe6F02Fc2C985947dcC1Dc2A4cDDfd43eE8';
const CR_USDC = '0xC42D8F3D791C107C458b2FeA025A36669B51fC5f';

const calculateApy = (ratesPerBlock) => {
  const blocksPerDay = BLOCKS_PER_DAY;
  const daysPerYear = 365;

  return (
    (Math.pow(
      (parseFloat(ratesPerBlock) / 10 ** 18) * blocksPerDay + 1,
      daysPerYear
    ) -
      1) *
    100
  );
};

const getPrices = async (addresses) => {
  const queires = addresses.map((address) => 'ethereum:' + address).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${queires}`)
  ).data.coins;

  return Object.values(prices).map((o) => o.price);
};

const apy = async () => {
  const markets = [CR_USDT, CR_USDC].map((address) => ({ target: address }));

  let supplyRates = await sdk.api.abi.multiCall({
    calls: markets,
    abi: ctoken.find((m) => m.name === 'supplyRatePerBlock'),
  });
  supplyRates = supplyRates.output.map((o) => o.output);

  let cashes = await sdk.api.abi.multiCall({
    calls: markets,
    abi: ctoken.find((m) => m.name === 'getCash'),
  });
  cashes = cashes.output.map((o) => o.output);

  let totalBorrows = await sdk.api.abi.multiCall({
    calls: markets,
    abi: ctoken.find((m) => m.name === 'totalBorrows'),
  });
  totalBorrows = totalBorrows.output.map((o) => o.output);

  let totalSupplies = await sdk.api.abi.multiCall({
    calls: markets,
    abi: ctoken.find((m) => m.name === 'totalSupply'),
  });
  totalSupplies = totalSupplies.output.map((o) => o.output);

  let exchangeRates = await sdk.api.abi.multiCall({
    calls: markets,
    abi: ctoken.find((m) => m.name === 'exchangeRateStored'),
  });
  exchangeRates = exchangeRates.output.map((o) => o.output);

  const underlying_addresses = [
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  ];
  const prices = await getPrices(underlying_addresses);

  return [
    {
      pool: CR_USDT.toLowerCase(),
      chain: 'ethereum',
      project: 'cream-lending',
      symbol: 'USDT',
      tvlUsd: (parseFloat(cashes[0]) / 10 ** 6) * prices[0],
      apyBase: calculateApy(supplyRates[0]),
      totalSupplyUsd:
        (parseFloat(totalSupplies[0] * exchangeRates[0]) / 10 ** 24) *
        prices[0],
      totalBorrowUsd: (parseFloat(totalBorrows[0]) / 10 ** 6) * prices[0],
    },
    {
      pool: CR_USDC.toLowerCase(),
      chain: 'ethereum',
      project: 'cream-lending',
      symbol: 'USDC',
      tvlUsd: (parseFloat(cashes[1]) / 10 ** 6) * prices[1],
      apyBase: calculateApy(supplyRates[1]),
      totalSupplyUsd:
        (parseFloat(totalSupplies[1] * exchangeRates[1]) / 10 ** 24) *
        prices[1],
      totalBorrowUsd: (parseFloat(totalBorrows[1]) / 10 ** 6) * prices[1],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.cream.finance/',
};
