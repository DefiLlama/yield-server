const axios = require('axios');
const BigNumber = require('bignumber.js');

const statsUrl = 'https://api.stats.ref.finance/';

const WBTC_TOKEN_ID =
  '2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near';
const ETH_TOKEN_ID = 'aurora';
const PEM_TOKEN = 'token.pembrock.near';

interface Volume {
  pool_id: string;
  dateString: string;
  fiat_volume: string;
  asset_volume: string;
  volume_dollar: string;
}

interface PoolInfo {
  amounts: string[];
  amp: number;
  farming: boolean;
  id: string;
  pool_kind: string;
  shares_total_supply: string;
  token0_ref_price: string;
  token_account_ids: string[];
  token_symbols: string[];
  total_fee: number;
  tvl: string;
}

interface FarmInfo {
  has_ref_farm: boolean;
  fee: number;
  kill_factor: number;
  max_leverage: number;
  ref_pool_id: number;
  shares: string;
  token1_id: string;
  token2_id: string;
  value: string;

  seedId?: string;
  seedInfo?: object;
  token1?: TokenInfo;
  token2?: TokenInfo;
  t1meta?: TokenMetadata;
  t2meta?: TokenMetadata;
  listFarmsBySeed?: [];
  pool?: PoolInfo;
  volume?: Volume[];
  tvl?: object;
  tokensPriceList?: object[];
}

interface TokenMetadata {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  icon: string;
  ref?: number | string;
  near?: number | string;
  total?: number;
  amountLabel?: string;
  amount?: number;
  nearNonVisible?: number | string;
  price?: string;
}

interface TokenInfo {
  account_balance: string;
  total_supply: string;
  total_borrowed: string;
  lend_shares: string;
  debt_shares: string;
  debt_rate?: string;
  debt_apy?: string; // APR (not APY !!!)
  lend_apy?: string; // APR (not APY !!!)
  borrowable: string;
  last_accrue_time: string;
  lend_reward_rate_per_week: string;
  debt_reward_rate_per_week: string;
}

interface TokenWithMetadata extends TokenInfo {
  id: string;
  metadata: TokenMetadata;
  refPrice?: string;
}

async function commonCall(url, method, args = {}) {
  const result = await axios({
    method: 'get',
    url: url + method,
    params: args,
  });
  if (result.data.error) {
    throw new Error(`${result.data.error.message}: ${result.data.error.data}`);
  }
  return result.data;
}

const apr2apy = (apr: BigNumber): BigNumber => {
  return apr.div(365).plus(1).pow(365).minus(1);
};

export interface TVL {
  pool_id: string;
  asset_amount: string;
  fiat_amount: string;
  asset_price: string;
  fiat_price: string;
  asset_tvl: string;
  fiat_tvl: string;
  date: string;
}

const getTvl = async (id: string): Promise<[TVL]> => {
  return commonCall(statsUrl, `api/pool/${id}/tvl`);
};

const getVolume = async (id: string): Promise<[Volume]> => {
  return commonCall(statsUrl, `api/pool/${id}/volume`);
};

const toReadableNumber = (decimals: number, number = '0'): string => {
  if (!decimals) return number;

  const wholeStr =
    number.substring(0, number.split('.')[0].length - decimals) || '0';

  const fractionStr = number
    .substring(number.split('.')[0].length - decimals)
    .padStart(decimals, '0')
    .substring(0, decimals);

  return `${wholeStr}.${fractionStr}`.replace(/\.?0+$/, '');
};

function formatWithCommas(value: string): string {
  const pattern = /(-?\d+)(\d{3})/;
  while (pattern.test(value)) {
    value = value.replace(pattern, '$1,$2');
  }
  return value;
}

const toPrecision = (
  number: string,
  precision: number,
  withCommas = false,
  atLeastOne = true
): string => {
  const [whole, decimal = ''] = number.split('.');

  let str = `${withCommas ? formatWithCommas(whole) : whole}.${decimal.slice(
    0,
    precision
  )}`.replace(/\.$/, '');
  if (atLeastOne && Number(str) === 0 && str.length > 1) {
    const n = str.lastIndexOf('0');
    str = str.slice(0, n) + str.slice(n).replace('0', '1');
  }

  return str;
};

