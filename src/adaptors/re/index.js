const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const PROJECT_NAME = 're';
const CHAIN = 'ethereum';

const vaults = [
  {
    token: '0x5086bf358635B81D8C47C66d1C8b9E567Db70c72',
    sharePriceCalculator: '0xd1D104a7515989ac82F1AFDa15a23650411b05B8',
    symbol: 'reUSD',
    underlyingTokens: [
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', // USDe
      '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', // sUSDe
    ],
    url: 'https://app.re.xyz/reusd',
  },
  {
    token: '0xdDC0f880ff6e4e22E4B74632fBb43Ce4DF6cCC5a',
    sharePriceCalculator: '0x1262a408de54db9ae3fb3bb0e429c319fbee9915',
    symbol: 'reUSDe',
    underlyingTokens: [
      '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', // USDe
      '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', // sUSDe
    ],
    url: 'https://app.re.xyz/reusde',
  },
];

const getBlock = async (timestamp) => {
  const { data } = await axios.get(
    `https://coins.llama.fi/block/${CHAIN}/${timestamp}`
  );
  return data.height;
};

const main = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp7d = now - 7 * 24 * 60 * 60;

  const block7d = await getBlock(timestamp7d);

  // Fetch totalSupply and current share prices
  const [supplyResults, priceResults] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: vaults.map((v) => ({ target: v.token })),
      abi: 'erc20:totalSupply',
      chain: CHAIN,
    }),
    sdk.api.abi.multiCall({
      calls: vaults.map((v) => ({ target: v.sharePriceCalculator })),
      abi: 'uint256:getSharePrice',
      chain: CHAIN,
    }),
  ]);

  // Fetch 7d-ago share prices for APY calculation
  const priceResults7d = await sdk.api.abi.multiCall({
    calls: vaults.map((v) => ({ target: v.sharePriceCalculator })),
    abi: 'uint256:getSharePrice',
    chain: CHAIN,
    block: block7d,
  });

  const pools = vaults.map((vault, i) => {
    const totalSupply = Number(BigInt(supplyResults.output[i].output)) / 1e18;
    const sharePrice = Number(BigInt(priceResults.output[i].output)) / 1e18;
    const sharePrice7d =
      Number(BigInt(priceResults7d.output[i].output)) / 1e18;

    const tvlUsd = totalSupply * sharePrice;

    // Annualize 7-day NAV growth
    const apyBase =
      sharePrice7d > 0
        ? ((sharePrice / sharePrice7d - 1) * (365 / 7)) * 100
        : 0;

    return {
      pool: `${vault.token}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT_NAME,
      symbol: vault.symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: vault.underlyingTokens,
      url: vault.url,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.re.xyz',
};
