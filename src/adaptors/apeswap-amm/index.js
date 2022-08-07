const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');

const masterChefABI = require('./abis/abi-master-chef.json');
const lpTokenABI = require('./abis/abi-lp-token.json');
const utils = require('../utils');

const MASTERCHEF_ADDRESS = '0x5c8D727b265DBAfaba67E050f2f739cAeEB4A6F9';
const BANANA = '0x603c7f932ED1fc6575303D8Fb018fDCBb0f39a95';
const EXCLUDE = [
  '0x344a9C3a0961DA3Cd78A8f5A62Bd04A0358178be',
  '0x603c7f932ED1fc6575303D8Fb018fDCBb0f39a95',
  '0xA5818a82016cb07D0D9892736A2Abd1B47E78ea4',
  '0xeCabfEd917852D5951CAE753985aE23bd0489d3D',
  '0x8A49764C91718eF2b6264E54e1b6497CcC945D49',
  '0x703b40842eF1A81777e7696e37c335d32D094a80',
];
const BSC_BLOCK_TIME = 3;
const BLOCKS_PER_YEAR = Math.floor((60 / BSC_BLOCK_TIME) * 60 * 24 * 365);


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
      })
    )
  );
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

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  bananaPerBlock,
  bananaPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const vvsPerYear = BLOCKS_PER_YEAR * bananaPerBlock;
  return ((poolWeight * vvsPerYear * bananaPrice) / reserveUSD) * 100;
};

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

const apy = async () => {
  const poolLength = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'bsc',
    abi: masterChefABI.find(e => e.name === 'poolLength')
  });
  const totalAllocPoint = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'bsc',
    abi: masterChefABI.find(e => e.name === 'totalAllocPoint')
  });
  const bananaPerBlock = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'bsc',
    abi: masterChefABI.find(e => e.name === 'cakePerBlock')
  });
  const normalizedbananaPerBlock = bananaPerBlock.output/1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'bsc',
    requery: true,
  });

  const pools = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter(e => e.allocPoint !== '0')
    .filter(e => !EXCLUDE.includes(e.lpToken))
  const lpTokens = pools.map(({ lpToken }) => lpToken);

  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
        })),
        chain: 'bsc',
        requery: true,
      })
    )
  );

  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
        })),
        chain: 'bsc',
        requery: true,
      })
    )
  );

  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const masterChefBalData = masterChefBalancesRes.output.map(
    (res, i) => res.output
  );
  const tokens0 = underlyingToken0.output.map((res) => res.output);
  const tokens1 = underlyingToken1.output.map((res) => res.output);
  const tokensPrices = await getPrices([...tokens0, ...tokens1]);
  const result = await Promise.all(
    pools.map((pool, i) =>
      getPairInfo(lpTokens[i], [tokens0[i], tokens1[i]]).then((pairInfo) => {

        const poolInfo = pools[i];
        const reserves = reservesData[i];

        const supply = supplyData[i];
        const masterChefBalance = masterChefBalData[i];

        const masterChefReservesUsd = calculateReservesUSD(
          reserves,
          masterChefBalance / supply,
          pairInfo.token0,
          pairInfo.token1,
          tokensPrices
        )
          .div(1e18)
          .toString();

        const _pool = {
          pool: pairInfo.lpToken,
          chain: utils.formatChain('binance'),
          project: 'apeswap-amm',
          symbol: pairInfo.pairName,
          tvlUsd: Number(masterChefReservesUsd),
          apy: calculateApy(
            poolInfo,
            totalAllocPoint,
            normalizedbananaPerBlock,
            tokensPrices[BANANA.toLowerCase()],
            masterChefReservesUsd
          ),
        };
        return _pool;
      })
    )
  );
  return result;
}
module.exports = {
  timetravel: false,
  apy,
};