interface FarmTableData {
  tvl?: string;
  apy: string;
  yieldFarming: string;
  tradingFees: string;
  dailyAPR: string;
  totalAPR: string;
  borrowInterest: string;
  rewardsAPR: string;
  rewardsRate: string;
}

interface LendTableData {
  lendAPY: string;
  lendRewardsAPR: string;
  totalLendAPY: string;
  totalSupply: string;
  totalBorrowed: string;
  utilization: string;
  balance: string;
  rewards: string;
}

const calcTradingFees = (farm: FarmInfo): BigNumber => {
  const { pool, volume, tvl } = farm;

  const sevenDaysSumVolume = Object.keys(volume).reduce((sum, item) => {
    return sum.plus(new BigNumber(volume[item]['volume_dollar']));
  }, new BigNumber(0));

  const sevenDaysSumTvl = Object.keys(tvl).reduce((sum, item) => {
    return sum.plus(
      new BigNumber(tvl[item]['asset_tvl']).plus(
        new BigNumber(tvl[item]['fiat_tvl'])
      )
    );
  }, new BigNumber(0));

  // Calc Trading Fees
  const tradingFees = !sevenDaysSumTvl.isZero()
    ? sevenDaysSumVolume
        .multipliedBy(365)
        .multipliedBy(pool ? pool['total_fee'] : 0)
        .multipliedBy(0.8) // 20% of total fee takes the exchange
        .dividedBy(sevenDaysSumTvl)
        .dividedBy(10000) // fee divisor
    : new BigNumber(0);

  return tradingFees;
};

const calcYieldFarming = (farm: FarmInfo): BigNumber => {
  const { listFarmsBySeed, seedInfo, pool, tokensPriceList } = farm;
  // console.log(listFarmsBySeed);
  // Calc Yield Farming
  const refTVL = pool && new BigNumber(pool['tvl']);
  const refSharesTotalSupply =
    pool && new BigNumber(pool['shares_total_supply']);
  let yieldFarming = new BigNumber(0);

  const stakedAmount = new BigNumber(
    seedInfo ? seedInfo['total_seed_amount'] : 0
  );
  const stakedTVL = stakedAmount
    .multipliedBy(refTVL)
    .dividedBy(refSharesTotalSupply);

  listFarmsBySeed?.forEach((el: object) => {
    const rewardTokenId = el['terms']['reward_token'];
    const rewardTokenPrice = tokensPriceList[rewardTokenId]['price'];
    const tokenDecimals = tokensPriceList[rewardTokenId]['decimal'];
    const rewardPerDay = el['terms']['daily_reward'];
    const farmApr = new BigNumber(365)
      .multipliedBy(rewardPerDay)
      .multipliedBy(rewardTokenPrice)
      .dividedBy(stakedTVL)
      .shiftedBy(-tokenDecimals);

    yieldFarming = yieldFarming.plus(farmApr);
  });

  return yieldFarming;
};

const calcLeveragedFarmData = (
  farm: FarmInfo,
  leverage: any,
  debtRate: BigNumber,
  token: TokenWithMetadata,
  pemToken: TokenWithMetadata
) => {
  const rewardsAPR = calcDebtRewardsAPR(token, pemToken?.refPrice);

  const _leverage = new BigNumber(leverage).multipliedBy(1000);

  let yieldFarming = calcYieldFarming(farm);
  let tradingFees = calcTradingFees(farm);

  const yieldFarmingLev = yieldFarming.multipliedBy(_leverage).dividedBy(1000);
  const tradingFeesLev = tradingFees.multipliedBy(_leverage).dividedBy(1000);

  let borrowInterestLev = _leverage
    .minus(1000)
    .negated()
    .multipliedBy(debtRate)
    .dividedBy(1000); // leverage divisor
  let rewardsAprLev = _leverage
    .minus(1000)
    .multipliedBy(rewardsAPR)
    .dividedBy(1000); // leverage divisor

  // Calc Total APR
  const totalApr = yieldFarmingLev.plus(tradingFeesLev).plus(borrowInterestLev);

  // Calc DailyAPR Apr
  const dailyAPR = totalApr.dividedBy(365);

  // Calc APY
  const totalApy = dailyAPR
    .plus(1)
    .pow(365)
    .minus(1)
    .plus(rewardsAprLev.isNaN() ? 0 : rewardsAprLev);

  let result = {
    yieldFarmingLev,
    tradingFeesLev,
    totalApr,
    totalApy,
    borrowInterestLev,
    rewardsAprLev,
  };

  return result;
};

