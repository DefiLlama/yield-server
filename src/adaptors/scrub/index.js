const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { windAndCheck } = require('./abi');

const CHAIN = 'kava';

const PROJECT_NAME = 'scrub-invest';

const vaults = {
  USDC: '0xcd017B495DF1dE2DC8069b274e2ddfBB78561176',
  USDT: '0x88555c4d8e53ffB223aB5baDe0B5e6B2Cd3966c4',
  DAI: '0xB4Ba7ba722eacAE8f1e4c6213AF05b5E8B27dbdB',
  WKAVA: '0xB9774bB2A18Af59Ec9bf86dCaeC07473A2D2F230',
  WETH: '0x3CcA2C0d433E00433082ba16e968CA11dA6Dc156',
};
const tokens = [
  {
    name: 'USDC',
    symbol: '$',
    image: '/usdc.png',
    decimals: 6,
    address: '0xfA9343C3897324496A05fC75abeD6bAC29f8A40f',
  },
  {
    name: 'USDT',
    symbol: '$',
    image: '/usdt.png',
    decimals: 6,
    address: '0xB44a9B6905aF7c801311e8F4E76932ee959c663C',
  },
  {
    name: 'DAI',
    symbol: '$',
    image: '/dai.png',
    decimals: 18,
    address: '0x765277eebeca2e31912c9946eae1021199b39c61',
  },
  {
    name: 'KAVA',
    image: '/wkava.png',
    symbol: 'K',
    decimals: 18,
    address: '0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b',
  },
  {
    name: 'WETH',
    image: '/weth.png',
    symbol: 'Ξ',
    decimals: 18,
    address: '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D',
  },
];

const getInfo = async (token) => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: Object.entries(vaults)
        .filter((v) => v[0].includes(token))
        .map((vault) => ({
          target: vault,
          params: ['0x0000000000000000000000000000000000000000'],
        })),
      abi: windAndCheck.userInfo,
    })
  ).output.map(({ output }) => output);
};

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses,
    })
  ).body.coins;

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return pricesByAddress;
};

const prices = await getPrices(
  tokens.map((token) => token.address).map((token) => `${CHAIN}:` + token)
);

const calcApy = async () => {
  const pools = tokens.map((token, i) => {
    const symbol = token.name;
    const token = token.address;

    const decimals = token.decimals;
    let price = prices[token.toLowerCase()];
    if (price === undefined)
      price = symbol.toLowerCase().includes('usd') ? 1 : 0;

    const totalBorrowUsd = (Number(totalBorrows[i]) / 10 ** decimals) * price;

    const info = getInfo(token);
    const tvlUsd = ((info[8] ?? 0) / 10 ** decimals) * price;
    const apyBase = (info[4] ?? 0) / 1e3;

    return {
      pool: symbol,
      chain: CHAIN,
      project: PROJECT_NAME,
      symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [token],
      rewardTokens: [token],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: calcApy,
  url: 'https://invest.scrub.money',
};
