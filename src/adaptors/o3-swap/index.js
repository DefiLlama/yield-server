const { Web3 } = require('web3');
const axios = require('axios');
const poolAbi = require('./abis/pool.json');
const stakingAbi = require('./abis/staking.json');
const multiShareStakingAbi = require('./abis/multiShareStaking.json');
const BigNumber = require('bignumber.js');
const { CHAINS, CHAIN_ENUM, CHAIN_RPC_HOST, RATES_CHAIN } = require('./chains');
const { o3SwapPools } = require('./pools');

const web3 = new Web3();

function getAssetRate() {
  return new Promise((resolve) => {
    axios.get('https://hub-v2.o3.network/v2/crypto/rates').then((res) => {
      resolve(res.data.data);
    });
  });
}

function getPoolBalancData(address, tokenIndex, chain) {
  if (address === '') {
    return null;
  }
  const poolContract = new web3.eth.Contract(poolAbi);
  const data = poolContract.methods.balances(tokenIndex).encodeABI();
  return {
    jsonrpc: '2.0',
    id: CHAIN_ENUM[chain],
    method: 'eth_call',
    params: [
      {
        to: address,
        data,
      },
      'latest',
    ],
  };
}
function getPoolBalance() {
  const poolBalance = {};
  return new Promise((resolve) => {
    const CHAIN_LIST = Object.values(CHAINS);
    CHAIN_LIST.forEach((chain) => {
      const postDatas = [];
      const pools = o3SwapPools.filter((item) => item.chain === chain);
      for (const poolItem of pools) {
        const poolAddress = poolItem.pool.split('-')[0];
        const data1 = getPoolBalancData(poolAddress, 0, chain);
        const data2 = getPoolBalancData(poolAddress, 1, chain);
        postDatas.push(data1);
        postDatas.push(data2);
      }
      if (postDatas.length <= 0) {
        poolBalance[chain] = {};
        if (Object.keys(poolBalance).length === CHAIN_LIST.length) {
          resolve(poolBalance);
        }
        return;
      }
      axios
        .post(CHAIN_RPC_HOST[chain], postDatas)
        .then((response) => {
          const res = response.data;
          poolBalance[chain] = {};
          if (!res.length) {
            if (Object.keys(poolBalance).length === CHAIN_LIST.length) {
              resolve(poolBalance);
            }
          }
          res.forEach((resItem, _index) => {
            const balance = resItem.result;
            const index = parseInt((_index / 2).toString());
            const poolSymbol = pools[index].symbol;
            const tokenDecimals = pools[index].tokenDecimals[_index % 2];
            if (
              balance &&
              !new BigNumber(balance).isNaN() &&
              new BigNumber(balance).comparedTo(0) >= 0
            ) {
              const tempBalance = new BigNumber(
                poolBalance[chain][poolSymbol]
              ).isNaN()
                ? '0'
                : poolBalance[chain][poolSymbol];
              poolBalance[chain][poolSymbol] = new BigNumber(balance)
                .shiftedBy(-tokenDecimals)
                .plus(new BigNumber(tempBalance))
                .toFixed();
            }
          });
          if (Object.keys(poolBalance).length === CHAIN_LIST.length) {
            resolve(poolBalance);
          }
        })
        .catch((_) => {
          poolBalance[chain] = {};
          if (Object.keys(poolBalance).length === CHAIN_LIST.length) {
            resolve(poolBalance);
          }
        });
    });
  });
}

