const JSBI = require('jsbi');
const {
  CurrencyAmount,
  Percent,
  Token,
  TradeType,
} = require('@uniswap/sdk-core');
const { AlphaRouter } = require('@uniswap/smart-order-router');
const { default: BigNumber } = require('bignumber.js');
const { JsonRpcProvider } = require('@ethersproject/providers');
const StakingABI = require('./staking_abi.json');
const BrcABI = require('./brc_abi.json');
const utils = require('../utils');
const Web3 = require('web3');
const jsonRpcProvider = new JsonRpcProvider(
  process.env.ALCHEMY_CONNECTION_ARBITRUM
);
const web3 = new Web3(process.env.ALCHEMY_CONNECTION_ARBITRUM);

const STAKING_CONTRACT = '0x9A28f7Ab9aEb4f14Fc4c580938F8F5E89ce98084';
const BRC = '0xB5de3f06aF62D8428a8BF7b4400Ea42aD2E0bc53';
const GBRC = '0x62C7e128e7c3205964429F58A0C6f63a776D10d1';
const ChainId = 42161;

const stakingContract = new web3.eth.Contract(StakingABI, STAKING_CONTRACT);
const brcContract = new web3.eth.Contract(BrcABI, BRC);
const BLOCKS_PER_MONTH = 199384;
const TOTAL_POOLS_WEIGHT = 568;
const PoolNames = [
  'BRC 7Days',
  'BRC 30Days',
  'BRC 90Days',
  'BRC-gBRC 7Days',
  'BRC-gBRC 30Days',
  'BRC-gBRC 90Days',
];

let gBRCCost = 0;
let daiCost = 0;
let govBrincPerWeek = 0;
let stakingBRCSupply = 0;
let stakingRatio = 0;

const getPoolWeight = (stakePool) => {
  switch (stakePool) {
    case 0:
      return 3;
    case 1:
      return 5;
    case 2:
      return 10;
    case 3:
      return 10;
    case 4:
      return 40;
    case 5:
      return 500;
    default:
      return 0;
  }
};

const getPoolTVL = async (stakePool, brcSupply, gbrcSupply) => {
  let totalPrice = await getBRCPrice(brcSupply);
  if (stakePool >= 3) {
    // brcSupply is used here because current version of staking contract
    // has had its ratio increased from 1BRC:1gBRC(old) to 1BRC:100gBRC(current)
    // TVL of dual staking pools is thus apparently higher than set here
    // but this is set as a lower boundary
    totalPrice = Number(totalPrice) + (await getGBRCPrice(brcSupply));
  }
  return totalPrice;
};

const getBRCPrice = async (amount) => {
  const brcPrice = await brcContract.methods
    .mintCost(new BigNumber(amount).toFixed())
    .call();
  return brcPrice / 1e18;
};

const getGBRCPriceFromBRC = async (amount) => {
  try {
    const token = new Token(ChainId, BRC, 18, 'BRC', 'Brinc Token');
    const toToken = new Token(ChainId, GBRC, 18, 'gBRC', 'Governance Token');

    const swapOptions = {
      recipient: '0xa1B94ef0f24d7F4fd02285EFcb9202E6C6EC655B',
      slippageTolerance: new Percent(5, 100),
      deadline: Math.floor(Date.now() / 1000 + 1800),
    };

    const currencyAmount = CurrencyAmount.fromRawAmount(
      token,
      JSBI.BigInt(amount)
    );
    const router = new AlphaRouter({
      chainId: ChainId,
      provider: jsonRpcProvider,
    });

    return router
      .route(currencyAmount, toToken, TradeType.EXACT_INPUT, swapOptions)
      .then((res) => {
        if (res) {
          return res.quote.toFixed(toToken.decimals);
        } else {
          return 0;
        }
      })
      .catch((err) => {
        console.log('cost quote brc->gbrc error', err);
        return '0';
      });
  } catch (error) {
    console.log('getGBRCPriceFromBRC', error);
  }
};

const getGBRCPrice = async (amount) => {
  try {
    return (Number(daiCost) / Number(gBRCCost)) * (amount / 1e18);
  } catch (error) {
    console.log('Failed to getGBRCPrice \n Error => ', error);
    return new BigNumber(0);
  }
};

