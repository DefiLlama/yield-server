const utils = require('../utils');
const sdk = require('@defillama/sdk');

const GGAVAX_CONTRACT = '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3';
const WAVAX_CONTRACT = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';

const totalAssetsAbi = [
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

async function fetchTotalAssets() {
  const { output } = await sdk.api.abi.call({
    target: GGAVAX_CONTRACT,
    abi: totalAssetsAbi[0],
    chain: 'avax',
  });
  return Number(output) / 1e18;
}

const avaxPrice = async () => {
  const priceKey = `avax:${WAVAX_CONTRACT}`;
  const data = await utils.getPriceApiData(`/prices/current/${priceKey}`);
  return data.coins[priceKey]?.price;
};

const fetchData = async () => {
  const apiUrl = 'https://api.gogopool.com/metrics';
  const avaxUSD = await avaxPrice();
  const avaxLstSide = await fetchTotalAssets();

  const data = await utils.getData(apiUrl);

  const tvlUsd = parseFloat(avaxLstSide) * avaxUSD;

  return {
    apyBase: Number(data.ggavax_apy),
    tvlUsd: tvlUsd,
  };
};

const topLvl = async () => {
  const { apyBase, tvlUsd } = await fetchData();
  return {
    pool: '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3',
    chain: 'Avalanche',
    project: 'hypha',
    symbol: 'ggAVAX',
    tvlUsd: tvlUsd,
    apyBase: apyBase,
    underlyingTokens: ['0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'],
  };
};

const main = async () => {
  return [await topLvl()];
};

module.exports = {
  protocolId: '3179',
  timetravel: false,
  apy: main,
  url: 'https://www.gogopool.com',
};
