const utils = require('../utils');

const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const ethers = require('ethers');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');

const { facadeAbi, rtokenAbi } = require('./abi');

const chains = [
  {
    chainName: 'base',
    facade: '0xeb2071e9b542555e90e6e4e1f83fa17423583991',
    graph:
      'https://subgraph.satsuma-prod.com/327d6f1d3de6/reserve/reserve-base/api',
  },
  {
    chainName: 'ethereum',
    facade: '0x2C7ca56342177343A2954C250702Fd464f4d0613',
    graph:
      'https://subgraph.satsuma-prod.com/327d6f1d3de6/reserve/reserve-mainnet/api',
  },
  {
    chainName: 'arbitrum',
    facade: '0x387A0C36681A22F728ab54426356F4CAa6bB48a9',
    graph:
      'https://subgraph.satsuma-prod.com/327d6f1d3de6/reserve/reserve-arbitrum/api',
  },
];

const rtokenQuery = gql`
  {
    rtokens(orderBy: cumulativeUniqueUsers, orderDirection: desc) {
      id
      cumulativeUniqueUsers
      targetUnits
      rsrStaked
      token {
        name
        symbol
        lastPriceUSD
        holderCount
        transferCount
        totalSupply
        cumulativeVolume
      }
    }
  }
`;

const poolsMap = {
  // Ethereum
  '405d8dad-5c99-4c91-90d3-82813ade1ff1': 'sadai',
  'a349fea4-d780-4e16-973e-70ca9b606db2': 'sausdc',
  '60d657c9-5f63-4771-a85b-2cf8d507ec00': 'sausdt',
  '1d53fa29-b918-4d74-9508-8fcf8173ca51': 'sausdp',
  'cc110152-36c2-4e10-9c12-c5b4eb662143': 'cdai',
  'cefa9bb8-c230-459a-a855-3b94e96acd8c': 'cusdc',
  '57647093-2868-4e65-97ab-9cae8ec74e7d': 'cusdt',
  '6c2b7a5c-6c4f-49ea-a08c-0366b772f2c2': 'cusdp',
  '1d876729-4445-4623-8b6b-c5290db5d100': 'cwbtc',
  '1e5da7c6-59bb-49bd-9f97-4f4fceeffad4': 'ceth',
  'fa4d7ee4-0001-4133-9e8d-cf7d5d194a91': 'fusdc',
  'ed227286-abb0-4a34-ada5-39f7ebd81afb': 'fdai',
  '6600934f-6323-447d-8a7d-67fbede8529d': 'fusdt',
  '747c1d2a-c668-4682-b9f9-296708a3dd90': 'wsteth',
  'd4b3c522-6127-4b89-bedf-83641cdcd2eb': 'reth',
  '7da72d09-56ca-4ec5-a45f-59114353e487': 'wcusdcv3',
  '8a20c472-142c-4442-b724-40f2183c073e': 'stkcvxmim-3lp3crv-f',
  'ad3d7253-fb8f-402f-a6f8-821bc0a055cb': 'stkcvxcrv3crypto',
  '7394f1bc-840a-4ff0-9e87-5e0ef932943a': 'stkcvx3crv',
  'c04005c9-7e34-41a6-91c4-295834ed8ac0': 'stkcvxeusd3crv-f',
  '325ad2d6-70b1-48d7-a557-c2c99a036f87': 'mrp-ausdc',
  '1343a280-7812-4bc3-8f98-d1c37e11d271': 'mrp-ausdt',
  'b8bcdf8e-96ed-40ca-a7aa-aa048b9874e5': 'mrp-adai',
  '7be52986-18c2-450f-b74b-d65fb1205bbf': 'mrp-aweth',
  'ff61171d-d7b0-4989-816c-b9bf02a15f00': 'mrp-awbtc',
  'eab8d63d-8a8f-48cb-8027-583508831d24': 'mrp-asteth',
  '0f45d730-b279-4629-8e11-ccb5cc3038b4': 'cbeth',
  'c8a24fee-ec00-4f38-86c0-9f6daebc4225': 'sdai',
  '55de30c3-bf9f-4d4e-9e0b-536a8ef5ab35': 'sfrax',
  'aa70268e-4b52-42bf-a116-608b370f9501': 'saethusdc',
  'd118f505-e75f-4152-bad3-49a2dc7482bf': 'saethpyusd',
  '01146cce-9140-4e03-9a2e-82c99ccc42f1': 'stkcvxpyusdusdc',
  '77020688-e1f9-443c-9388-e51ace15cc32': 'sfrxeth',
  'bf3815bb-1059-4f24-90a3-14998e8493fa': 're7weth',
  'a3ffd3fe-b21c-44eb-94d5-22c80057a600': 'stkcvxcrvusdusdt-f',
  '755fcec6-f4fd-4150-9184-60f099206694': 'stkcvxcrvusdusdc-f',
  'd1dacce1-7815-420c-bb6d-d3c4320e1b2a': 'steakpyusd',
  '043a8330-bc29-4164-aa1c-28de7bf87755': 'bbusdt',
  'a44febf3-34f6-4cd5-8ab1-f246ebe49f9e': 'steakusdc',
  '74346f6f-c7ee-4506-a204-baf48e13decb': 'stkcvxeth+eth-f',

  // Base
  'df65c4f4-e33a-481c-bac8-0c2252867c93': 'wcusdbcv3',
  '0c8567f8-ba5b-41ad-80de-00a71895eb19': 'wcusdcv3',
  '9d09b0be-f6c2-463a-ad2c-4552b3e12bd9': 'wsgusdbc',
  '7e0661bf-8cf3-45e6-9424-31916d4c7b84': 'sabasusdc',
  '833ec61b-f9e6-46ac-9eff-2785808b2389': 'sabasusdbc',

  // Arbitrum
  'd9c395b9-00d0-4426-a6b3-572a6dd68e54': 'wcusdcv3',
  'd9fa8e14-0447-4207-9ae8-7810199dfa1f': 'saarbusdcn',
  '3a6cc030-738d-4e19-8a40-e63e9c4d5a6f': 'saarbusdt',
}