function formatBigNumber(num: any, showDecimals: number = 2): string {
  const _num = new BigNumber(num);
  return _num.isNaN() ? '--' : _num.toFixed(showDecimals);
}

const calcFarmTVL = (
  farm: FarmInfo,
  tokens: TokenWithMetadata[]
): BigNumber => {
  const [token1_id, token2_id] = [farm.token1_id, farm.token2_id];
  const token1 = tokens.find((token) => token.id === token1_id);
  const token2 = tokens.find((token) => token.id === token2_id);

  // this condition if we don't have enough data
  const refPrice1 = token1?.refPrice || '0';
  const refPrice2 = token2?.refPrice || '0';
  const tokenDecimals1 = token1?.metadata?.decimals || 18;
  const tokenDecimals2 = token2?.metadata?.decimals || 18;

  const token1_value = new BigNumber(farm.value)
    .multipliedBy(farm.pool.amounts[0])
    .multipliedBy(refPrice1)
    .dividedBy(farm.pool.shares_total_supply)
    .shiftedBy(-tokenDecimals1);
  const token2_value = new BigNumber(farm.value)
    .multipliedBy(farm.pool.amounts[1])
    .multipliedBy(refPrice2)
    .dividedBy(farm.pool.shares_total_supply)
    .shiftedBy(-tokenDecimals2);
  return token1_value.plus(token2_value);
};

const calcLeveragedFarmDataFormatted = (
  farm: FarmInfo,
  leverage: number,
  token: TokenWithMetadata,
  pemToken: TokenWithMetadata
): FarmTableData => {
  let debtRate =
    typeof token.debt_rate === 'undefined'
      ? new BigNumber(token.debt_apy).div(10000)
      : new BigNumber(token.debt_rate).shiftedBy(-24);
  const calcData = calcLeveragedFarmData(
    farm,
    leverage,
    debtRate,
    token,
    pemToken
  );
  return {
    apy: formatBigNumber(calcData.totalApy.multipliedBy(100)),
    yieldFarming: formatBigNumber(calcData.yieldFarmingLev.multipliedBy(100)),
    tradingFees: formatBigNumber(calcData.tradingFeesLev.multipliedBy(100)),
    dailyAPR: formatBigNumber(
      calcData.totalApr.dividedBy(365).multipliedBy(100)
    ),
    totalAPR: formatBigNumber(calcData.totalApr.multipliedBy(100)),
    borrowInterest: formatBigNumber(
      calcData.borrowInterestLev.multipliedBy(100)
    ),
    rewardsAPR: formatBigNumber(calcData.rewardsAprLev.multipliedBy(100)),
    rewardsRate: toPrecision(
      toReadableNumber(18, token.debt_reward_rate_per_week),
      2
    ),
  };
};

const calcFarmTableData = (
  farm: FarmInfo,
  debtIsToken1: boolean,
  leverage: number,
  tokens: TokenWithMetadata[]
): FarmTableData => {
  const pemToken = tokens?.find((item) => item.id === PEM_TOKEN);
  const token = tokens?.find(
    (item) => item.id === (debtIsToken1 ? farm.token1_id : farm.token2_id)
  );

  let obj = {
    tvl: formatBigNumber(calcFarmTVL(farm, tokens)),
    ...calcLeveragedFarmDataFormatted(farm, leverage, token, pemToken),
  };

  //console.log("calcFarmTableData", obj);

  return obj;
};

