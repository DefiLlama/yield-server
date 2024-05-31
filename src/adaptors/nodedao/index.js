const sdk = require('@defillama/sdk');
const axios = require('axios');
const abiStakingPool = require('./abiStakingPool');

const filHubPool = '0xfeB16A48dbBB0E637F68215b19B4DF5b12449676';
const sdkChain = 'filecoin';
const url = 'https://www.nodedao.com/';

const ethStakingPool = '0x8103151E2377e78C04a3d2564e20542680ed3096';
const ethSdkChain = 'ethereum';

const getApy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
  ).data.height;

  const block7dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7dayAgo}`)
  ).data.height;

  const exchangeRates = await Promise.all([
    sdk.api.abi.call({
      target: ethStakingPool,
      abi: abiStakingPool.find((m) => m.name === 'getExchangeRate'),
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: ethStakingPool,
      abi: abiStakingPool.find((m) => m.name === 'getExchangeRate'),
      chain: 'ethereum',
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: ethStakingPool,
      abi: abiStakingPool.find((m) => m.name === 'getExchangeRate'),
      chain: 'ethereum',
      block: block7dayAgo,
    }),
  ]);

  const apyBase =
    ((exchangeRates[0].output - exchangeRates[1].output) / 1e18) * 365 * 100;

  const apyBase7d =
    ((exchangeRates[0].output - exchangeRates[2].output) / 1e18 / 7) *
    365 *
    100;

  const ethPriceKey = `coingecko:ethereum`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${ethPriceKey}`)
  ).data.coins[ethPriceKey]?.price;

  const totalEthValue = (
    await sdk.api.abi.call({
      abi: abiStakingPool.find((m) => m.name === 'getTotalEthValue'),
      target: ethStakingPool,
    })
  ).output;

  const totalEthDecimal = totalEthValue / 1e18;

  const ethTvlUsd = totalEthDecimal * ethPrice;

  const ethereumAPY = {
    pool: `${ethStakingPool}-${ethSdkChain}`, // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
    chain: `${ethSdkChain}`, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
    project: 'nodedao', // protocol (using the slug again)
    symbol: 'ETH', // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
    tvlUsd: ethTvlUsd, // number representing current USD TVL in pool
    apyBase, // APY from pool fees/supplying in %
    apyBase7d,
    url,
  };

  return [ethereumAPY];
};

module.exports = {
  apy: getApy,
};
