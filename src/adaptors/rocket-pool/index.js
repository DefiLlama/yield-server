const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiData } = require('../utils');

// Rocket Pool Saturn contract addresses (resolved from RocketStorage 0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46)
const rocketMinipoolManager = '0xe54B8C641fd96dE5D6747f47C19964c6b824D62C';
const rocketDepositPool = '0xCE15294273CFb9D9b628F4D61636623decDF4fdC';
const rocketNodeManager = '0xcf2d76A7499d3acB5A22ce83c027651e8d76e250';
const rocketMegapoolFactory = '0xD5bffeaa9f373B9C367132772FAA0b88e3F0E38b';
const token = '0xae78736cd615f374d3085123a210448e74fc6393'; //reth

const abi = {
  getBalance: 'function getBalance() view returns (uint256)',
  getStakingMinipoolCount:
    'function getStakingMinipoolCount() view returns (uint256)',
  getNodeCount: 'function getNodeCount() view returns (uint256)',
  getNodeAddresses:
    'function getNodeAddresses(uint256 offset, uint256 limit) view returns (address[])',
  getMegapoolDeployed:
    'function getMegapoolDeployed(address) view returns (bool)',
  getExpectedAddress:
    'function getExpectedAddress(address) view returns (address)',
  getActiveValidatorCount:
    'function getActiveValidatorCount() view returns (uint32)',
  getUserQueuedCapital:
    'function getUserQueuedCapital() view returns (uint256)',
  getNodeQueuedBond: 'function getNodeQueuedBond() view returns (uint256)',
};

// mostly copy pasta from tvl adapter
const getApy = async () => {
  // Get count of minipools that are actually staking.
  // Do NOT use getMinipoolCountPerStatus: exited/finalised minipools keep the
  // "Staking" status forever, so that overcounts by every minipool that ever exited.
  const { output: stakingMinipoolCount } = await sdk.api.abi.call({
    target: rocketMinipoolManager,
    abi: abi.getStakingMinipoolCount,
    chain: 'ethereum',
  });

  // Get idle ETH: deposit pool awaiting staking + rETH withdrawal reserve
  const [
    { output: rocketDepositPoolBalance },
    { output: rocketTokenRETHBalance },
  ] = await Promise.all([
    sdk.api.abi.call({
      target: rocketDepositPool,
      abi: abi.getBalance,
      chain: 'ethereum',
    }),
    sdk.api.eth.getBalance({ target: token, chain: 'ethereum' }),
  ]);

  // Get ETH staked in megapools (Saturn)
  const { output: nodeCount } = await sdk.api.abi.call({
    target: rocketNodeManager,
    abi: abi.getNodeCount,
    chain: 'ethereum',
  });
  const limit = 500;
  const nodePages = [];
  for (let offset = 0; offset < parseInt(nodeCount); offset += limit) {
    nodePages.push({ target: rocketNodeManager, params: [offset, limit] });
  }
  const nodes = (
    await sdk.api.abi.multiCall({
      calls: nodePages,
      abi: abi.getNodeAddresses,
      chain: 'ethereum',
    })
  ).output.flatMap((o) => o.output);
  const deployed = (
    await sdk.api.abi.multiCall({
      target: rocketMegapoolFactory,
      calls: nodes.map((n) => ({ params: [n] })),
      abi: abi.getMegapoolDeployed,
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);
  const deployedNodes = nodes.filter((_, i) => deployed[i]);
  const megapools = (
    await sdk.api.abi.multiCall({
      target: rocketMegapoolFactory,
      calls: deployedNodes.map((n) => ({ params: [n] })),
      abi: abi.getExpectedAddress,
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);
  const megapoolCalls = megapools.map((target) => ({ target }));
  const [activeCounts, userQueued, nodeQueued] = (
    await Promise.all(
      [
        abi.getActiveValidatorCount,
        abi.getUserQueuedCapital,
        abi.getNodeQueuedBond,
      ].map((fnAbi) =>
        sdk.api.abi.multiCall({
          calls: megapoolCalls,
          abi: fnAbi,
          chain: 'ethereum',
        })
      )
    )
  ).map((r) => r.output.map((o) => o.output));

  // ETH staked in Rocketpool pools
  const staking_minipools = parseInt(stakingMinipoolCount) * 32; // Staking minipools
  const staking_megapools = megapools.reduce((sum, _, i) => {
    const staked =
      parseInt(activeCounts[i]) * 32 -
      parseFloat(userQueued[i]) / 1e18 -
      parseFloat(nodeQueued[i]) / 1e18;
    return staked > 0 ? sum + staked : sum;
  }, 0);

  const ETH_TVL =
    staking_minipools +
    staking_megapools +
    parseFloat(rocketDepositPoolBalance) / 1e18 +
    parseFloat(rocketTokenRETHBalance) / 1e18;

  const apyData = (await axios.get('https://api.rocketpool.net/api/apr')).data;

  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'rocket-pool',
      symbol: 'rETH',
      tvlUsd: ETH_TVL * ethPrice,
      apyBase: Number(apyData.yearlyAPR),
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '900',
  timetravel: false,
  apy: getApy,
  url: 'https://stake.rocketpool.net/',
};
