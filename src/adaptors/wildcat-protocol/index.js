const sdk = require('@defillama/sdk');
const axios = require('axios');

const abi = require('./abi');

const archController = '0xfEB516d9D946dD487A9346F6fee11f40C6945eE4';
const chain = 'ethereum';

const apy = async () => {
  // all markets
  const markets = (
    await sdk.api.abi.call({
      abi: 'address[]:getRegisteredMarkets',
      target: archController,
    })
  ).output;

  // --- market params
  const annualInterestBips = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: abi.find((i) => i.name === 'annualInterestBips'),
    })
  ).output.map((i) => i.output);

  const symbol = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: 'erc20:symbol',
    })
  ).output.map((i) => i.output);

  const asset = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: abi.find((i) => i.name === 'asset'),
    })
  ).output.map((i) => i.output);

  const isClosed = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: abi.find((i) => i.name === 'isClosed'),
    })
  ).output.map((i) => i.output);

  const name = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: abi.find((i) => i.name === 'name'),
    })
  ).output.map((i) => i.output);

  const maximumDeposit = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: abi.find((i) => i.name === 'maximumDeposit'),
    })
  ).output.map((i) => i.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: abi.find((i) => i.name === 'decimals'),
    })
  ).output.map((i) => i.output);

  const priceApiKeys = asset.map((i) => `${chain}:${i}`);
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceApiKeys}`)
  ).data.coins;

  const pools = [];
  for (let i = 0; i < markets.length; i++) {
    const m = markets[i];

    if (isClosed[i]) continue;

    pools.push({
      pool: m,
      project: 'wildcat-protocol',
      chain,
      symbol: symbol[i],
      apyBase: annualInterestBips[i] / 100,
      tvlUsd:
        (maximumDeposit[i] / 10 ** decimals[i]) *
        prices[`${chain}:${asset[i]}`]?.price,
      underlyingTokens: [asset[i]],
      poolMeta: name[i],
      url: `https://app.wildcat.finance/lender/market/${m.toLowerCase()}`,
    });
  }

  return pools;
};

module.exports = {
  apy,
};
