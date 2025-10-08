const axios = require('axios');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const { default: pools } = require('../concentrator/pools');
const { Interface } = require('ethers/lib/utils');

const EVENTS = {
  V1: {
    CreateVault:
      'event CreateVault(address indexed vault, address indexed creator, (address admin,address curator,uint256 timelock,address asset,uint256 maxCapacity,string name,string symbol,uint64 performanceFeeRate) indexed initialParams)',
  },
  V2: {
    VaultCreated:
      'event VaultCreated(address indexed vault, address indexed creator, (address admin,address curator,address guardian,uint256 timelock,address asset,address pool,uint256 maxCapacity,string name,string symbol,uint64 performanceFeeRate,uint64 minApy) initialParams)',
  },
};
const v1iface = new Interface([EVENTS.V1.CreateVault]);
const v2iface = new Interface([EVENTS.V2.VaultCreated]);

const VAULTS = {
  ethereum: {
    alias: 'eth',
    chain: 'ethereum',
    chainId: 1,
    vaultFactory: [
      {
        address: '0x01D8C1e0584751085a876892151Bf8490e862E3E',
        fromBlock: 22174789,
      },
      {
        address: '0x4778CBf91d8369843281c8f5a2D7b56d1420dFF5',
        fromBlock: 22283092,
      },
    ],
    vaultFactoryV2: [
      {
        address: '0xF2BDa87CA467eB90A1b68f824cB136baA68a8177',
        fromBlock: 23445703,
      },
      {
        address: '0x5b8B26a6734B5eABDBe6C5A19580Ab2D0424f027',
        fromBlock: 23488637,
      },
    ],
  },
  arbitrum: {
    alias: 'arb',
    chain: 'arbitrum',
    chainId: 42161,
    vaultFactory: [
      {
        address: '0x929CBcb8150aD59DB63c92A7dAEc07b30d38bA79',
        fromBlock: 322193571,
      },
    ],
    vaultFactoryV2: [
      {
        address: '0xa7c93162962D050098f4BB44E88661517484C5EB',
        fromBlock: 385228046,
      },
    ],
  },
  bsc: {
    alias: 'bnb',
    chain: 'bsc',
    chainId: 56,
    vaultFactory: [
      {
        address: '0x48bCd27e208dC973C3F56812F762077A90E88Cea',
        fromBlock: 50519690,
      },
    ],
    vaultFactoryV2: [
      {
        address: '0x1401049368eD6AD8194f8bb7E41732c4620F170b',
        fromBlock: 63192842,
      },
    ],
  },
};

const VAULT_BLACKLIST = {
  arbitrum: [
    '0x8531dC1606818A3bc3D26207a63641ac2F1f6Dc8', // misconfigured asset
  ],
  ethereum: [],
  bsc: [
    '0xe5E01B82904a49Ce5a670c1B7488C3f29433088a', // misconfigured asset
  ],
};

async function getMerklOpportunities() {
  const res = await axios.get(
    new URL('https://api.merkl.xyz/v4/opportunities?name=termmax')
  );
  return res.data.filter((o) => o.status === 'LIVE');
}

async function getPrices(chain, addresses) {
  const priceMap = new Map();

  const tasks = [];
  for (const address of addresses) {
    const url = new URL(
      `https://coins.llama.fi/prices/current/${chain}:${address}`
    );
    tasks.push(
      axios.get(url).then((response) => {
        const priceKey = `${chain}:${address}`;
        priceMap.set(address, response.data.coins[priceKey]?.price || 0);
      })
    );
  }
  await Promise.all(tasks);

  return priceMap;
}

async function getVaultV1Addresses(chain, blockNumber) {
  const { vaultFactory } = VAULTS[chain];

  const addresses = [];

  const tasks = [];
  for (const factory of vaultFactory) {
    const task = async () => {
      const { output } = await sdk.api2.util.getLogs({
        target: factory.address,
        topic: '',
        fromBlock: factory.fromBlock,
        toBlock: blockNumber,
        keys: [],
        topics: [v1iface.getEventTopic('CreateVault')],
        chain,
      });
      const events = output
        .filter((e) => !e.removed)
        .map((e) => v1iface.parseLog(e));
      for (const { args } of events) {
        const [vault] = args;
        addresses.push(vault);
      }
    };
    tasks.push(task());
  }
  await Promise.all(tasks);

  return addresses;
}

