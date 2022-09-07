const utils = require('../utils');
const Web3 = require('web3');

const sherlockV2ABI = require('./sherlockV2abi.json');

const SherlockV2Contract = '0x0865a889183039689034dA55c1Fd12aF5083eabF';

const apy = async () => {
  // Fetch APY
  const apyData = await utils.getData(
    'https://mainnet.indexer.sherlock.xyz/staking'
  );

  const web3 = new Web3(process.env.INFURA_CONNECTION);

  // Fetch V2 pool TVL
  const sherlockContract = new web3.eth.Contract(
    sherlockV2ABI.abi,
    SherlockV2Contract
  );
  const v2TVL = web3.utils.toBN(
    await sherlockContract.methods.totalTokenBalanceStakers().call()
  );

  const usdcPool = {
    pool: 'sherlock-v2-usdc',
    chain: utils.formatChain('ethereum'),
    project: 'sherlock',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: v2TVL.toNumber() / 1e6,
    apy: apyData.usdc_apy,
  };

  return [usdcPool];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.sherlock.xyz/stake',
};
