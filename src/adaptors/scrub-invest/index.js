const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { windAndCheck, compounders, lpAbi, ercAbi } = require('./abi');

const CHAIN = 'kava';

const PROJECT_NAME = 'scrub-invest';

const vaults = {
  USDt: '0xfA8f4Fd6D961ECf25e3406a1e6a22A3671678a65',

  KAVA: '0xC00804268b8Ce19D2276A81292a6E28277bf3591',
};

const vaultsLP = {
  'TIGER/LION': '0x9e890FBD4295D92c41fA12a2083b51C387699Fd8',
};
const tokens = [
  {
    name: 'USDt',
    decimals: 6,
    address: '0x919C1c267BC06a7039e03fcc2eF738525769109c',
    tokens: ['0x919C1c267BC06a7039e03fcc2eF738525769109c'],
  },
  {
    name: 'KAVA',
    decimals: 18,
    address: '0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b',
    tokens: ['0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b'],
  },
  {
    name: 'TIGER/LION',
    decimals: 18,
    address: '0x78Ef6D3E3d0da9B2248C11BE11743B4C573ADd25',
    tokens: [
      '0x990e157fC8a492c28F5B50022F000183131b9026',
      '0x471F79616569343e8e84a66F342B7B433b958154',
    ],
    lp: true,
  },
];
const getOutput = ({ output }) => output.map(({ output }) => output);

const unwrapLP = async (chain, lpTokens) => {
  const [tokens, getReserves, totalSupply] = await Promise.all(
    ['tokens', 'getReserves', 'totalSupply'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpAbi.find(({ name }) => name === method),
        calls: lpTokens.map((token) => ({
          target: token,
        })),
        chain,
      })
    )
  ).then((data) => data.map(getOutput));
  const token0Addresses = tokens.map((token) => token[0]);
  const token1Addresses = tokens.map((token) => token[1]);
  const token0 = tokens.map((token) => `${chain}:${token[0]}`);
  const token1 = tokens.map((token) => `${chain}:${token[1]}`);
  const token0Decimals = (
    await sdk.api.abi.multiCall({
      abi: ercAbi.find(({ name }) => name === 'decimals'),
      calls: token0Addresses.map((token) => ({
        target: token,
      })),
      chain,
    })
  ).output.map((decimal) => Math.pow(10, Number(decimal.output)));

  const token1Decimals = (
    await sdk.api.abi.multiCall({
      abi: ercAbi.find(({ name }) => name === 'decimals'),
      calls: token1Addresses.map((token) => ({
        target: token,
      })),
      chain,
    })
  ).output.map((decimal) => Math.pow(10, Number(decimal.output)));

  const token0Price = await getPrices(token0);
  const token1Price = await getPrices(token1);
  const lpMarkets = lpTokens.map((lpToken) => {
    return { lpToken };
  });

  lpMarkets.map((token, i) => {
    if (isNaN(token0Price[token0Addresses[i].toLowerCase()])) {
      token.lpPrice =
        (2 *
          ((getReserves[i]._reserve1 / token1Decimals[i]) *
            token1Price[token1Addresses[i].toLowerCase()])) /
        (totalSupply[i] / 1e18);
    } else if (isNaN(token1Price[token1Addresses[i].toLowerCase()])) {
      token.lpPrice =
        (2 *
          ((getReserves[i]._reserve0 / token0Decimals[i]) *
            token0Price[token1Addresses[i].toLowerCase()])) /
        (totalSupply[i] / 1e18);
    } else {
      token.lpPrice =
        ((getReserves[i]._reserve0 / token0Decimals[i]) *
          token0Price[token0Addresses[i].toLowerCase()] +
          (getReserves[i]._reserve1 / token1Decimals[i]) *
            token1Price[token1Addresses[i].toLowerCase()]) /
        (totalSupply[i] / 1e18);
    }
    console.log(
      'LP Price Info',
      token.lpPrice,
      token0Decimals[i],
      token1Decimals[i],
      totalSupply[i],
      getReserves[i]._reserve0,
      getReserves[i]._reserve1,
      token0Addresses[i].toLowerCase(),
      token1Addresses[i].toLowerCase(),
      token0Price[token0Addresses[i].toLowerCase()],
      token1Price[token1Addresses[i].toLowerCase()]
    );
  });

  const lpPrices = {};
  lpMarkets.map((lp) => {
    lpPrices[lp.lpToken.toLowerCase()] = lp.lpPrice;
  });

  return lpPrices;
};

const getInfos = async () => {
  const vaultInfo = await (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: Object.entries(vaults).map((vault) => ({
        target: vault[1],
        params: ['0x0000000000000000000000000000000000000000'],
      })),
      abi: windAndCheck.find(({ name }) => name === 'getUserInfo'),
    })
  ).output.map(({ output }) => output);
  const vaultsLpInfo = await (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: Object.entries(vaultsLP).map((vault) => ({
        target: vault[1],
        params: ['0x0000000000000000000000000000000000000000'],
      })),
      abi: compounders.find(({ name }) => name === 'getUserInfo'),
    })
  ).output.map(({ output }) => output);
  return [...vaultInfo, ...vaultsLpInfo];
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
      [name.split(':')[1]]: price.price ?? 1,
    }),
    {}
  );

  return pricesByAddress;
};
const convertAPR2APY = (apr) => {
  return (apy = ((apr / (365 * 72) + 1) ** (365 * 72) - 1) * 100);
};

const calcApy = async () => {
  const pricesTokens = await getPrices(
    tokens
      .filter((token) => !token.lp)
      .map((token) => token.address)
      .map((token) => `${CHAIN}:` + token)
  );
  const lpPrices = await unwrapLP(
    CHAIN,
    tokens.filter((token) => token.lp === true).map((token) => token.address)
  );
  const prices = {
    ...pricesTokens,
    ...lpPrices,
  };

  const infos = await getInfos();

  const pools = tokens.map((token, i) => {
    const symbol = token.name;
    const tokenAddress = token.address;
    const tokxens = token.tokens;

    const vaultAddress =
      vaults[symbol]?.toLowerCase() ?? vaultsLP[symbol]?.toLowerCase();

    const decimals = token.decimals;
    let price = prices[tokenAddress.toLowerCase()];

    const info = infos[i];
    console.log(
      'INFOS',
      symbol,
      token.lp ? info.userInfo.totalCollateral ?? 0 : info.totalSupplied ?? 0,
      price
    );
    const tvlUsd =
      ((token.lp
        ? info.userInfo.totalCollateral ?? 0
        : info.totalSupplied ?? 0) /
        10 ** decimals) *
      price;
    const apyBase = convertAPR2APY(
      (token.lp ? info.userInfo.lastAPR ?? 0 : info.lastAPR ?? 0) / 1e6
    );

    return {
      pool: vaultAddress,
      chain: CHAIN,
      project: PROJECT_NAME,
      symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: tokxens,
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