const calcLendRewardsAPR = (
  token: TokenWithMetadata,
  pemTokenPrice: string
): BigNumber => {
  return new BigNumber(52)
    .multipliedBy(token.lend_reward_rate_per_week)
    .multipliedBy(pemTokenPrice)
    .shiftedBy(token.metadata.decimals)
    .dividedBy(token.total_supply)
    .dividedBy(token.refPrice)
    .shiftedBy(-18);
};

const calcDebtRewardsAPR = (
  token: TokenWithMetadata,
  pemTokenPrice: string
): BigNumber => {
  return new BigNumber(52)
    .multipliedBy(token.debt_reward_rate_per_week)
    .multipliedBy(pemTokenPrice)
    .shiftedBy(token.metadata.decimals)
    .dividedBy(token.total_borrowed)
    .dividedBy(token.refPrice)
    .shiftedBy(-18);
};

const calculateLendTableData = (
  token: TokenWithMetadata,
  pemTokenPrice: string
): LendTableData => {
  // TODO: use settings.borrow_fee
  const borrow_fee = 100; // 10%
  const debt_rate =
    typeof token.debt_rate === 'undefined'
      ? new BigNumber(token.debt_apy).div(10000)
      : new BigNumber(token.debt_rate).shiftedBy(-24);
  const lendAPR = token.total_supply
    ? debt_rate
        .multipliedBy(10000 - borrow_fee)
        .multipliedBy(token.total_borrowed)
        .dividedBy(token.total_supply)
        .dividedBy(10000) // borrow_fee divisor
    : new BigNumber(0);
  const lendRewardsAPR = calcLendRewardsAPR(token, pemTokenPrice).multipliedBy(
    100
  );
  const lendAPY = apr2apy(lendAPR).multipliedBy(100);
  const totalLendAPY = lendAPY.plus(lendRewardsAPR);
  //console.log("calculateLendTableData", token.debt_apy, lendAPR.toFixed(6), lendAPY.toFixed(6));
  /*
  console.log('token',token.id);
  console.log('lendAPR',lendAPR.toFixed(4));
  console.log('lendRewardsAPR',lendRewardsAPR.toFixed(4));
  console.log('lendAPY',lendAPY.toFixed(4));
  console.log('totalLendAPY',totalLendAPY.toFixed(4));
  */

  const precisionForDiffTokens =
    token.metadata.id === WBTC_TOKEN_ID || token.metadata.id === ETH_TOKEN_ID
      ? 4
      : 2;

  const balance = toPrecision(
    toReadableNumber(token['metadata']['decimals'], token['account_balance']),
    precisionForDiffTokens
  );

  const borrowed = new BigNumber(token['total_borrowed']);
  const supply = new BigNumber(token['total_supply']);

  const calculateSupply = supply.isZero()
    ? 0
    : borrowed.dividedBy(supply).multipliedBy(100).toFixed();

  const rewards = toPrecision(
    toReadableNumber(18, token['lend_reward_rate_per_week']),
    2
  );

  return {
    lendAPY: lendAPY.toFixed(2),
    lendRewardsAPR: lendRewardsAPR.isNaN() ? '0' : lendRewardsAPR.toFixed(2),
    totalLendAPY: totalLendAPY.toFixed(2),
    totalSupply: toPrecision(
      toReadableNumber(token.metadata.decimals, token.total_supply),
      2
    ),
    totalBorrowed: toPrecision(
      toReadableNumber(token.metadata.decimals, borrowed.toFixed()),
      2
    ),
    utilization: toPrecision(calculateSupply.toString(), 2),
    balance: balance,
    rewards,
  };
};

module.exports = {
  calculateLendTableData,
  calcFarmTableData,
  commonCall,
  getVolume,
  getTvl,
};