const loadEssentials = async () => {
  // load prices
  daiCost = await getBRCPrice((1e18).toString());
  gBRCCost = await getGBRCPriceFromBRC((1e18).toString());

  // load how much rewards are distributed per week
  const govBrincPerBlock = await stakingContract.methods
    .getGovBrincPerBlock()
    .call();
  const govBrincPerMonth = new BigNumber(+govBrincPerBlock).times(
    BLOCKS_PER_MONTH
  );
  govBrincPerWeek = new BigNumber(govBrincPerMonth.toString()).div(4);

  // load total BRC held by staking contract
  stakingBRCSupply = await brcContract.methods
    .balanceOf(STAKING_CONTRACT)
    .call();

  // load BRC-gBRC staking ratio
  stakingRatio = await stakingContract.methods.getRatioBtoG().call();
};

const getPoolData = async (pool) => {
  const totalRewards = new BigNumber(govBrincPerWeek)
    .times(getPoolWeight(pool))
    .div(TOTAL_POOLS_WEIGHT);

  const _brcStake = await stakingContract.methods.getPoolSupply(pool).call();
  const brcStake = new BigNumber(_brcStake.toString());
  const gbrcStaked = new BigNumber(+stakingRatio).div(1e10).times(+brcStake);

  const calApr = new BigNumber(totalRewards.toString())
    .div(brcStake)
    .times(brcStake)
    .div(new BigNumber(stakingBRCSupply.toString()));
  return {
    apr: calApr,
    brcStaked: brcStake,
    gbrcStaked: pool < 3 ? 0 : gbrcStaked,
  };
};

const getAPYAndSupply = async (pool) => {
  const { apr, brcStaked, gbrcStaked } = await getPoolData(pool);
  switch (pool) {
    case 0:
      return {
        apy: new BigNumber(1)
          .plus(new BigNumber(apr).times(1))
          .pow(52)
          .minus(1)
          .times(100),
        brcStaked,
        gbrcStaked,
      };
    case 1:
      return {
        apy: new BigNumber(1)
          .plus(new BigNumber(apr).times(4))
          .pow(12)
          .minus(1)
          .times(100),
        brcStaked,
        gbrcStaked,
      };
    case 2:
      return {
        apy: new BigNumber(1)
          .plus(new BigNumber(apr).times(12))
          .pow(4)
          .minus(1)
          .times(100),
        brcStaked,
        gbrcStaked,
      };
    case 3:
      return {
        apy: new BigNumber(1)
          .plus(new BigNumber(apr).times(1))
          .pow(52)
          .minus(1)
          .times(100),
        brcStaked,
        gbrcStaked,
      };
    case 4:
      return {
        apy: new BigNumber(1)
          .plus(new BigNumber(apr).times(4))
          .pow(12)
          .minus(1)
          .times(100),
        brcStaked,
        gbrcStaked,
      };
    case 5:
      return {
        apy: new BigNumber(1)
          .plus(new BigNumber(apr).times(12))
          .pow(4)
          .minus(1)
          .times(100),
        brcStaked,
        gbrcStaked,
      };
    default:
      return {
        apy: 0,
        brcStaked: 0,
        gbrcStaked: 0,
      };
  }
};

const getPools = async () => {
  let apys = [];

  for (let stakePool = 0; stakePool < 6; stakePool++) {
    const { apy, brcStaked, gbrcStaked } = await getAPYAndSupply(stakePool);
    apys.push({
      tvl: await getPoolTVL(stakePool, brcStaked, gbrcStaked),
      apy: apy.toString(),
      symbol: PoolNames[stakePool],
      poolId: 'pool' + stakePool,
    });
  }
  return apys;
};

const buildPool = (entry) => {
  const newObj = {
    pool: entry.poolId + '-brinc-finance-staking',
    chain: 'Arbitrum', // chain where the pool is
    project: 'brinc-finance', // protocol (using the slug again)
    symbol: entry.symbol.split(' ')[0],
    poolMeta: entry.symbol.split(' ')[1],
    tvlUsd: parseInt(entry.tvl, 10), // number representing current USD TVL in pool
    apy: parseFloat(entry.apy),
    rewardTokens: [GBRC], // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
    underlyingTokens: [BRC, GBRC], // Array of underlying token addresses from a pool,
  };
  return newObj;
};

async function main() {
  return loadEssentials().then((_) => {
    return getPools().then((pools) => {
      const data = pools.map((pool) => buildPool(pool));
      return data;
    });
  });
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.brinc.fi/stake',
};
