const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const axios = require('axios');

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
  ethereum: {
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    eTokens: [
      // eTokens
      {
        name: 'Senior Pool',
        address: '0xa551285B49A29cBDBAE7fC5C6a61fadC918Ad224',
        symbol: 'eUSDSr',
      },
      {
        name: 'Spot Junior',
        address: '0x12a4f34d27B1D54defD4Eb39799971E26D9025E7',
        symbol: 'eUSDSPOJr',
      },
      {
        name: 'CliffHorizon Junior',
        address: '0xB375f428De1143bD08EB20151559a221744249c7',
        symbol: 'eUSDCFHJr',
      },
    ],
  },
};

const abiGetCurrentScale =
  'function getCurrentScale(bool updated) public view returns (uint256)';

const getApy = async (chain) => {
  const timestamp1dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/${chain}/${timestamp1dayAgo}`)
  ).data.height;

  return await Promise.all(
    addressBook[chain].eTokens.map(async (etk) => {
      const [tsNow, csNow, csOneDayAgo] = await Promise.all([
        sdk.api.erc20.totalSupply({ target: etk.address, chain }),
        sdk.api.abi.call({
          target: etk.address,
          chain,
          params: [true],
          abi: abiGetCurrentScale,
        }),
        sdk.api.abi.call({
          target: etk.address,
          chain,
          abi: abiGetCurrentScale,
          params: [true],
          block: block1dayAgo,
        }),
      ]);

      const dailyApr = csNow.output / csOneDayAgo.output - 1;
      const frontEnd =
        chain === 'polygon' ? 'app-v2.ensuro.co' : 'app.ensuro.co';

      // Using apr to apy formula from https://www.aprtoapy.com/
      const apy = (Math.pow(1 + dailyApr, 365) - 1) * 100;
      return {
        pool: etk.address,
        chain,
        project: 'ensuro',
        symbol: 'USDC',
        poolMeta: etk.name,
        tvlUsd: tsNow.output / 1e6,
        apyBase: apy,
        url: `https://${frontEnd}/eTokens/${etk.address}`,
        underlyingTokens: [addressBook[chain].usdc],
      };
    })
  );
};

const getApyAllChains = async () => {
  const polygon = await getApy('polygon');
  const ethereum = await getApy('ethereum');
  return polygon.concat(ethereum);
};

module.exports = {
  timetravel: false,
  apy: getApyAllChains,
};
