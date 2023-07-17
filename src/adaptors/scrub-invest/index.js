const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { windAndCheck, compounders, lpAbi, ercAbi } = require('./abi');

const CHAIN = 'kava';

const PROJECT_NAME = 'scrub-invest';

const vaults = {
  USDt: '0x1504B9EDdD57Ed8252b3b3b407DdE27B72A80790',
  KAVA: '0xC05021F3b3601BF33aB59dc75577B85985ACaab7',
};

const vaultsLP = {
  'BEAR/WBTC': '0x4402Cf5433D57266563979654d20887AcE672393',
  'TIGER/LION': '0x9e890FBD4295D92c41fA12a2083b51C387699Fd8',
  'USDt/LION': '0x56a9c9230d6D3b7bF147c10fdDBCD8F2eB1a2B6d',
  'VARA/WKAVA': '0xEa892552BD31A20F42ceb3476D6A280c405883d0',
  'LION/DEXI': '0xcf4673F714183C42DADc1B42DAC21BE09cfc3684',
  'USDt/WKAVA': '0x79eb3848B7B4630D1d883172f8e56B2e8fb18521',
  'USDt/axlUSDC': '0x1C415Ce79D0A18A4aA835D3d9083d2aF4d7894FC',
  'USDt/axlUSDT': '0xF35265f9713FD7ab6a27D387B2D02C1306FFB606',
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
    name: 'BEAR/WBTC',
    decimals: 18,
    address: '0xeA848151ACB1508988e56Ee7689F004df2B15ced',
    tokens: [
      '0x38481Fdc1aF61E6E72E0Ff46F069315A59779C65',
      '0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b',
    ],
    lp: true,
  },
  {
    name: 'TIGER/LION',
    decimals: 18,
    address: '0x78Ef6D3E3d0da9B2248C11BE11743B4C573ADd25',
    tokens: [
      '0x471F79616569343e8e84a66F342B7B433b958154',
      '0x990e157fC8a492c28F5B50022F000183131b9026',
    ],
    lp: true,
  },
  {
    name: 'USDt/LION',
    decimals: 18,
    address: '0x09d6561b3795ae237e42f7adf3dc83742e10a2e8',
    tokens: [
      '0x919C1c267BC06a7039e03fcc2eF738525769109c',
      '0x990e157fC8a492c28F5B50022F000183131b9026',
    ],
    lp: true,
  },
  {
    name: 'VARA/WKAVA',
    decimals: 18,
    address: '0x7d8100072ba0e4da8dc6bd258859a5dc1a452e05',
    tokens: [
      '0xE1da44C0dA55B075aE8E2e4b6986AdC76Ac77d73',
      '0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b',
    ],
    lp: true,
  },
  {
    name: 'LION/DEXI',
    decimals: 18,
    address: '0x7098c06cd97079742278F637D3EFE4Ce39e19A86',
    tokens: [
      '0x990e157fC8a492c28F5B50022F000183131b9026',
      '0xD22a58f79e9481D1a88e00c343885A588b34b68B',
    ],
    lp: true,
  },

  {
    name: 'USDt/WKAVA',
    decimals: 18,
    address: '0xBe87F2e81aa16238445651fAbf62Ae097498C200',
    tokens: [
      '0x919C1c267BC06a7039e03fcc2eF738525769109c',
      '0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b',
    ],
    lp: true,
  },
  {
    name: 'USDt/axlUSDC',
    decimals: 18,
    address: '0x4A18F16b6A4F695639B0d1390263Def2e91fc60f',
    tokens: [
      '0x919C1c267BC06a7039e03fcc2eF738525769109c',
      '0xEB466342C4d449BC9f53A865D5Cb90586f405215',
    ],
    lp: true,
  },
  {
    name: 'USDt/axlUSDT',
    decimals: 18,
    address: '0x6337e3a13CB76d93856E7403B7f98A37CB2bc7dF',
    tokens: [
      '0x919C1c267BC06a7039e03fcc2eF738525769109c',
      '0x7f5373AE26c3E8FfC4c77b7255DF7eC1A9aF52a6',
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
  // add price 1 to any missing addresses
  for (let i = 0; i < addresses.length; i++) {
    if (!pricesByAddress[addresses[i].split(':')[1].toLowerCase()]) {
      pricesByAddress[addresses[i].split(':')[1].toLowerCase()] = 1;
    }
  }
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
      token.lp ? info?.userInfo.totalCollateral ?? 0 : info.totalSupplied ?? 0,
      price,
      decimals
    );
    const tvlUsd =
      ((token.lp
        ? info?.userInfo.totalCollateral ?? 0
        : info?.totalSupplied ?? 0) /
        10 ** decimals) *
      price;
    const apyBase = convertAPR2APY(
      (token.lp ? info?.userInfo.lastAPR ?? 0 : info?.lastAPR ?? 0) / 1e6
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
  console.log('Pools', pools);
  return pools;
};

module.exports = {
  timetravel: false,
  apy: calcApy,
  url: 'https://invest.scrub.money',
};
