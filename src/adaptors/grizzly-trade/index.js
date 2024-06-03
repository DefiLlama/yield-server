const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const GHNY = '0xa045e37a0d1dd3a45fefb8803d22457abc0a728a';
const APY_URL = 'https://api.grizzly.fi/apy/current/bsc';
const lpABI = require('./abis/lp.json');

const abi = {
  inputs: [],
  name: 'grizzlyStrategyDeposits',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const abiGrizzly = {
  inputs: [],
  name: 'grizzlyStrategyDeposits',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
const abiStandard = {
  inputs: [],
  name: 'standardStrategyDeposits',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
const abiStable = {
  inputs: [],
  name: 'stablecoinStrategyDeposits',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
const abiFarm = {
  inputs: [],
  name: 'totalDeposits',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
const abiYearn = {
  inputs: [],
  name: 'totalAssets',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
const abiPcsV3 = {
  inputs: [],
  name: 'getUnderlyingBalances',
  outputs: [
    { internalType: 'uint256', name: '', type: 'uint256' },
    { internalType: 'uint256', name: '', type: 'uint256' },
  ],
  stateMutability: 'view',
  type: 'function',
};

const tokenLpApi = (method) => {
  return {
    constant: true,
    inputs: [],
    name: method,
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  };
};

const stableTokenLpCoinApi = () => {
  return {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'coins',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  };
};

const stableTokenLpBalancesApi = () => {
  return {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'balances',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };
};

const pcsHives = [
  // PCS hives
  {
    hive: '0xDa0Ae0710b080AC64e72Fa3eC44203F27750F801',
    token: '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16',
    name: 'Pancakeswap',
  },
  {
    hive: '0x8D83Ad61Ae6eDE4274876EE9ad9127843ba2AbF7',
    token: '0xEc6557348085Aa57C72514D67070dC863C0a5A8c',
    name: 'Pancakeswap',
  },
  {
    hive: '0xE4Dbb05498C42A6E780e4C6F96A4E20a7D7Cb1d6',
    token: '0x7EFaEf62fDdCCa950418312c6C91Aef321375A00',
    name: 'Pancakeswap',
  },
  {
    hive: '0x66B1bACAB888017cA96abBf28ad8d10B7A7B5eC3',
    token: '0x2354ef4DF11afacb85a5C7f98B624072ECcddbB1',
    name: 'Pancakeswap',
  },
  {
    hive: '0x9F45E2181D365F9057f67153e6D213e2358A5A4B',
    token: '0x66FDB2eCCfB58cF098eaa419e5EfDe841368e489',
    name: 'Pancakeswap',
  },
  {
    hive: '0x3cbF1d01A650e9DB566A123E3D5e42B9684C6b6a',
    token: '0xEa26B78255Df2bBC31C1eBf60010D78670185bD0',
    name: 'Pancakeswap',
  },
  {
    hive: '0x6fc2FEed99A97105B988657f9917B771CD809f40',
    token: '0xF45cd219aEF8618A92BAa7aD848364a158a24F33',
    name: 'Pancakeswap',
  },
  // Biswap hives
  {
    hive: '0x0286A72F055A425af9096b187bf7f88e9f7D96A9',
    token: '0x8840C6252e2e86e545deFb6da98B2a0E26d8C1BA',
    name: 'Biswap',
  },
  {
    hive: '0xB07a180735657a92d8e2b77D213bCBE5ab819089',
    token: '0xa987f0b7098585c735cD943ee07544a84e923d1D',
    name: 'Biswap',
  },
  {
    hive: '0xe178eaDBcb4A64476B8E4673D99192C25ef1B42e',
    token: '0x63b30de1A998e9E64FD58A21F68D323B9BcD8F85',
    name: 'Biswap',
  },
];

const farms = [
  {
    hive: '0x3641676bFe07F07DD2f79244BcdBb751f95F67Ca',
    token: '0x2b702b4e676b51f98c6b4af1b2cafd6a9fc2a3e0',
    name: 'Farm',
  },
  {
    hive: '0xF530B259fFf408aaB2B02aa60dd6fe48FCDC2FC9',
    token: '0x352008bf4319c3b7b8794f1c2115b9aa18259ebb',
    name: 'Farm',
  },
];

const stableHives = [
  {
    hive: '0x7Bf5005F9a427cB4a3274bFCf36125cE979F77cb',
    token: '0x36842f8fb99d55477c0da638af5ceb6bbf86aa98',
    swap: '0x169f653a54acd441ab34b73da9946e2c451787ef',
    name: 'V2-Stable',
  },
  {
    hive: '0x7E5762A7D68Fabcba39349229014c59Db6dc5eB0',
    token: '0xee1bcc9f1692e81a281b3a302a4b67890ba4be76',
    swap: '0x3efebc418efb585248a0d2140cfb87afcc2c63dd',
    name: 'V2-Stable',
  },
  {
    hive: '0xCCf6356C96Eadd2702fe6f5Ef99B1C0a3966EDf7',
    token: '0x1a77c359d0019cd8f4d36b7cdf5a88043d801072',
    swap: '0xc2f5b9a3d9138ab2b74d581fc11346219ebf43fe',
    name: 'V2-Stable',
  },
];

const yearnHives = [
  // Thena hives
  {
    hive: '0x5Aa6dd6bA3091ba151B4E5c0C0c4f06335e91482',
    token: '0xa97e46dc17e2b678e5f049a2670fae000b57f05e',
    name: 'Thena',
  } /*
  {
    hive: "0x38b2f5038F70b8A4a54A2CC8d35d85Cc5f0794e4",
    token: "0xc8da40f8a354530f04ce2dde98ebc2960a9ea449",
    name: "Thena"
  },*/,
  {
    hive: '0x3dF96fE4E92f38F7C931fA5A00d1f644D1c60dbF',
    token: '0x075e794f631ee81df1aadb510ac6ec8803b0fa35',
    name: 'Thena',
  },
  {
    hive: '0x9Ce89aba449135539A61C57665547444a92784aB',
    token: '0x3c552e8ac4473222e3d794adecfa432eace85929',
    name: 'Thena',
  },
  {
    hive: '0xc750432473eABE034e84d373CB92f16e6EB0d273',
    token: '0x3ec80a1f547ee6fd5d7fc0dc0c1525ff343d087c',
    name: 'Thena',
  },
  {
    hive: '0xf01F9e8A5C6B9Db49e851e8d72B70569042F0e1C',
    token: '0x63db6ba9e512186c2faadacef342fb4a40dc577c',
    name: 'Thena',
  },
  {
    hive: '0xF7DE4A13669CB33D54b59f35FE71dFcD67e4635E',
    token: '0x34b897289fccb43c048b2cea6405e840a129e021',
    name: 'Thena',
  },
];

const pcsV3Hives = [
  {
    hive: '0x25223015ee4dbaf9525ddd43797cae1dcd83f6b5',
    name: 'Pancakeswap-V3',
  },
  {
    hive: '0x9eab3bf245da9b6d8705b1a906ee228382c38f93',
    name: 'Pancakeswap-V3',
  },
  {
    hive: '0x76ab668d93135bcd64df8e4a7ab9dd05fac4cdbf',
    name: 'Pancakeswap-V3',
  },
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

  return reserve0.times(token0Price).plus(reserve1.times(token1Price));
};

const getPairInfo = async (tokenAddress) => {
  const [tokenSymbol, tokenDecimals] = await Promise.all(
    ['erc20:symbol', 'erc20:decimals'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain: 'bsc',
        requery: true,
      })
    )
  );
  return {
    pairName: tokenSymbol.output.map((e) => e.output).join('-'),
    token0: {
      address: tokenAddress[0],
      symbol: tokenSymbol.output[0].output,
      decimals: tokenDecimals.output[0].output,
    },
    token1: {
      address: tokenAddress[1],
      symbol: tokenSymbol.output[1].output,
      decimals: tokenDecimals.output[1].output,
    },
  };
};

const getPrices = async (addresses) => {
  const coins = addresses
    .map((address) => `bsc:${address}`)
    .join(',')
    .toLowerCase();
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${coins}`)
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
  const getHive = (i) => ({ target: i.hive });

  const [
    hiveBalancesGrizzly,
    hiveBalancesStandard,
    hiveBalancesStable,
    stableHiveBalancesGrizzly,
    stableHiveBalancesStandard,
    stableHiveBalancesStable,
    farmBalances,
    yearnBalances,
  ] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: pcsHives.map(getHive),
      abi: abiGrizzly,
      chain: 'bsc',
    }),
    sdk.api.abi.multiCall({
      calls: pcsHives.map(getHive),
      abi: abiStandard,
      chain: 'bsc',
    }),
    sdk.api.abi.multiCall({
      calls: pcsHives.map(getHive),
      abi: abiStable,
      chain: 'bsc',
    }),
    sdk.api.abi.multiCall({
      calls: stableHives.map(getHive),
      abi: abiGrizzly,
      chain: 'bsc',
    }),
    sdk.api.abi.multiCall({
      calls: stableHives.map(getHive),
      abi: abiStandard,
      chain: 'bsc',
    }),
    sdk.api.abi.multiCall({
      calls: stableHives.map(getHive),
      abi: abiStable,
      chain: 'bsc',
    }),
    sdk.api.abi.multiCall({
      calls: farms.map(getHive),
      abi: abiFarm,
      chain: 'bsc',
    }),
    sdk.api.abi.multiCall({
      calls: yearnHives.map(getHive),
      abi: abiYearn,
      chain: 'bsc',
    }),
  ]);

  const [underlyingToken0Uni, underlyingToken1Uni] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: tokenLpApi(method),
        calls: pcsHives
          .concat(farms)
          .concat(yearnHives)
          .map(({ token }) => ({
            target: token,
          })),
        chain: 'bsc',
        requery: true,
      })
    )
  );

  const [underlyingToken0V3, underlyingToken1V3] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: tokenLpApi(method),
        calls: pcsV3Hives.map(({ hive }) => ({
          target: hive,
        })),
        chain: 'bsc',
        requery: true,
      })
    )
  );

  const [underlyingToken0Stable, underlyingToken1Stable] = await Promise.all(
    [0, 1].map((coin) =>
      sdk.api.abi.multiCall({
        abi: stableTokenLpCoinApi(),
        calls: stableHives.map(({ swap }) => ({
          target: swap,
          params: [coin],
        })),
        chain: 'bsc',
        requery: true,
      })
    )
  );

  const [reservesResUni, supplyResUni] = await Promise.all(
    ['getReserves', 'totalSupply'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpABI.filter(({ name }) => name === method)[0],
        calls: pcsHives
          .concat(farms)
          .concat(yearnHives)
          .map(({ token }) => ({
            target: token,
          })),
        chain: 'bsc',
        requery: true,
      })
    )
  );

  const [reservesV3] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: abiPcsV3,
      calls: pcsV3Hives.map(({ hive }) => ({
        target: hive,
      })),
      chain: 'bsc',
      requery: true,
    }),
  ]);

  const [reservesToken0Stable, reservesToken1Stable] = await Promise.all(
    [0, 1].map((coin) =>
      sdk.api.abi.multiCall({
        abi: stableTokenLpBalancesApi(),
        calls: stableHives.map(({ swap }) => ({
          target: swap,
          params: [coin],
        })),
        chain: 'bsc',
        requery: true,
      })
    )
  );

  const totalSupplyStable = await sdk.api.abi.multiCall({
    abi: lpABI.filter(({ name }) => name === 'totalSupply')[0],
    calls: stableHives.map(({ token }) => ({
      target: token,
    })),
    chain: 'bsc',
    requery: true,
  });

  const reserveDataUni = reservesResUni.output.map((res) => res.output);
  const reserveDataV3 = reservesV3.output.map((res) => {
    return {
      _reserve0: res.output[0],
      _reserve1: res.output[1],
    };
  });
  const reserveDataStable0 = reservesToken0Stable.output.map(
    (res) => res.output
  );
  const reserveDataStable1 = reservesToken1Stable.output.map(
    (res) => res.output
  );

  const reserveDataStable = reserveDataStable0.map((r0, i) => {
    const r1 = reserveDataStable1[i];
    return {
      _reserve0: r0,
      _reserve1: r1,
    };
  });

  const reservesData = reserveDataUni
    .concat(reserveDataV3)
    .concat(reserveDataStable);

  const supplyDataUni = supplyResUni.output.map((res) => res.output);
  const supplyDataV3 = pcsV3Hives.map(() => 1);
  const supplyDataStable = totalSupplyStable.output.map((res) => res.output);

  const supplyData = supplyDataUni
    .concat(supplyDataV3)
    .concat(supplyDataStable);

  const hiveBalances = [];

  hiveBalances.push(
    ...hiveBalancesGrizzly.output.map((grizzly, i) => {
      const hbg = BigNumber(grizzly.output);
      const hbStd = BigNumber(hiveBalancesStandard.output[i].output);
      const hbStb = BigNumber(hiveBalancesStable.output[i].output);

      return hbg.plus(hbStd).plus(hbStb).toString(10);
    })
  );

  hiveBalances.push(...farmBalances.output.map((res) => res.output));
  hiveBalances.push(...yearnBalances.output.map((res) => res.output));

  hiveBalances.push(...pcsV3Hives.map(() => 1));

  hiveBalances.push(
    ...stableHiveBalancesGrizzly.output.map((grizzly, i) => {
      const hbg = BigNumber(grizzly.output);
      const hbStd = BigNumber(stableHiveBalancesStandard.output[i].output);
      const hbStb = BigNumber(stableHiveBalancesStable.output[i].output);

      return hbg.plus(hbStd).plus(hbStb).toString(10);
    })
  );

  const tokens0 = underlyingToken0Uni.output
    .map((res) => res.output)
    .concat(underlyingToken0V3.output.map((res) => res.output))
    .concat(underlyingToken0Stable.output.map((res) => res.output));
  const tokens1 = underlyingToken1Uni.output
    .map((res) => res.output)
    .concat(underlyingToken1V3.output.map((res) => res.output))
    .concat(underlyingToken1Stable.output.map((res) => res.output));

  const tokensPrices = await getPrices([...tokens0, ...tokens1]);

  const pairInfos = await Promise.all(
    pcsHives
      .concat(farms)
      .concat(yearnHives)
      .concat(pcsV3Hives)
      .concat(stableHives)
      .map((val, index) => getPairInfo([tokens0[index], tokens1[index]]))
  );

  const apyComputed = await utils.getData(APY_URL);

  const res = pcsHives
    .concat(farms)
    .concat(yearnHives)
    .concat(pcsV3Hives)
    .concat(stableHives)
    .map((pool, i) => {
      const pairInfo = pairInfos[i];
      const supply = supplyData[i];
      const reserves = reservesData[i];
      const masterChefBalance = hiveBalances[i];
      const fields = apyComputed.find(
        (e) => e.point.toLowerCase() === pool.hive.toLowerCase()
      ).fields;

      let baseAPY, rewardAPY;

      const grizzlyAPYHive = fields.find((f) => f.field == 'Grizzly-APY');
      if (grizzlyAPYHive != null) {
        rewardAPY = grizzlyAPYHive.value;
        baseAPY = fields.find((f) => f.field == 'LP-APR').value;
      } else {
        const farmApr = fields.find((f) => f.field == 'LP-APR');
        if (farmApr != null) {
          rewardAPY = fields.find((f) => f.field == 'Base-APR').value;
          baseAPY = farmApr.value;
        } else {
          const yearnHiveAPY = fields.find((f) => f.field == 'APY');
          if (yearnHiveAPY != null) {
            baseAPY = yearnHiveAPY.value;
            rewardAPY = 0;
          }
        }
      }

      const masterChefReservesUsd = calculateReservesUSD(
        reserves,
        masterChefBalance / supply,
        pairInfo.token0,
        pairInfo.token1,
        tokensPrices
      )
        .div(1e18)
        .toString();

      return {
        pool: pool.hive,
        poolMeta: pool.name,
        chain: utils.formatChain('binance'),
        project: 'grizzly-trade',
        symbol: pairInfo.pairName,
        tvlUsd: Number(masterChefReservesUsd),
        apyBase: Number(baseAPY) * 100,
        apyReward: Number(rewardAPY) * 100,
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