const rtokenTvl = (rtoken) =>
  (rtoken.token?.totalSupply / 1e18) * rtoken.token?.lastPriceUSD || 0;

const apyChain = async (chainProps) => {
  const { chainName, facade, graph } = chainProps;
  const poolsData = (await utils.getData('https://yields.llama.fi/pools'))
    ?.data;

const poolsInfo = (poolsData || [])
  .filter((pool) => poolsMap[pool.pool])
  .reduce((acc, pool) => {
    const chain = pool.chain.toLowerCase()
    const poolsByChain = acc[chain] || {}
    acc[chain] = {
      ...poolsByChain,
      [poolsMap[pool.pool]]: {
        yield: pool.apyMean30d || 0,
        underlyings: pool.underlyingTokens,
      },
    }
    return acc
  }, {})

  const { rtokens } = await request(graph, rtokenQuery);

  const filteredRtokens = rtokens.filter(
    (rtoken) => rtoken && rtokenTvl(rtoken) > 10_000
  );

  const rtokenAddresses = filteredRtokens.map((rtoken) => rtoken.id);

  const { output: mainAddresses } = await sdk.api.abi.multiCall({
    abi: rtokenAbi.find(({ name }) => name === 'main'),
    chain: chainName,
    calls: rtokenAddresses.map((rtokenAddress) => ({
      target: rtokenAddress,
      params: [],
    })),
  });

  const { output: distributorAddresses } = await sdk.api.abi.multiCall({
    chain: chainName,
    abi: rtokenAbi.find(({ name }) => name === 'distributor'),
    calls: mainAddresses.map(({ output: mainAddress }) => ({
      target: mainAddress,
      params: [],
    })),
  });

  const { output: distributions } = await sdk.api.abi.multiCall({
    chain: chainName,
    abi: rtokenAbi.find(({ name }) => name === 'distribution'),
    calls: distributorAddresses.map(({ output: distributorAddress }) => ({
      target: distributorAddress,
      params: ['0x0000000000000000000000000000000000000001'],
    })),
  });

  const { output: basketBreakdowns } = await sdk.api.abi.multiCall({
    chain: chainName,
    abi: facadeAbi.find(({ name }) => name === 'basketBreakdown'),
    calls: rtokenAddresses.map((rtokenAddress) => ({
      target: facade,
      params: [rtokenAddress],
    })),
  });

  const reservePools = Promise.all(
    filteredRtokens.map(async (rtoken, i) => {
      if (!rtoken) return null;

      const { output: symbols } = await sdk.api.abi.multiCall({
        chain: chainName,
        abi: 'erc20:symbol',
        calls: basketBreakdowns[i].output.erc20s.map((erc20) => ({
          target: erc20,
          params: [],
        })),
      });

      const fallbackPools = Object.values(poolsInfo).reduce((acc, pools) => {
        Object.keys(pools).forEach((pool) => {
          acc[pool] = pools[pool]
        })
        return acc
      })
      
      let apyBase = BigNumber(0);
      let totalShares = BigNumber(0);
      const underlyingTokens = [];
      
      for (let j = 0; j < symbols.length; j++) {
        const token = basketBreakdowns[i].output.erc20s[j];
        const shares = new BigNumber(basketBreakdowns[i].output.uoaShares[j]);
        totalShares = totalShares.plus(shares);
      
        const symbol = symbols[j]?.output?.toLowerCase()
        const pool = poolsInfo[chainName][symbol] || fallbackPools[symbol]
      
        if (pool?.yield)
          apyBase = apyBase.plus(shares.times(new BigNumber(pool.yield)));
      
        if (pool?.underlyings?.length)
          underlyingTokens.push(...pool.underlyings);
      }

      if (!totalShares.isZero()) {
        apyBase = apyBase.div(totalShares);
      }

      return {
        pool: rtoken.id,
        chain: chainName,
        project: 'reserve-protocol',
        symbol: rtoken.token?.symbol,
        tvlUsd: rtokenTvl(rtoken),
        apyBase:
          (apyBase.toNumber() * (distributions[i].output.rTokenDist || 10000)) /
          10000, // Revenue distribution to holders
        apyReward: 0,
        rewardTokens: [],
        underlyingTokens: underlyingTokens,
        url: `https://register.app/#/overview?token=${rtoken.id}`,
      };
    })
  );

  return reservePools;
};

const apy = async () => {
  const pools = await Promise.all(
    chains.map(async (chainProps) => await apyChain(chainProps))
  );

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy,
};