function getO3StakingSharePerSecondData(pool) {
  const contractHash = pool.stakingContract;
  let contract;
  let data;
  if (pool.rewardTokens.length && pool.rewardTokens.length > 1) {
    contract = new web3.eth.Contract(multiShareStakingAbi);
    data = contract.methods.getSharePerSecondArray().encodeABI();
  } else {
    contract = new web3.eth.Contract(stakingAbi);
    data = contract.methods.getSharePerSecond().encodeABI();
  }
  return {
    jsonrpc: '2.0',
    id: CHAIN_ENUM[pool.chain],
    method: 'eth_call',
    params: [
      {
        to: contractHash,
        data,
      },
      'latest',
    ],
  };
}
function getO3StakingTotalStaked(pool) {
  const contractHash = pool.stakingContract;
  let contract;
  let data;
  if (pool.rewardTokens.length && pool.rewardTokens.length > 1) {
    contract = new web3.eth.Contract(multiShareStakingAbi);
    data = contract.methods.totalStaked().encodeABI();
  } else {
    contract = new web3.eth.Contract(stakingAbi);
    data = contract.methods.totalStaked().encodeABI();
  }
  return {
    jsonrpc: '2.0',
    id: CHAIN_ENUM[pool.chain],
    method: 'eth_call',
    params: [
      {
        to: contractHash,
        data,
      },
      'latest',
    ],
  };
}
function getProfitTokensData(rewardTokenDecimals, hexString) {
  const decodeTypes =
    rewardTokenDecimals.length === 1
      ? ['uint256']
      : new Array(rewardTokenDecimals.length + 2).fill('uint256');
  if (hexString) {
    return Object.values(web3.eth.abi.decodeParameters(decodeTypes, hexString))
      .filter((item) => typeof item === 'string')
      .slice(rewardTokenDecimals.length === 1 ? 0 : 2)
      .map((resultNumber, index) => {
        return resultNumber
          ? new BigNumber(resultNumber)
              .shiftedBy(-rewardTokenDecimals[index])
              .toFixed()
          : '--';
      });
  }
  return new Array(rewardTokenDecimals.length);
}
function getO3StakingInfo() {
  const result = {};
  return new Promise((resolve) => {
    const CHAIN_LIST = Object.values(CHAINS);
    CHAIN_LIST.forEach((chain) => {
      const postDatas = [];
      const pools = o3SwapPools.filter((item) => item.chain === chain);
      for (const poolItem of pools) {
        const data = getO3StakingSharePerSecondData(poolItem);
        const totalStakedData = getO3StakingTotalStaked(poolItem);
        postDatas.push(data);
        postDatas.push(totalStakedData);
      }
      axios
        .post(CHAIN_RPC_HOST[chain], postDatas)
        .then((response) => {
          const res = response.data;
          result[chain] = {};
          if (!res.length) {
            if (Object.keys(result).length === CHAIN_LIST.length) {
              resolve(result);
            }
          }
          for (let i = 0; i < parseInt((res.length / 2).toString()); i++) {
            const strartIndex = i * 2;
            const pool = pools[i];
            const poolSymbol = pools[i].symbol;
            result[chain][poolSymbol] = {
              sharePerSecond: getProfitTokensData(
                pool.rewardTokenDecimals,
                res[strartIndex]?.result
              ),
              totalStaked: res[strartIndex + 1].result
                ? new BigNumber(res[strartIndex + 1].result)
                    .shiftedBy(-18)
                    .toFixed()
                : '0',
            };
          }
          if (Object.keys(result).length === CHAIN_LIST.length) {
            resolve(result);
          }
        })
        .catch((_) => {
          result[chain] = {};
          if (Object.keys(result).length === CHAIN_LIST.length) {
            resolve(result);
          }
        });
    });
  });
}

function getTvlUsd(pool, balance, rates) {
  const price =
    rates[RATES_CHAIN[pool.chain]][pool.underlyingTokens[0].toLowerCase()]
      ?.price;
  return new BigNumber(price).times(balance).dp(2).toNumber();
}
function getStakingAPR(pool, stakingInfo, rates) {
  const yearSecond = new BigNumber('31536000');
  if (stakingInfo?.totalStaked === undefined) return 0;
  const totalStaked = stakingInfo.totalStaked;
  const sharePerSecond = stakingInfo.sharePerSecond;
  const tokenPrice =
    rates[RATES_CHAIN[pool.chain]][pool.underlyingTokens[0].toLowerCase()]
      ?.price;
  let yearProfits = new BigNumber(0);
  pool.rewardTokens.forEach((hash, index) => {
    const rewardTokenPrice =
      rates[RATES_CHAIN[pool.chain]][hash.toLowerCase()]?.price;
    yearProfits = yearProfits.plus(
      yearSecond
        .times(new BigNumber(sharePerSecond[index]))
        .times(new BigNumber(rewardTokenPrice))
    );
  });

  const result = yearProfits
    .div(totalStaked)
    .div(new BigNumber(tokenPrice || '1'))
    .times(100)
    .dp(2);
  if (result.isNaN()) {
    return 0;
  }
  return result.toNumber();
}

async function main() {
  return new Promise((resolve) => {
    try {
      Promise.all([getAssetRate(), getPoolBalance(), getO3StakingInfo()]).then(
        (result) => {
          const rates = result[0] || {};
          const poolBalances = result[1];
          const stakingInfo = result[2];
          resolve(
            o3SwapPools.map((poolItem) => {
              const tvlUsd = getTvlUsd(
                poolItem,
                poolBalances[poolItem.chain][poolItem.symbol],
                rates
              );
              return {
                pool: poolItem.pool,
                symbol: poolItem.symbol,
                chain: poolItem.chain,
                project: poolItem.project,
                rewardTokens: poolItem.rewardTokens,
                underlyingTokens: poolItem.underlyingTokens,
                tvlUsd: Number.isFinite(tvlUsd) ? tvlUsd : 0,
                apyReward: getStakingAPR(
                  poolItem,
                  stakingInfo[poolItem.chain][poolItem.symbol],
                  rates
                ),
              };
            })
          );
        }
      );
    } catch (error) {
      console.log('error');
    }
  });
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://o3swap.com',
};
