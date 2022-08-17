const Web3 = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const { masterChefABI, lpTokenABI } = require('./abis');
const utils = require('../utils');
const { fetchURL } = require('../../helper/utils');

const RPC_URL = 'https://bsc-dataseed1.binance.org/';
const API_URL =
  'https://bsc.streamingfast.io/subgraphs/name/pancakeswap/exchange-v2';
const LP_APRS =
  'https://raw.githubusercontent.com/pancakeswap/pancake-frontend/develop/src/config/constants/lpAprs.json';
const MASTERCHEF_ADDRESS = '0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652';
const CAKE = '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82';

const BSC_BLOCK_TIME = 3;
const BLOCKS_PER_YEAR = (60 / BSC_BLOCK_TIME) * 60 * 24 * 365;

const web3 = new Web3(RPC_URL);

const pairQuery = gql`
  query pairQuery($id: ID!) {
    pair(id: $id) {
      name
      id
      token0 {
        id
        decimals
      }
      token1 {
        id
        decimals
      }
    }
  }
`;

const getPairInfo = (pair) => {
  const pairInfo = request(API_URL, pairQuery, { id: pair.toLowerCase() });

  return pairInfo;
};

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  cakePerBlock,
  cakePrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint;
  const cakePerYear = BLOCKS_PER_YEAR * cakePerBlock;

  return ((poolWeight * cakePerYear * cakePrice) / reserveUSD) * 100;
};

const calculateReservesUSD = (
  pairName,
  reserves,
  reservesRatio,
  bnbPrice,
  cakePrice,
  ethPrice,
  token0decimals,
  token1decimals
) => {
  const [token0, token1] = pairName.split('-');
  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - token0decimals));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - token1decimals));

  if (token0.includes('USD')) return reserve0.times(2);
  if (token0.includes('BNB')) return reserve0.times(bnbPrice).times(2);
  if (token0.includes('Cake')) return reserve0.times(cakePrice).times(2);
  if (token0.includes('ETH')) return reserve0.times(ethPrice).times(2);
  if (token1.includes('USD')) return reserve1.times(2);
  if (token1.includes('BNB')) return reserve1.times(bnbPrice).times(2);
  if (token1.includes('Cake')) return reserve1.times(cakePrice).times(2);
  if (token1.includes('ETH')) return reserve1.times(ethPrice).times(2);
};

const getBaseTokensPrice = async () => {
  const prices = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=pancakeswap-token%2Cbinancecoin%2Cethereum&vs_currencies=usd'
  );

  const cakePrice = prices['pancakeswap-token'].usd;
  const ethPrice = prices.ethereum.usd;
  const bnbPrice = prices.binancecoin.usd;

  return { cakePrice, ethPrice, bnbPrice };
};

const main = async () => {
  const { cakePrice, ethPrice, bnbPrice } = await getBaseTokensPrice();
  const masterChef = new web3.eth.Contract(masterChefABI, MASTERCHEF_ADDRESS);
  const { data: lpAprs } = await fetchURL(LP_APRS);

  const poolsCount = await masterChef.methods.poolLength().call();
  const totalAllocPoint = await masterChef.methods
    .totalRegularAllocPoint()
    .call();
  const cakeRateToRegularFarm = await masterChef.methods
    .cakePerBlock(true)
    .call();
  const normalizedCakePerBlock = cakeRateToRegularFarm / 1e18;

  const [poolsRes, lpTokensRes] = await Promise.all(
    ['poolInfo', 'lpToken'].map((method) =>
      sdk.api.abi.multiCall({
        abi: masterChefABI.filter(({ name }) => name === method)[0],
        calls: [...Array(Number(poolsCount - 1)).keys()].map((i) => ({
          target: MASTERCHEF_ADDRESS,
          params: i,
        })),
        chain: 'bsc',
      })
    )
  );
  const poolsInfo = poolsRes.output.map((res) => res.output);
  const lpTokens = lpTokensRes.output.map((res) => res.output);

  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
        })),
        chain: 'bsc',
      })
    )
  );
  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const masterChefBalData = masterChefBalancesRes.output.map(
    (res) => res.output
  );

  const pools = await Promise.all(
    poolsInfo.map((pool, i) =>
      getPairInfo(lpTokens[i]).then(({ pair: pairInfo }) => {
        // the first two pools are for lotteries, etc.
        if (i < 2) return;

        const poolInfo = poolsInfo[i];
        const reserves = reservesData[i];

        const supply = supplyData[i];
        const masterChefBalance = masterChefBalData[i];

        const reserveUSD = calculateReservesUSD(
          pairInfo.name,
          reserves,
          masterChefBalance / supply,
          bnbPrice,
          cakePrice,
          ethPrice,
          pairInfo.token0.decimals,
          pairInfo.token1.decimals
        )
          .div(1e18)
          .toString();
        const apyReward = calculateApy(
          poolInfo,
          totalAllocPoint,
          normalizedCakePerBlock,
          cakePrice,
          reserveUSD
        );
        const pool = {
          pool: pairInfo.id,
          chain: utils.formatChain('binance'),
          project: 'pancakeswap',
          symbol: pairInfo.name,
          tvlUsd: Number(reserveUSD),
          apyBase: lpAprs[pairInfo.id.toLowerCase()],
          apyReward,
          rewardTokens: apyReward > 0 ? [CAKE] : [],
          underlyingTokens: [pairInfo.token0.id, pairInfo.token1.id],
        };
        return pool;
      })
    )
  );

  // rmv null elements
  return pools.filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://pancakeswap.finance/farms',
};
