const utils = require('../utils');
const Web3 = require('web3');

const usdcABI = require('./usdcabi.json');
const sherlockV2ABI = require('./sherlockV2abi.json');

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SherlockContract = '0xacbBe1d537BDa855797776F969612df7bBb98215';
const SherlockV2Contract = '0x0865a889183039689034dA55c1Fd12aF5083eabF';

const apy = async () => {
  // Fetch APY
  const apyData = await utils.getData(
    'https://mainnet.indexer.sherlock.xyz/staking'
  );

  const web3 = new Web3(process.env.INFURA_CONNECTION);

  // Fetch V1 pool TVL
  const usdcContract = new web3.eth.Contract(usdcABI.abi, USDC);
  const v1TVL = web3.utils.toBN(
    await usdcContract.methods.balanceOf(SherlockContract).call()
  );

  // Fetch V2 pool TVL
  const sherlockContract = new web3.eth.Contract(
    sherlockV2ABI.abi,
    SherlockV2Contract
  );
  const v2TVL = web3.utils.toBN(
    await sherlockContract.methods.totalTokenBalanceStakers().call()
  );

  const usdcPool = {
    pool: 'sherlock-usdc',
    chain: utils.formatChain('ethereum'),
    project: 'sherlock',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: v1TVL.add(v2TVL).toNumber() / 1e6,
    apy: apyData.usdc_apy,
  };

  return [usdcPool];
};

module.exports = {
  timetravel: false,
  apy,
};
