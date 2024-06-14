const { Web3 } = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const { podMasterABI, lpTokenABI } = require('./abis');
const utils = require('../utils');
const { fetchURL } = require('../../helper/utils');

const RPC_URL = 'https://bsc-dataseed1.binance.org/';
const API_URL = sdk.graph.modifyEndpoint(
  'HtdMsZ5CvuaEntqZQybWg5Tw55Kx3FRrius6p7Jhc2XX'
);
const BACKEND_URL = 'https://api.whaleswap.finance';
const PODMASTER_ADDRESS = '0xdEe627eaaB378ec57ECfB94b389B718ef3687c0D';

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

const priceQuery = gql`
  query tokenQuery($id: ID!) {
    token(id: $id) {
      derivedUSD
    }
  }
`;

const getPairInfo = (pair) => {
  const pairInfo = request(API_URL, pairQuery, { id: pair.toLowerCase() });

  return pairInfo;
};

const getApy = async (chainId, pid) => {
  const apyResult = await fetchURL(
    `${BACKEND_URL}/${chainId}/whaleswap/apr/${pid}`
  );
  return apyResult.data;
};

const calculateReservesUSD = (
  pairName,
  reserves,
  reservesRatio,
  bnbPrice,
  podPrice,
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
  if (token0.includes('POD')) return reserve0.times(podPrice).times(2);
  if (token0.includes('ETH')) return reserve0.times(ethPrice).times(2);
  if (token1.includes('USD')) return reserve1.times(2);
  if (token1.includes('BNB')) return reserve1.times(bnbPrice).times(2);
  if (token1.includes('POD')) return reserve1.times(podPrice).times(2);
  if (token1.includes('ETH')) return reserve1.times(ethPrice).times(2);
};

const getBaseTokensPrice = async () => {
  const tokens = ['binancecoin', 'ethereum']
    .map((t) => `coingecko:${t}`)
    .join(',');
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${tokens}`
  );

  const podPriceResult = await request(API_URL, priceQuery, {
    id: '0xdded222297b3d08dafdac8f65eeb799b2674c78f',
  });

  const podPrice = podPriceResult.token.derivedUSD;
  const ethPrice = prices['coingecko:ethereum'].price;
  const bnbPrice = prices['coingecko:binancecoin'].price;

  return { podPrice, ethPrice, bnbPrice };
};

const main = async () => {
  const { podPrice, ethPrice, bnbPrice } = await getBaseTokensPrice();
  const podMaster = new web3.eth.Contract(podMasterABI, PODMASTER_ADDRESS);

  const poolsCount = await podMaster.methods.poolLength().call();

  const [poolsRes, lpTokensRes] = await Promise.all(
    ['poolInfo', 'lpToken'].map((method) =>
      sdk.api.abi.multiCall({
        abi: podMasterABI.filter(({ name }) => name === method)[0],
        calls: [...Array(Number(poolsCount - 1)).keys()].map((i) => ({
          target: PODMASTER_ADDRESS,
          params: i,
        })),
        chain: 'bsc',
      })
    )
  );
  const poolsInfo = poolsRes.output.map((res) => res.output);
  const lpTokens = lpTokensRes.output.map((res) => res.output);

  const [reservesRes, supplyRes, podMasterBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [PODMASTER_ADDRESS] : null,
        })),
        chain: 'bsc',
      })
    )
  );
  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const podMasterBalData = podMasterBalancesRes.output.map((res) => res.output);

  const pools = await Promise.all(
    poolsInfo.map(async (_, i) => {
      // the early pools are deprecated or the staking pool (pid 0)
      if (i < 45) return;
      const apy = await getApy(56, i);
      return getPairInfo(lpTokens[i]).then(({ pair: pairInfo }) => {
        const reserves = reservesData[i];

        const supply = supplyData[i];
        const podMasterBalance = podMasterBalData[i];

        const reserveUSD = calculateReservesUSD(
          pairInfo.name,
          reserves,
          podMasterBalance / supply,
          bnbPrice,
          podPrice,
          ethPrice,
          pairInfo.token0.decimals,
          pairInfo.token1.decimals
        )
          .div(1e18)
          .toString();

        const pool = {
          pool: pairInfo.id,
          chain: utils.formatChain('binance'),
          project: 'whaleswap',
          symbol: pairInfo.name,
          tvlUsd: Number(reserveUSD),
          apyBase: apy.swapFeeApr,
          apyReward: apy.stakingApr,
          rewardTokens: ['0xDDed222297B3d08DAFDAc8f65eeB799B2674C78F'],
          underlyingTokens: [pairInfo.token0.id, pairInfo.token1.id],
        };
        return pool;
      });
    })
  );

  // rmv null elements
  return pools.filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://whaleswap.finance/farm?chain=bsc_mainnet',
};
