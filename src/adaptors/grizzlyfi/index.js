const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const GHNY = '0xa045e37a0d1dd3a45fefb8803d22457abc0a728a';
const APY_URL = 'https://app.grizzly.fi/api/computed-apys';
const lpABI = require('./abis/lp.json');
const abi = {
  inputs: [],
  name: 'grizzlyStrategyDeposits',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function'
};

const tokenLpApi = (method) => {
  return {
    'constant': true,
    'inputs': [],
    'name': method,
    'outputs': [
        {
            'internalType': 'address',
            'name': '',
            'type': 'address'
        }
    ],
    'payable': false,
    'stateMutability': 'view',
    'type': 'function'
  };
};

const hives = [
  {
    hive: '0xDa0Ae0710b080AC64e72Fa3eC44203F27750F801',
    lpToken: '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16'
  },
  {
    hive: '0x8D83Ad61Ae6eDE4274876EE9ad9127843ba2AbF7',
    lpToken: '0xEc6557348085Aa57C72514D67070dC863C0a5A8c'
  },
  {
    hive: '0xE4Dbb05498C42A6E780e4C6F96A4E20a7D7Cb1d6',
    lpToken: '0x7EFaEf62fDdCCa950418312c6C91Aef321375A00'
  },
  {
    hive: '0x66B1bACAB888017cA96abBf28ad8d10B7A7B5eC3',
    lpToken: '0x2354ef4DF11afacb85a5C7f98B624072ECcddbB1'
  },
  {
    hive: '0x9F45E2181D365F9057f67153e6D213e2358A5A4B',
    lpToken: '0x66FDB2eCCfB58cF098eaa419e5EfDe841368e489'
  },
  {
    hive: '0x3cbF1d01A650e9DB566A123E3D5e42B9684C6b6a',
    lpToken: '0xEa26B78255Df2bBC31C1eBf60010D78670185bD0'
  },
  {
    hive: '0x6fc2FEed99A97105B988657f9917B771CD809f40',
    lpToken: '0xF45cd219aEF8618A92BAa7aD848364a158a24F33'
  }
];

const calculateReservesUSD = (
  reserves,
  reservesRatio,
  token0,
  token1,
  tokenPrices
) => {
  const { decimals: token0Decimals, address: token0Address } = token0;
  const { decimals: token1Decimals, address: token1Address } = token1;
  const token0Price = tokenPrices[token0Address.toLowerCase()];
  const token1Price = tokenPrices[token1Address.toLowerCase()];

  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - token0Decimals));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - token1Decimals));

  if (token0Price) return reserve0.times(token0Price).times(2);
  if (token1Price) return reserve1.times(token1Price).times(2);
};

const getPairInfo = async (pair, tokenAddress) => {
  const [tokenSymbol, tokenDecimals] = await Promise.all(
    ['erc20:symbol', 'erc20:decimals'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain: 'bsc',
        requery: true,
      }
    )
  ));
  return {
    lpToken: pair.toLowerCase(),
    pairName: tokenSymbol.output.map(e => e.output).join('-'),
    token0: {
      address: tokenAddress[0],
      symbol: tokenSymbol.output[0].output,
      decimals: tokenDecimals.output[0].output
    },
    token1: {
      address: tokenAddress[1],
      symbol: tokenSymbol.output[1].output,
      decimals: tokenDecimals.output[1].output
    }
  };
};

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses.map((address) => `bsc:${address}`),
    })
  ).body.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};


async function apy() {
  const hiveBalancesCall = await sdk.api.abi.multiCall({
    calls: hives.map(h => ({ target: h.hive })),
    abi,
    chain: 'bsc',
  });

  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
    sdk.api.abi.multiCall({
      abi: tokenLpApi(method),
      calls: hives.map(({lpToken}) => ({
        target: lpToken,
      })),
      chain: 'bsc',
      requery: true,
    }))
  );

  const [reservesRes, supplyRes] = await Promise.all(
    ['getReserves', 'totalSupply'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpABI.filter(({ name }) => name === method)[0],
        calls: hives.map(({lpToken}) => ({
          target: lpToken,
        })),
        chain: 'bsc',
        requery: true,
      })
    )
  );
  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const hiveBalances = hiveBalancesCall.output.map(e => e.output);
  const tokens0 = underlyingToken0.output.map((res) => res.output);
  const tokens1 = underlyingToken1.output.map((res) => res.output);
  const tokensPrices = await getPrices([...tokens0, ...tokens1]);
  const pairInfos = await Promise.all(hives.map((val, index) => getPairInfo(val.lpToken, [tokens0[index], tokens1[index]])));
  const apyComputed = await utils.getData(APY_URL);
  const res = hives.map((pool, i) => {
    const pairInfo = pairInfos[i];
    const supply = supplyData[i];
    const reserves = reservesData[i];
    const masterChefBalance = hiveBalances[i];
    const {lpApr, baseApr} = apyComputed.instances
      .find(e => e.instanceAddress.toLowerCase() === pool.hive.toLowerCase())

    const masterChefReservesUsd = calculateReservesUSD(
      reserves,
      masterChefBalance / supply,
      pairInfo.token0,
      pairInfo.token1,
      tokensPrices
    )
      .div(1e18)
      .toString()

    return {
      pool: pool.lpToken,
      chain: utils.formatChain('binance'),
      project: 'grizzlyfi',
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd: Number(masterChefReservesUsd),
      apyBase: baseApr,
      apyReward: lpApr,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [GHNY],
    };
  });

  return res;
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://grizzly.fi/',
};
