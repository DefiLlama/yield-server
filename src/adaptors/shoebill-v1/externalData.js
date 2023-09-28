const axios = require('axios');

const getKsdEarn = async () => {
  try {
    const resp = await axios.get(`https://prod.kokoa-api.com/earn/status`);

    const result = {
      supplyRate: resp.data.apy,
      totalRate: Number(resp.data.apy),
      underlyingAddress: '0x4fa62f1f404188ce860c8f0041d6ac3765a72e67',
      treasuryFeeRate: 0.1,
      incentiveFeeRate: 0.4,
      realizedApy: Number(resp.data.apy) / 2,
    };

    return result;
  } catch (e) {
    console.error(e);
    return {
      supplyRate: 0,
      totalRate: 0,
      underlyingAddress: '0x22e3ac1e6595b64266e0b062e01fae31d9cdd578',
      treasuryFeeRate: 0.1,
      incentiveFeeRate: 0.4,
      realizedApy: 0,
    };
  }
};
const get4nutsApr = async () => {
  try {
    const resp = await axios.get(`https://prod.kokonut-api.com/pools`);

    const data = resp.data.pools.find((e) => e.symbol === '4NUTS');
    const result = {
      supplyRate: data.baseApr,
      totalRate: Number(data.baseApr) + Number(data.stakingApr),
      underlyingAddress: '0x22e3ac1e6595b64266e0b062e01fae31d9cdd578',
      treasuryFeeRate: 0.1,
      incentiveFeeRate: 0.4,
      realizedApy: (Number(data.baseApr) + Number(data.stakingApr)) / 2,
    };

    return result;
  } catch (e) {
    console.error(e);
    return {
      supplyRate: 0,
      totalRate: 0,
      underlyingAddress: '0x22e3ac1e6595b64266e0b062e01fae31d9cdd578',
      treasuryFeeRate: 0.1,
      incentiveFeeRate: 0.4,
      realizedApy: 0,
    };
  }
};
const getStKlayApr = async () => {
  try {
    const resp = await axios.get(`https://stake.ly/api/stats/stKlay/apr`);

    const result = {
      supplyRate: resp.data.value,
      totalRate: Number(resp.data.value),
      underlyingAddress: '0xf80f2b22932fcec6189b9153aa18662b15cc9c00',
      treasuryFeeRate: 0.1,
      incentiveFeeRate: 0.9,
      realizedApy: Number(resp.data.value) * (1 - 1),
    };

    return result;
  } catch (e) {
    console.error(e);
    return {
      ksdApy: 0,
    };
  }
};

const getRecentPoolInfo = async () => {
  try {
    const resp = await axios.get(
      `https://ss.klayswap.com/stat/recentPoolInfo.min.json`
    );

    const result = {
      common: resp.data.common,
      recentPool: resp.data.recentPool,
    };

    return result.recentPool
      .map((pool, i) => {
        if (i === 0) return;
        return {
          underlyingAddress: pool[1],
          rewardRate: pool[25],
          airdropRate: pool[26],
          feeRate: pool[27],
          totalRate: Number(pool[25]),
          treasuryFeeRate: 0.1,
          incentiveFeeRate: 0.4,
          realizedApy: Number(pool[25]) * (1 - 0.1 - 0.4),
        };
      })
      .filter((e) => e);
  } catch (e) {
    console.error(e);
    return {
      common: null,
      recentPool: [],
    };
  }
};
const getLeveragePoolInfo = async () => {
  try {
    const resp = await axios.get(
      `https://ss.klayswap.com/stat/leverage.min.json`
    );

    const result = {
      common: resp.data.common,
      leveragePool: resp.data.leveragePool,
    };

    return result.leveragePool.single
      .map((pool, i) => {
        if (i === 0) return;
        return {
          underlyingAddress: pool[2],
          rewardRate: pool[20],
          supplyRate: pool[21],
          totalRate: pool[22],
          treasuryFeeRate: 0,
          realizedApy: Number(pool[20]) + Number(pool[21]),
        };
      })
      .filter((e) => e);
  } catch (e) {
    console.error(e);
    return {
      common: null,
      leveragePool: [],
    };
  }
};

module.exports = {
  getKsdEarn,
  get4nutsApr,
  getStKlayApr,
  getRecentPoolInfo,
  getLeveragePoolInfo,
};
