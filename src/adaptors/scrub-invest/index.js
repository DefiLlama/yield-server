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
  KAVA: '0xB9774bB2A18Af59Ec9bf86dCaeC07473A2D2F230',
  WETH: '0x3CcA2C0d433E00433082ba16e968CA11dA6Dc156',
};
const tokens = [
  {
    name: 'USDC',
    decimals: 6,
    address: '0xfA9343C3897324496A05fC75abeD6bAC29f8A40f',
  },
  {
    name: 'USDT',
    decimals: 6,
    address: '0xB44a9B6905aF7c801311e8F4E76932ee959c663C',
  },
  {
    name: 'DAI',
    decimals: 18,
    address: '0x765277eebeca2e31912c9946eae1021199b39c61',
  },
  {
    name: 'KAVA',
    decimals: 18,
    address: '0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b',
  },
  {
    name: 'WETH',
    decimals: 18,
    address: '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D',
  },
];

const getInfos = async () => {
  return await (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: Object.entries(vaults).map((vault) => ({
        target: vault[1],
        params: ['0x0000000000000000000000000000000000000000'],
      })),
      abi: windAndCheck.find(({ name }) => name === 'getUserInfo'),
    })
  ).output.map(({ output }) => output);
};

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
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
const convertAPR2APY = (apr) => {
  return (apy = ((apr / (365 * 72) + 1) ** (365 * 72) - 1) * 100);
};

const calcApy = async () => {
  const prices = await getPrices(
    tokens.map((token) => token.address).map((token) => `${CHAIN}:` + token)
  );
  const infos = await getInfos();
  console.log(infos);
  const pools = tokens.map((token, i) => {
    const symbol = token.name;
    const tokenAddress = token.address;
    const vaultAddress = vaults[symbol]?.toLowerCase();

    const decimals = token.decimals;
    let price = prices[tokenAddress.toLowerCase()];
    if (price === undefined)
      price = symbol.toLowerCase().includes('usd') ? 1 : 0;
    const info = infos[i];
    console.log(info);
    const tvlUsd = ((info.totalSupplied ?? 0) / 10 ** decimals) * price;
    const apyBase = convertAPR2APY((info.lastAPR ?? 0) / 1e6);

    return {
      pool: vaultAddress,
      chain: CHAIN,
      project: PROJECT_NAME,
      symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [tokenAddress],
      rewardTokens: [tokenAddress],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: calcApy,
  url: 'https://invest.scrub.money',
};
