const utils = require('../utils');
const { Web3 } = require('web3');

const { default: BigNumber } = require('bignumber.js');
const axios = require('axios');

const viewHelperABI = require('./helper.json');

const HELPER_ADDRESS = '0xbBB04C9D7065EF7E5ED58EecE34321eA96D37287';
const TOKEN_ADDRESS = '0x9aAC39ca368D27bf03887CCe32f28b44F466072F';
const LP_TOKEN_ADDRESS = '0x0E9309f32881899F6D4aC2711c6E21367A84CA26';
const LP_REWARD_ADDRESS = '0xF63Ef9F4320f9d16731a40ff1f58a966ee086806';
const STAKING_REWARD_ADDRESS = '0xA76D6dc805d0EbEcb3787c781ce3A18feEF020cb';
const WETH_ADDRESS = '0x4300000000000000000000000000000000000004';
const DEPLOYER_ADDRESS = '0x32754478de813A42C9eD6e3e8d00d66c6009b40f';
const YEAR = 365 * 60 * 60 * 24;

const web3 = new Web3(new Web3.providers.HttpProvider('https://rpc.blast.io'));

async function getLPStakingInfo() {
  var poolInfo = await helper.methods
    .getPoolInfo(LP_REWARD_ADDRESS, DEPLOYER_ADDRESS)
    .call();

  var lpPrice = await helper.methods.getBlnyanLpPrice().call();

  var tokenValue =
    (Number(lpPrice.wethBalance) * Number(lpPrice.wethValue) +
      Number(lpPrice.blnyanBalance) * Number(lpPrice.blnyanValue)) /
    Number(lpPrice.supply);

  poolValueEth = (Number(poolInfo._staked) / 1e18) * Number(tokenValue);
  ethYearly = YEAR * Number(poolInfo._rewardRate);

  apyReward = (ethYearly / poolValueEth) * 100;

  const ethPrice = (
    await axios.get('https://coins.llama.fi/prices/current/coingecko:ethereum')
  ).data.coins['coingecko:ethereum'].price;

  const tvlUsd = (poolValueEth * ethPrice) / 1e18;

  data = {
    pool: LP_TOKEN_ADDRESS,
    chain: utils.formatChain('blast'),
    project: 'blastnyan',
    symbol: 'blNYAN-WETH',
    tvlUsd,
    apyBase: 0,
    apyReward,
    underlyingTokens: [TOKEN_ADDRESS, WETH_ADDRESS],
    rewardTokens: [WETH_ADDRESS],
    poolMeta: 'BlastNYAN Earning Pool: Stake LP to EARN TAXED WETH',
  };

  return data;
}

const getblNyanStakingInfo = async () => {
  var poolInfo = await helper.methods
    .getPoolInfo(STAKING_REWARD_ADDRESS, DEPLOYER_ADDRESS)
    .call();

  var blNYANPrice = await helper.methods.getBlnyanPrice(1e18).call();
  poolValue = Number(poolInfo._staked);

  yearly = YEAR * Number(poolInfo._rewardRate);
  apr = yearly / poolValue;

  asEth = (Number(poolValue) * Number(blNYANPrice)) / 1e18;
  asEth = Math.floor(asEth).toString();

  usd = await helper.methods.getTokenPriceUSDC(asEth.toString()).call();

  usd = Number(usd) / 1e18;

  data = {
    pool: TOKEN_ADDRESS,
    chain: utils.formatChain('blast'),
    project: 'blastnyan',
    symbol: 'blNYAN',
    tvlUsd: Number(usd),
    apyBase: Number(0),
    apyReward: Number(apr) * 100,
    underlyingTokens: [TOKEN_ADDRESS],
    rewardTokens: [TOKEN_ADDRESS],
    poolMeta: 'BlastNYAN Single Asset Staking Farm',
  };

  return data;
};

const helper = new web3.eth.Contract(viewHelperABI, HELPER_ADDRESS);

const getApy = async () => {
  const poolsApy = [];

  const lpData = await getLPStakingInfo();
  const poolData = await getblNyanStakingInfo();

  poolsApy.push(lpData);
  poolsApy.push(poolData);

  return poolsApy;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://BlastNYAN.com/',
};