async function getV1Pools(chain, chainId, alias, opportunities) {
  const pools = [];

  const { number } = await sdk.api.util.getLatestBlock(chain);

  const addresses = await getVaultV1Addresses(chain, number).then((addresses) =>
    addresses.filter((a) => !VAULT_BLACKLIST[chain].includes(a))
  );
  const calls = addresses.map((target) => ({ target }));
  const [aprs, assets, decimalses, names, totalAssetses] = await Promise.all([
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: {
        name: 'apr',
        type: 'function',
        inputs: [],
        outputs: [{ type: 'uint256' }],
      },
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: {
        name: 'asset',
        type: 'function',
        inputs: [],
        outputs: [{ type: 'address' }],
      },
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: {
        name: 'decimals',
        type: 'function',
        inputs: [],
        outputs: [{ type: 'uint8' }],
      },
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: {
        name: 'name',
        type: 'function',
        inputs: [],
        outputs: [{ type: 'string' }],
      },
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: {
        name: 'totalAssets',
        type: 'function',
        inputs: [],
        outputs: [{ type: 'uint256' }],
      },
    }),
  ]);

  const [assetNames, priceMap] = await Promise.all([
    sdk.api.abi.multiCall({
      chain,
      calls: assets.output.map((a) => ({ target: a.output })),
      abi: {
        name: 'name',
        type: 'function',
        inputs: [],
        outputs: [{ type: 'string' }],
      },
    }),
    getPrices(
      chain,
      assets.output.map((a) => a.output)
    ),
  ]);

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const assetAddress = assets.output[i].output;

    const readableApr = new BigNumber(aprs.output[i].output)
      .div(new BigNumber(10).pow(6)) // actual decimals for APR is 8
      .toNumber();
    const tvlUsd = new BigNumber(totalAssetses.output[i].output)
      .div(new BigNumber(10).pow(decimalses.output[i].output))
      .times(priceMap.get(assetAddress) || 0)
      .toNumber();

    const url = new URL(
      `https://app.termmax.ts.finance/earn/${alias}/${address.toLowerCase()}`
    );
    url.searchParams.set('chain', alias);

    const pool = {
      pool: `${address}-${chain.toLowerCase()}`,
      chain,
      project: 'termmax',
      symbol: assetNames.output[i].output,
      tvlUsd,
      apyBase: readableApr,
      url: String(url),
      underlyingTokens: [assetAddress],
      poolMeta: names.output[i].output,
    };

    const opportunity = opportunities.find(
      (o) =>
        o.chainId === chainId &&
        o.identifier.toLowerCase() === address.toLowerCase()
    );
    if (opportunity) {
      pool.apyReward = opportunity.apr;

      const breakdowns =
        (opportunity.rewardsRecord && opportunity.rewardsRecord.breakdowns) ||
        [];
      pool.rewardTokens = breakdowns
        .map((b) => b.token.address)
        .filter((a) => a);
    }

    pools.push(pool);
  }

  return pools;
}

async function getVaultV2Addresses(chain, blockNumber) {
  const { vaultFactoryV2 } = VAULTS[chain];

  const addresses = [];

  const tasks = [];
  for (const factory of vaultFactoryV2) {
    const task = async () => {
      const { output } = await sdk.api2.util.getLogs({
        target: factory.address,
        topic: '',
        fromBlock: factory.fromBlock,
        toBlock: blockNumber,
        keys: [],
        topics: [v2iface.getEventTopic('VaultCreated')],
        chain,
      });
      const events = output
        .filter((e) => !e.removed)
        .map((e) => v2iface.parseLog(e));
      for (const { args } of events) {
        const [vault] = args;
        addresses.push(vault);
      }
    };
    tasks.push(task());
  }
  await Promise.all(tasks);

  return addresses;
}

async function apy() {
  const pools = [];

  const opportunities = await getMerklOpportunities();

  const tasks = [];
  for (const [chain, { chainId, alias }] of Object.entries(VAULTS)) {
    const task = async () => {
      const v1Pools = await getV1Pools(chain, chainId, alias, opportunities);
      for (const pool of v1Pools) pools.push(pool);
    };
    tasks.push(task());
  }
  await Promise.all(tasks);

  return pools;
}

module.exports = {
  apy,
};
