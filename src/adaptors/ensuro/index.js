const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const axios = require('axios');

// Idea of using alchemyKey copied from ../mellow-yield/index.js, but now with better code
const alchemy_url_regex = /https:[/][/].*alchemy[.]com[/]v2[/]([^/]+)/g;

const extractKey = (alchemy_full_url) => {
  const match = alchemy_url_regex.exec(alchemy_full_url);
  if (match === null) return null;
  return match[1];
};

const addressBook = {
  polygon: {
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    eTokens: [
      // eTokens
      {
        name: 'Senior Pool',
        address: '0xF383eF2D31E1d4a19B3e04ca2937DB6A8DA9f229',
        symbol: 'eUSDCBMASr',
      },
    ],
  },
};

const abiGetCurrentScale =
  'function getCurrentScale(bool updated) public view returns (uint256)';

const getApy = async () => {
  const timestamp1dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/polygon/${timestamp1dayAgo}`)
  ).data.height;

  const alchemyKey = extractKey(process.env.ALCHEMY_CONNECTION_ETHEREUM || '');

  if (alchemyKey === null)
    throw new Error(
      'Environment variable ALCHEMY_CONNECTION_ETHEREUM not defined or not in the expected format'
    );
  const provider = new ethers.providers.AlchemyProvider('matic', alchemyKey);

  return await Promise.all(
    addressBook.polygon.eTokens.map(async (etk) => {
      const [tsNow, csNow, csOneDayAgo] = await Promise.all([
        sdk.api.erc20.totalSupply({ target: etk.address, chain: 'polygon' }),
        sdk.api.abi.call({
          target: etk.address,
          chain: 'polygon',
          params: [true],
          abi: abiGetCurrentScale,
        }),
        sdk.api.abi.call({
          target: etk.address,
          chain: 'polygon',
          abi: abiGetCurrentScale,
          params: [true],
          block: block1dayAgo,
        }),
      ]);

      const dailyApr = csNow.output / csOneDayAgo.output - 1;
      // Using apr to apy formula from https://www.aprtoapy.com/
      const apy = (Math.pow(1 + dailyApr, 365) - 1) * 100;
      return {
        pool: etk.address,
        chain: 'polygon',
        project: 'ensuro',
        symbol: 'USDC',
        poolMeta: etk.name,
        tvlUsd: tsNow.output / 1e6,
        apyBase: apy,
        url: `https://app.ensuro.co/eTokens/${etk.address}`,
        underlyingTokens: [addressBook.polygon.usdc],
      };
    })
  );
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
