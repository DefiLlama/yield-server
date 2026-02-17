const axios = require('axios');
const sdk = require('@defillama/sdk');

const abi = require('./abi.json');

const spETH = '0xD06f6a56c5f599cB375B616DF306f32B7F6f4A0E';
const mpETH = '0x48AFbBd342F64EF8a9Ab1C143719b63C2AD81710';

const convertToAssetsAbi = abi.find((m) => m.name === 'convertToAssets');
const totalAssetsAbi = abi.find((m) => m.name === 'totalAssets');

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;
  const [{ data: block1d }, { data: block7d }] = await Promise.all([
    axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`),
    axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7dayAgo}`),
  ]);
  const block1dayAgo = block1d.height;
  const block7dayAgo = block7d.height;

  const amount = 1000000000000000000n;

  const [spRates, mpRates, spAssets, mpAssets, priceRes] = await Promise.all([
    // spETH exchange rates: current, 1d ago, 7d ago
    Promise.all([
      sdk.api.abi.call({ target: spETH, abi: convertToAssetsAbi, params: [amount] }),
      sdk.api.abi.call({ target: spETH, abi: convertToAssetsAbi, params: [amount], block: block1dayAgo }),
      sdk.api.abi.call({ target: spETH, abi: convertToAssetsAbi, params: [amount], block: block7dayAgo }),
    ]),
    // mpETH exchange rates: current, 1d ago, 7d ago
    Promise.all([
      sdk.api.abi.call({ target: mpETH, abi: convertToAssetsAbi, params: [amount] }),
      sdk.api.abi.call({ target: mpETH, abi: convertToAssetsAbi, params: [amount], block: block1dayAgo }),
      sdk.api.abi.call({ target: mpETH, abi: convertToAssetsAbi, params: [amount], block: block7dayAgo }),
    ]),
    // totalAssets for TVL
    sdk.api.abi.call({ target: spETH, abi: totalAssetsAbi }),
    sdk.api.abi.call({ target: mpETH, abi: totalAssetsAbi }),
    // ETH price
    axios.get('https://coins.llama.fi/prices/current/coingecko:ethereum'),
  ]);

  const ethPrice = priceRes.data.coins['coingecko:ethereum'].price;

  const calcApy = (rates) => {
    const apyBase = ((rates[0].output - rates[1].output) / 1e18) * 365 * 100;
    const apyBase7d = ((rates[0].output - rates[2].output) / 1e18 / 7) * 365 * 100;
    return { apyBase, apyBase7d };
  };

  return [
    {
      pool: spETH,
      project: 'meta-pool-eth',
      chain: 'ethereum',
      symbol: 'spETH',
      tvlUsd: (spAssets.output / 1e18) * ethPrice,
      ...calcApy(spRates),
      underlyingTokens: [spETH],
    },
    {
      pool: mpETH,
      project: 'meta-pool-eth',
      chain: 'ethereum',
      symbol: 'mpETH',
      tvlUsd: (mpAssets.output / 1e18) * ethPrice,
      ...calcApy(mpRates),
      underlyingTokens: [mpETH],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.metapool.app/stake?token=ethereum',
};
