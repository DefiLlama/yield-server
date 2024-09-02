const utils = require('../utils');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');

const ethFund = '0x69c53679EC1C06f3275b64C428e8Cd069a2d3966'; // ETH V2 Fund (ETH mainnet)
const ethFundUnderlying = 'ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

const topLvl = async (chainString, token, address) => {
  // Onchain APY calculation. Should return the same value as the API.
  currentTime = new Date().getTime();
  startTime = new Date('2022-11-20T14:00:00Z').getTime();
  daysDiff = (currentTime - startTime) / (1000 * 3600 * 24);

  const tokenUnderlying = (
    await sdk.api.abi.call({
      target: ethFund,
      abi: abi.tokenUnderlying,
      chain: 'ethereum',
    })
  ).output;

  const totalUnderlying = (
    await sdk.api.abi.call({
      target: ethFund,
      abi: abi.getTotalUnderlying,
      chain: 'ethereum',
    })
  ).output;

  const equivalentTotalQ = (
    await sdk.api.abi.call({
      target: ethFund,
      abi: abi.getEquivalentTotalQ,
      chain: 'ethereum',
    })
  ).output;

  let apyBase =
    ((totalUnderlying / equivalentTotalQ - 1) / daysDiff) * 365 * 100;

  const eth_token_data = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${ethFundUnderlying}`
    )
  ).coins[ethFundUnderlying];

  const tvlUsd =
    (totalUnderlying * eth_token_data.price) /
    Math.pow(10, eth_token_data.decimals);

  return {
    pool: `${address}-${chainString}`.toLowerCase(),
    chain: utils.formatChain(chainString),
    project: 'tranchess-ether',
    symbol: utils.formatSymbol(token),
    tvlUsd: tvlUsd,
    apyBase,
    underlyingTokens: ['0x0000000000000000000000000000000000000000'],
  };
};

const main = async () => {
  const data = await Promise.all([
    topLvl('ethereum', 'qETH', '0x93ef1Ea305D11A9b2a3EbB9bB4FCc34695292E7d'),
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://tranchess.com/liquid-staking',
};
