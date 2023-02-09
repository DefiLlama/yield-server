const axios = require('axios');

const CHAIN_URL = `https://lb.libre.org`;

const precisionAdjustment = 10000;
const satsPerBTC = 100000000;
const blocksPerDay = 172800;
const daysInYear = 365;

const getRewardSettings = async() => {
    const result = await axios
      .post(`${CHAIN_URL}/v1/chain/get_table_rows`, {
        code: 'reward.libre',
        table: 'global',
        scope: 'reward.libre',
        json: true,
      });
    if (!result || !result.data || !result.data.rows) {
      throw new Error('Error fetching reward settings');
    }
    return result.data.rows[0][1];
}

const getAvailablePools = async() => {
    const result = await axios
      .post(`${CHAIN_URL}/v1/chain/get_table_rows`, {
        code: 'reward.libre',
        table: 'global',
        scope: 'reward.libre',
        json: true,
      });
    if (
      !result ||
      !result.data ||
      !result.data.rows ||
      !result.data.rows[0] ||
      !result.data.rows[0][1]
    ) {
      return [];
    }
    return result.data.rows[0][1].allowed_pools;
}

const getPoolStats = async(symbol) => {
    const response = await axios
        .post(`${CHAIN_URL}/v1/chain/get_table_rows`, {
            json: true, 
            code: 'swap.libre', 
            scope: symbol, 
            table: 'stat',
            limit: 10,
            reverse: false, 
            show_payer: false,
        });
    const row = response.data.rows[0];
    const pool1Amount = Number(
      row.pool1.quantity.split(' ')[0]
    );
    const pool2Amount = Number(
      row.pool2.quantity.split(' ')[0]
    );
    const price = Number((pool2Amount / pool1Amount).toFixed(2));
    return {
      pool1Amount,
      pool2Amount,
      price,
      supply: Number(row.supply.replace(symbol, '')),
    };
}

const getLPBalance = async(symbol) => {
    const farmLPBalanceResult = await axios
      .post(`${CHAIN_URL}/v1/chain/get_currency_balance`, {
        code: 'swap.libre',
        account: 'farm.libre',
        symbol,
      });
    try {
      return Number(
        farmLPBalanceResult.data && farmLPBalanceResult.data.length
          ? farmLPBalanceResult.data[0].replace(symbol, '')
          : 0,
      );
    } catch (e) {
      return 0;
    }
}


const getBTCUSDFarmingStats = async() => {
    const rewardSettings = await getRewardSettings();
    const allowedPoolCount = rewardSettings.allowed_pools.length;

    const rewardPerBlock = rewardSettings.reward_per_block;

    const rewardPerFarm =
      rewardPerBlock / precisionAdjustment / allowedPoolCount;

    const btcUsdPoolStats = await getPoolStats('BTCUSD');
    const lpTokenValue =
      (btcUsdPoolStats.pool2Amount * 2) / btcUsdPoolStats.supply;

    const lpBalance = await getLPBalance('BTCUSD');
    const libreUSDValue = await getLibrePrice();
    const totalFarmValue = lpBalance * lpTokenValue;
    
    let apy = 
        (100 * libreUSDValue * blocksPerDay * rewardPerFarm * daysInYear) /
        totalFarmValue;


    apy = Number(apy.toFixed(2));
    

    return {
      symbol: 'BTCUSD',
      totalValue: totalFarmValue,
      farming_staked: lpBalance ?? 0,
      apy,
      reward_per_farm: rewardPerFarm,
      lpTokenValue,
    };
}

const getLibrePrice = async() => {
    const btcLibPrice = await getPoolStats('BTCLIB');
    const librePrice = 1 / btcLibPrice.price;
    const btcPrice = await getPoolStats('BTCUSD');
    return librePrice * btcPrice.price;
}

const getBTCLIBFarmingStats = async() => {
    const rewardSettings = await getRewardSettings();
    const allowedPoolCount = rewardSettings.allowed_pools.length;

    const rewardPerBlock = rewardSettings.reward_per_block;

    const rewardPerFarm =
      rewardPerBlock / precisionAdjustment / allowedPoolCount;
    const btcPrice = (await getPoolStats('BTCUSD')).price;
    const btcLibPoolStats = await getPoolStats('BTCLIB');
    const lpTokenValue =
      (btcLibPoolStats.pool1Amount * 2 * btcPrice) / btcLibPoolStats.supply;

    const lpBalance = await getLPBalance('BTCLIB');
    const libreUSDValue = await getLibrePrice();
    const totalFarmValue = lpBalance * lpTokenValue;

    let apy = 
        (100 * libreUSDValue * blocksPerDay * rewardPerFarm * daysInYear) /
        totalFarmValue;
    
    apy = Number(apy.toFixed(2));

    return {
      symbol: 'BTCLIB',
      totalValue: totalFarmValue,
      farming_staked: lpBalance ?? 0,
      apy,
      reward_per_farm: rewardPerFarm,
      lpTokenValue,
    };
}

const getAPYs = async () => {
    const BTCLIB = await getBTCLIBFarmingStats();
    const BTCUSD = await getBTCUSDFarmingStats();
    return [{
      pool: 'BTCLIB',
      chain: 'Libre',
      project: 'libre-swap',
      symbol: 'BTCLIB',
      apy: BTCLIB.apy,
      tvlUsd: Number(BTCLIB.totalValue.toFixed(2)),
      rewardTokens: ['LIBRE'],
      underlyingTokens: ['BTC', 'LIBRE'],
      poolMeta: 'BTC - Libre farming pool',
    }, {
      pool: 'BTCUSD',
      chain: 'Libre',
      project: 'libre-swap',
      symbol: 'BTCUSD',
      apy: BTCUSD.apy,
      tvlUsd: Number(BTCUSD.totalValue.toFixed(2)),
      rewardTokens: ['LIBRE'],
      underlyingTokens: ['BTC', 'USDT'],
      poolMeta: 'BTC - USDT farming pool',
    }]
}

module.exports = {
  timetravel: false,
  apy: getAPYs,
  url: 'https://dashboard.libre.org/farming',
};

