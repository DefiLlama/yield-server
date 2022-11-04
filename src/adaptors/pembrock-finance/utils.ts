const axios = require('axios');
const BigNumber = require('bignumber.js');

const statsUrl = 'https://api.stats.ref.finance/';

const PEM_TOKEN = 'token.pembrock.near';

interface Volume {
  pool_id: string;
  volume_dollar: string;
}

interface PoolInfo {
  amounts: string[];
  farming: boolean;
  id: string;
  pool_kind: string;
  shares_total_supply: string;
  token_account_ids: string[];
  total_fee: number;
  tvl: string;
}

interface FarmInfo {
  max_leverage: number;
  ref_pool_id: number;
  shares: string;
  token1_id: string;
  token2_id: string;
  value: string;

  seedInfo?: object;
  token1?: TokenInfo;
  token2?: TokenInfo;
  listFarmsBySeed?: [];
  pool?: PoolInfo;
  volume?: Volume[];
  tvl?: object;
  tokensPriceList?: object[];
}

interface TokenMetadata {
  id: string;
  decimals: number;
  price?: string;
}

interface TokenInfo {
  total_supply: string;
  total_borrowed: string;
  lend_shares: string;
  debt_shares: string;
  debt_rate?: string;
  lend_reward_rate_per_week: string;
  debt_reward_rate_per_week: string;
}

interface TokenWithMetadata extends TokenInfo {
  id: string;
  metadata: TokenMetadata;
  refPrice?: string;
}

interface FarmTableData {
  apy: string;
  tvl?: string;
}

interface LendTableData {
  totalLendAPY: string;
}

interface TVL {
  pool_id: string;
  asset_amount: string;
  fiat_amount: string;
  asset_price: string;
  fiat_price: string;
  asset_tvl: string;
  fiat_tvl: string;
  date: string;
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

const getTvl = async (id: string): Promise<[TVL]> => {
  return commonCall(statsUrl, `api/pool/${id}/tvl`);
};

const getVolume = async (id: string): Promise<[Volume]> => {
  return commonCall(statsUrl, `api/pool/${id}/volume`);
};

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

  const _leverage = new BigNumber(leverage);

  let yieldFarming = calcYieldFarming(farm);
  let tradingFees = calcTradingFees(farm);

  const yieldFarmingLev = yieldFarming.multipliedBy(_leverage).dividedBy(1000);
  const tradingFeesLev = tradingFees.multipliedBy(_leverage).dividedBy(1000);

  let borrowInterestLev = _leverage
    .minus(1000)
    .negated()
    .multipliedBy(debtRate)
    .dividedBy(1000); // leverage divisor // ! differe from docs, not divided by 10000
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
    .plus(rewardsAprLev.isNaN() ? 0 : rewardsAprLev); // ! differe from docs, rewardsAprLev added

  return { totalApy };
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

  const debtRate = new BigNumber(token.debt_rate).shiftedBy(-24);
  const calcData = calcLeveragedFarmData(
    farm,
    leverage,
    debtRate,
    token,
    pemToken
  );

  return {
    tvl: formatBigNumber(calcFarmTVL(farm, tokens)),
    apy: formatBigNumber(calcData.totalApy.multipliedBy(100)),
  };
};

const calcLendRewardsAPR = (
  token: TokenWithMetadata,
  pemTokenPrice: string
): BigNumber => {
  return token.metadata?.decimals
    ? new BigNumber(52)
        .multipliedBy(token.lend_reward_rate_per_week)
        .multipliedBy(pemTokenPrice)
        .shiftedBy(token.metadata.decimals)
        .dividedBy(token.total_supply)
        .dividedBy(token.refPrice)
        .shiftedBy(-18)
    : BigNumber(0);
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
  const debt_rate = new BigNumber(token.debt_rate).shiftedBy(-24);
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

  return {
    totalLendAPY: totalLendAPY.toFixed(2),
  };
};

module.exports = {
  calculateLendTableData,
  calcFarmTableData,
  commonCall,
  getVolume,
  getTvl,
};
