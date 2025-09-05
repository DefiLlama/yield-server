const fetch = require('node-fetch');
const curve = require('../curve-dex');
const { default: BigNumber } = require('bignumber.js');

const chainIdMap = {
  146: 'Sonic',
  250: 'Fantom',
  42161: 'Arbitrum',
};

const poolToSymbol = {
  '0x346704605c72d9f5f9f02d651e5a3dcce6964f3d': 'xfrxETH',
  '0xf1232a1ab5661abdd6e02c6d8ac9940a23bb0b84': 'xfrxUSD',
  '0x71868ed5316714ed6ae89bd8e4836016216930db': 'xeFraxtal',
  '0x4cdb45979d19da8632ea1d3459cb18258854b285': 'xsFraxtal',
  '0x1028452e86ad0ae114a86b0b041af5110ff1f0b5': 'xCRV2',
  '0x38dd6b3c096c8cbe649fa0039cc144f333be8e61': 'xCRV',
  '0x24479a0d48849781b4386ed91fdd84241673ab1e': 'xeEthereum',
  '0xe5a0813a7de6abd8599594e84cb23e4a6d9d9800': 'xeLinea',
  '0xd9bf67d8a5d698a028160f62480d456801f0b4b1': 'xsOptimism',
  '0x9e63e5d31fd0136290ef99b3cac4515f346fef1c': 'xsLinea',
};

const getGauges = async () => {
  try {
    const response = await fetch(
      'https://eywa-bot-api-service.eywa.fi/gauges/0x0000000000000000000000000000000000000000',
      {
        timeout: 5000,
      }
    );

    if (!response.ok) {
      throw new Error(response.status);
    }

    const jsonData = await response.json();

    if (!jsonData.data) {
      return [];
    }

    return jsonData.data;
  } catch (error) {
    console.error(error);
    return [];
  }
};

const merkl = async () => {
  try {
    const response = await fetch(
      'https://api.merkl.xyz/v4/opportunities?mainProtocolId=crosscurve',
      {
        timeout: 10000,
      }
    );

    if (!response.ok) {
      throw new Error(response.status);
    }

    const merklData = await response.json();

    return Object.values(merklData);
  } catch (error) {
    console.error(error);
    return [];
  }
};

const resolveMerklPool = (merklData, address) => {
  const data = merklData.find(
    (pool) =>
      pool.campaigns.active[0]?.campaignParameters?.targetToken?.toLowerCase() ===
        address && pool.status === 'live'
  );

  if (!data) return;

  // if (data.status === 'live') {
  return data;
  // }

  // return merklData.find((pool) => pool.platform === data.platform && pool.status === 'live');
};

// Main Function
const main = async () => {
  try {
    const gauges = await getGauges();
    const addresses = Object.keys(gauges).map((address) =>
      address.toLowerCase()
    );
    const curveData = await curve.apy();
    const merklData = await merkl();

    const pools = await Promise.all(
      addresses.map(async (address) => {
        const curvePool = curveData.find(
          (pool) => pool.pool.split('-').at(0).toLowerCase() === address
        );
        const merklPool = merklData.find(
          (data) => data.explorerAddress.toLowerCase() === address
        );
        const gauge = gauges[address];
        const rewardTokens = [];

        if (Array.isArray(curvePool?.rewardTokens)) {
          rewardTokens.push(...curvePool.rewardTokens);
        }

        if (merklPool?.rewardsRecord?.breakdowns.length) {
          rewardTokens.push(
            ...merklPool.rewardsRecord.breakdowns.map((reward) =>
              reward.token.address.toLowerCase()
            )
          );
        }

        const underlyingTokens = [];

        if (Array.isArray(curvePool?.underlyingTokens)) {
          underlyingTokens.push(...curvePool.underlyingTokens);
        }
        if (merklPool?.tokens) {
          underlyingTokens.push(
            ...merklPool.tokens.map((token) => token.address.toLowerCase())
          );
        }

        let tvlUsd;

        if (address === '0x38dd6b3c096c8cbe649fa0039cc144f333be8e61') {
          const req = await fetch(
            'https://eywa-bot-api-service.eywa.fi/pools-data'
          );
          const res = await req.json();
          tvlUsd = res.data.pools.find(
            (pool) =>
              pool.address === '0x38dd6b3c096c8cbe649fa0039cc144f333be8e61'
          ).tvl;
          if (merklPool?.platform) {
            merklPool.platform = 'xCRV';
          }
        } else {
          tvlUsd = new BigNumber(curvePool?.tvlUsd || 0)
            .plus(merklPool?.tvlUsd || 0)
            .toNumber();
        }

        const apyBase = curvePool?.apyBase || 0;
        const apyReward = new BigNumber(curvePool?.apyReward || 0)
          .plus(
            new BigNumber(1)
              .div(gauge.totalDeposited.boosted)
              .multipliedBy(merklPool?.dailyRewards || 0)
              .multipliedBy(365)
              .multipliedBy(100)
          )
          .toNumber();

        return {
          pool: address,
          chain: curvePool?.chain || chainIdMap[merklPool?.chainId],
          project: 'crosscurve',
          symbol:
            poolToSymbol[address] || curvePool?.symbol || merklPool?.platform,
          apyBase,
          apyReward,
          tvlUsd,
          rewardTokens: Array.from(
            new Set(rewardTokens.map((address) => address.toLowerCase()))
          ),
          underlyingTokens: Array.from(
            new Set(underlyingTokens.map((address) => address.toLowerCase()))
          ),
        };
      })
    );
    return pools.filter((i) => i.symbol);
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.crosscurve.fi/farm',
};
