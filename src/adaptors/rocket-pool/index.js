const utils = require('../utils');

const sdk = require("@defillama/sdk")
const abi = require('./abi.json')

const rocketMinipoolManager = '0x6293B8abC1F36aFB22406Be5f96D893072A8cF3a'
const rocketVault = '0x3bDC69C4E5e13E52A65f5583c23EFB9636b469d6'
const rocketNodeStaking_contract = '0x3019227b2b8493e45Bf5d25302139c9a2713BF15'

const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
const rpl = '0xd33526068d116ce69f19a9ee46f0bd304f21a51f'

async function tvl(timestamp, ethBlock, chainBlocks) {
  // Get ETH staked for rETH, which is given by users and Node Operators
  // Also get RPL staked by Node Operators to spin up a node

  // Get minipool count per status
  let offset = 0
  const limit = 400, statusesCount = 5
  let minipool_count_per_status = new Array(statusesCount).fill(0);
  while (true) {
    const {output: activeMinipoolCount} = await sdk.api.abi.call({ 
      target: rocketMinipoolManager,
      params: [offset, limit],
      abi: abi['rocketMinipoolManager.getMinipoolCountPerStatus'],
      block: ethBlock,
      chain: 'ethereum'
    })
    const activeMinipoolCount_arr = [...Array(statusesCount).keys()].map(i => activeMinipoolCount[i.toString()])
    minipool_count_per_status = minipool_count_per_status.map((sum, idx) => sum + parseInt(activeMinipoolCount[idx]))
    // console.log('offset', offset, 'activeMinipoolCount', activeMinipoolCount, 'activeMinipoolCount_arr', activeMinipoolCount_arr)
    if (activeMinipoolCount_arr.reduce((a, b)=> a + parseInt(b), 0) < limit) { break; }
    offset += limit
  }
  // console.log(`minipool_count_per_status / [unmatched*16, pending*32, staking*32, withdrawable*32] ${minipool_count_per_status}\n`)
  
  // Get ETH and RPL balance of multiple rocketpool contracts as well as RPL staked
  const [
    {output: rocketDepositPoolBalance}, 
    {output: rocketTokenRETHBalance}, 
    {output: totalRPLStake}, 
    {output: rocketDAONodeTrustedActions_rplBalance}, 
    {output: rocketAuctionManager_rplBalance}
  ] = await Promise.all([ 
    sdk.api.abi.call({
      target: rocketVault,
      params: ['rocketDepositPool'],
      abi: abi['rocketVault.balanceOf'],
      block: ethBlock,
      chain: 'ethereum'
    }), 
    sdk.api.abi.call({
      target: rocketVault,
      params: ['rocketTokenRETH'],
      abi: abi['rocketVault.balanceOf'],
      block: ethBlock,
      chain: 'ethereum'
    }), 
    sdk.api.abi.call({
      target: rocketNodeStaking_contract,
      abi: abi['rocketNodeStaking.getTotalRPLStake'],
      block: ethBlock,
      chain: 'ethereum'
    }), 
    sdk.api.abi.call({ 
      target: rocketVault,
      params: ['rocketDAONodeTrustedActions', rpl],
      abi: abi['rocketVault.balanceOfToken'],
      block: ethBlock,
      chain: 'ethereum'
    }), 
    sdk.api.abi.call({ 
      target: rocketVault,
      params: ['rocketAuctionManager', rpl],
      abi: abi['rocketVault.balanceOfToken'],
      block: ethBlock,
      chain: 'ethereum'
    }), 
  ])

  // ETH staked in Rocketpool pools
  const unmatched_minipools = minipool_count_per_status[0] * 16 // Unmatched minipools
  const pending_minipools = minipool_count_per_status[1] * 32 // Pending minipools (matched but not staking yet)
  const staking_minipools = minipool_count_per_status[2] * 32 // Staking minipools
  const withdrawable_minipools = minipool_count_per_status[3] * 32 // Withdrawable minipools
  // Deposit pool balance
  // rocketDepositPool_balance = solidity.to_float(rp.call("rocketDepositPool.getBalance"))
  // rETH collateral from withdrawn minipools
  // rETH_collateral_from_withdrawn_minipools = solidity.to_float(w3.eth.getBalance(rp.get_address_by_name("rocketTokenRETH")))

  const ETH_TVL = staking_minipools
          + pending_minipools
          + unmatched_minipools
          + withdrawable_minipools
          + parseFloat(rocketDepositPoolBalance) / 1e18

  const balances = {
    [weth]: ETH_TVL * 1e18
  }
  return balances
}

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://api.rocketpool.net/api/apr'
  );
  const dataTvl = await utils.getData(
    'https://api.rocketpool.net/api/mainnet/network/stats'
  );

  const ethPool = {
    pool: '0xae78736cd615f374d3085123a210448e74fc6393',
    chain: utils.formatChain('ETH'),
    project: 'rocketpool',
    symbol: utils.formatSymbol('ETH'),
    tvlUsd: Number(dataTvl.ethStakingTotal) / 1e6,
    apy: apyData.yearlyAPR
  };

  return [ethPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://stake.rocketpool.net/',
};
