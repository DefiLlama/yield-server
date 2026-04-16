const sdk = require('@defillama/sdk');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const PRISM = '0x06Bb4ab600b7D22eB2c312f9bAbC22Be6a619046';
const xPRISM = '0x12E04c932D682a2999b4582F7c9B86171B73220D';

const project = 'openeden-prism';

const getBlock = async (timestamp) => {
  const response = await axios.get(
    `https://coins.llama.fi/block/ethereum/${timestamp}`
  );
  return response.data.height;
};

// Get xPRISM exchange rate (assets per share) at a specific block
const getExchangeRate = async (address, block) => {
  const [totalAssets, totalSupply] = await Promise.all([
    sdk.api.abi.call({
      target: address,
      chain: 'ethereum',
      abi: 'uint256:totalAssets',
      block,
    }),
    sdk.api.abi.call({
      target: address,
      chain: 'ethereum',
      abi: 'uint256:totalSupply',
      block,
    }),
  ]);

  if (totalSupply.output === '0') return null;
  return new BigNumber(totalAssets.output).dividedBy(totalSupply.output);
};

const apy = async () => {
  const timestampNow = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = timestampNow - 86400;
  const timestamp7daysAgo = timestampNow - 86400 * 7;

  const [blockNow, block1dayAgo, block7daysAgo] = await Promise.all([
    getBlock(timestampNow),
    getBlock(timestamp1dayAgo),
    getBlock(timestamp7daysAgo),
  ]);

  const [rateNow, rate1dayAgo, rate7daysAgo] = await Promise.all([
    getExchangeRate(xPRISM, blockNow),
    getExchangeRate(xPRISM, block1dayAgo),
    getExchangeRate(xPRISM, block7daysAgo),
  ]);

  const apyBase =
    rateNow && rate1dayAgo
      ? rateNow
          .minus(rate1dayAgo)
          .dividedBy(rate1dayAgo)
          .times(365)
          .times(100)
          .toNumber()
      : null;

  const apyBase7d =
    rateNow && rate7daysAgo
      ? rateNow
          .minus(rate7daysAgo)
          .dividedBy(rate7daysAgo)
          .times(365 / 7)
          .times(100)
          .toNumber()
      : null;

  // TVL from xPRISM totalAssets (PRISM staked in the vault)
  const [totalAssets, priceRes] = await Promise.all([
    sdk.api.abi.call({
      target: xPRISM,
      chain: 'ethereum',
      abi: 'uint256:totalAssets',
    }),
    axios.get(`https://coins.llama.fi/prices/current/ethereum:${PRISM}`),
  ]);

  const prismPrice = priceRes.data.coins[`ethereum:${PRISM}`]?.price;
  if (!Number.isFinite(prismPrice)) {
    throw new Error(`Missing price for PRISM (${PRISM})`);
  }
  const tvlUsd = new BigNumber(totalAssets.output)
    .dividedBy(1e18)
    .times(prismPrice)
    .toNumber();

  return [
    {
      pool: `${xPRISM.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project,
      symbol: 'xPRISM',
      tvlUsd,
      apyBase,
      apyBase7d,
      underlyingTokens: [PRISM],
      url: 'https://app.openeden.com/prism?chain=mainnet',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.openeden.com/prism',
};
