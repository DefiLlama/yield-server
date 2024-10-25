const { Web3 } = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const { gammaFarmAbi, lpTokenABI, gammaReservoirAbi } = require('./abis');
const utils = require('../utils');
const { fetchURL } = require('../../helper/utils');

const RPC_URL = 'https://bsc-dataseed1.binance.org/';
const API_URL = sdk.graph.modifyEndpoint(
  '6VnGdhHKmys4uJ8Dnb4ow9eg794kqnE8v35Gmwrjo1iW'
);
const LP_APRS = 'https://api.planet.finance/v2/markets/getpoolsinfo';
const GAMMA_FARM_ADDRESS = '0x9EBce8B8d535247b2a0dfC0494Bc8aeEd7640cF9';
const GAMMA = '0xb3Cb6d2f8f2FDe203a022201C81a96c167607F15';
const GAMMA_RESERVOIR_ADDRESS = '0x7cF0E175908Fc6D7f51CE793271D5c0BD674660F';

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

const farmv2driprate = async () => {
  const reservoir_inst = await new web3.eth.Contract(
    gammaReservoirAbi,
    GAMMA_RESERVOIR_ADDRESS
  );
  const farmv2dripR = await reservoir_inst.methods.farmV2DripRate().call();
  return farmv2dripR;
};

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
  gammaPrice,
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
  if (token0.includes('Gamma')) return reserve0.times(gammaPrice).times(2);
  if (token0.includes('ETH')) return reserve0.times(ethPrice).times(2);
  if (token1.includes('USD')) return reserve1.times(2);
  if (token1.includes('BNB')) return reserve1.times(bnbPrice).times(2);
  if (token1.includes('Gamma')) return reserve1.times(gammaPrice).times(2);
  if (token1.includes('ETH')) return reserve1.times(ethPrice).times(2);
  return reserve0.times(2);
};

const getBaseTokensPrice = async () => {
  const priceKeys = ['green-planet', 'ethereum', 'binancecoin']
    .map((t) => `coingecko:${t}`)
    .join(',');
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  const gammaPrice = prices['coingecko:green-planet'].price;
  const ethPrice = prices['coingecko:ethereum'].price;
  const bnbPrice = prices['coingecko:binancecoin'].price;

  return { gammaPrice, ethPrice, bnbPrice };
};

const main = async () => {
  const { gammaPrice, ethPrice, bnbPrice } = await getBaseTokensPrice();
  const gammaFarmInst = new web3.eth.Contract(gammaFarmAbi, GAMMA_FARM_ADDRESS);
  const { data: lpAprs } = await fetchURL(LP_APRS);
  const aprsObj = {};
  for (const key of Object.keys(lpAprs)) {
    if (
      lpAprs[key].farmAddress.toLowerCase() == GAMMA_FARM_ADDRESS.toLowerCase()
    ) {
      aprsObj[lpAprs[key].wantAddress.toLowerCase()] = {
        baseApy: lpAprs[key].tradeFeeApy ? lpAprs[key].tradeFeeApy : 0,
        rewardApy: lpAprs[key].gammaApy,
      };
    }
  }
  const poolsCount = await gammaFarmInst.methods.poolLength().call();
  const totalAllocPoint = await gammaFarmInst.methods.totalAllocPoint().call();
  const gammaRateToRegularFarm = await farmv2driprate();
  const normalizedGammaPerBlock = gammaRateToRegularFarm / 1e18;

  const [poolsRes] = await Promise.all(
    ['poolInfo'].map((method) =>
      sdk.api.abi.multiCall({
        abi: gammaFarmAbi.filter(({ name }) => name === method)[0],
        calls: [...Array(Number(poolsCount)).keys()].map((i) => ({
          target: GAMMA_FARM_ADDRESS,
          params: i,
        })),
        chain: 'bsc',
        permitFailure: true,
      })
    )
  );
  const poolsInfo = poolsRes.output.map((res) => res.output);

  const [reservesRes, supplyRes, gammaFarmBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: poolsInfo.map((poolInfo) => ({
          target: poolInfo.want,
          params: method === 'balanceOf' ? [poolInfo.strat] : null,
        })),
        chain: 'bsc',
        permitFailure: true,
      })
    )
  );

  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const gammaFarmBalData = gammaFarmBalancesRes.output.map((res) => res.output);

  const pools = await Promise.all(
    poolsInfo.map((pool, i) =>
      getPairInfo(poolsInfo[i].want).then(({ pair: pairInfo }) => {
        // the first two pools are inifinity vault, etc.
        if (i < 2) return;
        if (!pairInfo) return null;

        const poolInfo = poolsInfo[i];
        const reserves = reservesData[i];

        const supply = supplyData[i];
        const gammaFarmBalance = gammaFarmBalData[i];
        const reserveUSD = calculateReservesUSD(
          pairInfo.name,
          reserves,
          gammaFarmBalance / supply,
          bnbPrice,
          gammaPrice,
          ethPrice,
          pairInfo.token0.decimals,
          pairInfo.token1.decimals
        )
          .div(1e18)
          .toString();
        const apyReward = calculateApy(
          poolInfo,
          totalAllocPoint,
          normalizedGammaPerBlock,
          gammaPrice,
          reserveUSD
        );
        const pool = {
          pool: pairInfo.id,
          chain: utils.formatChain('binance'),
          project: 'blue-planet',
          symbol: pairInfo.name,
          tvlUsd: Number(reserveUSD),
          apyBase: aprsObj[pairInfo.id.toLowerCase()].baseApy,
          apyReward: aprsObj[pairInfo.id.toLowerCase()].rewardApy,
          rewardTokens:
            aprsObj[pairInfo.id.toLowerCase()].rewardApy > 0 ? [GAMMA] : [],
          underlyingTokens: [pairInfo.token0.id, pairInfo.token1.id],
        };
        return pool;
      })
    )
  );
  return pools.filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.planet.finance/pools',
};
