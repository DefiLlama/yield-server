const { Web3 } = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const { masterChefABI, lpTokenABI, stakeABI, oracleAbi } = require('./abis');
const utils = require('../utils');
const { fetchURL } = require('../../helper/utils');

const RPC_URL = 'https://rpc.ftm.tools/';
const API_URL = 'https://api.fura.org/subgraphs/name/spookyswap';

const MASTERCHEF_ADDRESS = '0xFdAa392FCF8946e8e658B9f36ffbE6659cB40edf';
const STAKING_ADDRESS = '0x1b6deD5c603d66800B0DDf566Ec316a344C7BcaD';
const ZSP_ADDRESS = '0x2C26617034C840C9412CD67aE0Fc68A6755D00BF';
const WFTM_ADDRESS = '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83';
const ORACLE_ADDRESS = '0xb9Eebcd999130Ec2037DcAC98bd36185bB22D797';
const WETH_ADDRESS = '0x74b23882a30290451A17c44f4F05243b6b58C76d';

const BLOCKS_PER_DAY = 86400;

const web3 = new Web3(RPC_URL);

const pairQuery = gql`
  query pairQuery($id: ID!) {
    pair(id: $id) {
      name
      id
      token0 {
        decimals
      }
      token1 {
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
  zspPerBlock,
  zspPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint;

  return (
    ((poolWeight * BLOCKS_PER_DAY * zspPerBlock * zspPrice) / reserveUSD) *
    100 *
    365
  );
};

const calculateReservesUSD = (
  pairName,
  reserves,
  reservesRatio,
  ftmPrice,
  zspPrice,
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

  if (token0.includes('USDC')) return reserve0.times(2);
  if (token0.includes('FTM')) return reserve0.times(ftmPrice).times(2);
  if (token0.includes('ZSP')) return reserve0.times(zspPrice).times(2);
  if (token0.includes('ETH')) return reserve0.times(ethPrice).times(2);
  if (token1.includes('USDC')) return reserve1.times(2);
  if (token1.includes('FTM')) return reserve1.times(ftmPrice).times(2);
  if (token1.includes('ZSP')) return reserve1.times(zspPrice).times(2);
  if (token1.includes('ETH')) return reserve1.times(ethPrice).times(2);
};

const getBaseTokensPrice = async () => {
  const prices = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=zest-synthetic-protocol%2Cfantom%2Cethereum&vs_currencies=usd'
  );

  const zspPrice = prices['zest-synthetic-protocol'].usd;
  const ethPrice = prices.ethereum.usd;
  const ftmPrice = prices.fantom.usd;

  return { zspPrice, ethPrice, ftmPrice };
};

const main = async () => {
  const { ethPrice, ftmPrice } = await getBaseTokensPrice();
  const masterChef = new web3.eth.Contract(masterChefABI, MASTERCHEF_ADDRESS);
  const staking = new web3.eth.Contract(stakeABI, STAKING_ADDRESS);
  //Farms
  const poolsCount = await masterChef.methods.poolLength().call();
  const totalAllocPoint = await masterChef.methods.totalAllocPoint().call();
  const rewardRate = await masterChef.methods.rewardPerSecond().call();
  const normalizedRewardPerBlock = rewardRate / 1e18;
  //ZSP Price from Oracle
  const oracle = new web3.eth.Contract(oracleAbi, ORACLE_ADDRESS);
  const zspFtmPrice = await oracle.methods.getYTokenPrice().call();
  const zspPrice = (zspFtmPrice / 1e18) * ftmPrice;
  const zspPriceFtm = zspFtmPrice / 1e18;
  //Staking
  const rewardRateFtm = await staking.methods.rewardData(WFTM_ADDRESS).call();
  const normalisedRewardRateFtm = rewardRateFtm.rewardRate / 1e18;
  const rewardRateZsp = await staking.methods.rewardData(ZSP_ADDRESS).call();
  const normalisedRewardRateZsp = rewardRateZsp.rewardRate / 1e18;
  const rewardRateEth = await staking.methods.rewardData(WETH_ADDRESS).call();
  const normalisedRewardRateEth = rewardRateEth.rewardRate / 1e18;
  const totalLocked = await staking.methods.lockedSupply().call();
  const normalisedTotalLocked = totalLocked / 1e18;
  const totalSupply = await staking.methods.totalSupply().call();
  const normalisedTotalSupply = totalSupply / 1e18;
  const stakedSupply = normalisedTotalSupply - normalisedTotalLocked;

  const stakeRewardPerYear = normalisedRewardRateFtm * BLOCKS_PER_DAY * 365;
  const stakeRewardsEthPerYear = normalisedRewardRateEth * BLOCKS_PER_DAY * 365;
  const stakeRewardsFtm = stakeRewardPerYear / normalisedTotalSupply;
  const stakeRewardsEth = stakeRewardsEthPerYear / normalisedTotalSupply;

  const stakeAPR = ((stakeRewardsFtm + stakeRewardsEth) / zspPriceFtm) * 100;
  const stakeTVL = stakedSupply * zspPrice;

  const lockRewardsPerYear = normalisedRewardRateZsp * BLOCKS_PER_DAY * 365;
  const lockRewards = lockRewardsPerYear / normalisedTotalLocked;
  const lockAPR = lockRewards * 100 + stakeAPR;
  const lockTVL = normalisedTotalLocked * zspPrice;

  const chain = 'fantom';

  const [poolsRes, lpTokensRes] = await Promise.all(
    ['poolInfo', 'lpToken'].map((method) =>
      sdk.api.abi.multiCall({
        abi: masterChefABI.filter(({ name }) => name === method)[0],
        calls: [...Array(Number(poolsCount)).keys()].map((i) => ({
          target: MASTERCHEF_ADDRESS,
          params: i,
        })),
        chain,
      })
    )
  );
  const poolsInfo = poolsRes.output.map((res) => res.output);
  const lpTokens = lpTokensRes.output.map((res) => res.output);

  const [
    reservesRes,
    supplyRes,
    masterChefBalancesRes,
    underlyingToken0,
    underlyingToken1,
  ] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf', 'token0', 'token1'].map(
      (method) =>
        sdk.api.abi.multiCall({
          abi: lpTokenABI.filter(({ name }) => name === method)[0],
          calls: lpTokens.map((address) => ({
            target: address,
            params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
          })),
          chain,
        })
    )
  );
  const underlyingToken0Data = underlyingToken0.output.map((res) => res.output);
  const underlyingToken1Data = underlyingToken1.output.map((res) => res.output);
  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const masterChefBalData = masterChefBalancesRes.output.map(
    (res) => res.output
  );

  let pools = await Promise.all(
    poolsInfo.map((pool, i) =>
      getPairInfo(lpTokens[i]).then(({ pair: pairInfo }) => {
        const poolInfo = poolsInfo[i];
        const reserves = reservesData[i];
        const underlying0 = underlyingToken0Data[i];
        const underlying1 = underlyingToken1Data[i];

        const supply = supplyData[i];
        const masterChefBalance = masterChefBalData[i];

        const reserveUSD = calculateReservesUSD(
          pairInfo.name,
          reserves,
          masterChefBalance / supply,
          ftmPrice,
          zspPrice,
          ethPrice,
          pairInfo.token0.decimals,
          pairInfo.token1.decimals
        )
          .div(1e18)
          .toString();
        const pool = {
          pool: `${pairInfo.id}-${chain}`.toLowerCase(),
          chain: utils.formatChain(chain),
          project: 'zest-protocol',
          symbol: pairInfo.name.replace(/(WFTM)+/g, 'FTM'),
          tvlUsd: Number(reserveUSD),
          apyReward: calculateApy(
            poolInfo,
            totalAllocPoint,
            normalizedRewardPerBlock,
            zspPrice,
            reserveUSD
          ),
          rewardTokens: ['0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83'],
          underlyingTokens: [underlying0, underlying1],
        };
        return pool;
      })
    )
  );

  const stakeZsp = {
    pool: `${ZSP_ADDRESS}-staking-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: 'zest-protocol',
    symbol: 'ZSP Staked',
    tvlUsd: Number(stakeTVL),
    apyReward: Number(stakeAPR),
    rewardTokens: [WFTM_ADDRESS],
  };

  const lockZsp = {
    pool: `${ZSP_ADDRESS}-locking-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: 'zest-protocol',
    symbol: 'ZSP Locked',
    tvlUsd: Number(lockTVL),
    apyReward: Number(lockAPR),
    rewardTokens: [WFTM_ADDRESS, ZSP_ADDRESS],
  };

  pools = [...pools, stakeZsp, lockZsp];

  return pools.filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://zestprotocol.fi/dashboard',
};
