const utils = require('../utils');
const ethers = require('ethers');
const axios = require('axios');

const erc20Abi = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const vault = '0x7470C48FBf23067F6F8Ef63f7D9B4A2aA5D0afEf';
const usd1 = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d';

const provider = new ethers.providers.JsonRpcProvider(
  'https://binance.llamarpc.com'
);

const usd1Pool = async () => {
  const currentTime = Math.trunc(Date.now() / 1000);

  const apy7dUrl = `https://bnbfutures.holdstation.com/api/apy/history/vault/time/${currentTime}`;
  const apy7d = await utils.getData(apy7dUrl);

  const apy24hUrl = `https://bnbfutures.holdstation.com/api/apy/mUSDC`;
  const apyBase = await utils.getData(apy24hUrl);

  const usd1Contract = new ethers.Contract(usd1, erc20Abi, provider);
  const usd1Balance = await usd1Contract.balanceOf(vault);

  return {
    pool: `${vault}-binance`,
    chain: 'Binance',
    project: 'holdstation-defutures',
    symbol: utils.formatSymbol('USD1'),
    tvlUsd: usd1Balance / 1e18,
    apyBase7d: apy7d.rate,
    apyBase: apyBase.rate,

    underlyingTokens: [usd1],
  };
};

// const usdcPool = async () => {
//   const currentTime = Math.trunc(Date.now() / 1000);

//   const apy7dUrl = `https://api-trading.holdstation.com/api/apy/history/vault/time/${currentTime}?chainId=324`;
//   const apy7d = await utils.getData(apy7dUrl);

//   const apy24hUrl = `https://api-trading.holdstation.com/api/apy/history/vault-24h/time/${currentTime}?chainId=324`;
//   const apyBase = await utils.getData(apy24hUrl);

//   const usdcContract = new ethers.Contract(usdc, erc20Abi, provider);
//   const usdcBalance = await usdcContract.balanceOf(vault);

//   return {
//     pool: `${vault}-zksync_era`,
//     chain: 'zksync_era',
//     project: 'holdstation-defutures',
//     symbol: utils.formatSymbol('USDC'),
//     tvlUsd: usdcBalance / 1e6,
//     apyBase7d: apy7d.rate,
//     apyBase: apyBase.rate,

//     // https://github.com/DefiLlama/yield-server/pull/1146#issuecomment-1895398250
//     apyReward: parseFloat(apyBase.esHoldRate) * 0.5,

//     underlyingTokens: [usdc],
//     rewardTokens: [esHold],
//   };
// };

// const holdPool = async () => {
//   const currentTime = Math.trunc(Date.now() / 1000);

//   const apy7dUrl = `https://gateway.holdstation.com/services/launchpad/api/hold-staking-vault/yield/time/${currentTime}`;
//   const apy7d = await utils.getData(apy7dUrl);

//   const apy24hUrl = `https://gateway.holdstation.com/services/launchpad/api/hold-staking-vault/yield-24h/time/${currentTime}`;
//   const apyBase = await utils.getData(apy24hUrl);

//   const holdContract = new ethers.Contract(hold, erc20Abi, provider);
//   const balance = await holdContract.balanceOf(holdStaking);

//   const coinResp = await axios.get(
//     `https://coins.llama.fi/prices/current/coingecko:holdstation`
//   );
//   const coin = coinResp.data.coins['coingecko:holdstation'];

//   return {
//     pool: `${holdStaking}-zksync_era`,
//     chain: 'zksync_era',
//     project: 'holdstation-defutures',
//     symbol: utils.formatSymbol(coin.symbol),
//     tvlUsd: (balance / 1e18) * coin.price,
//     apyBase7d: apy7d.baseRate,
//     apyBase: apyBase.baseRate,

//     // https://github.com/DefiLlama/yield-server/pull/1146#issuecomment-1895398250
//     apyReward: apyBase.esHoldRate * 0.5,

//     underlyingTokens: [hold],
//     rewardTokens: [esHold],
//   };
// };

module.exports = {
  timetravel: true,
  apy: async () => {
    return [await usd1Pool()];
  },
  url: 'https://holdstation.exchange/vault',
};
