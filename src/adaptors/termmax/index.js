const axios = require('axios');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

const EVENTS = {
  V1: {
    CreateVault:
      'event CreateVault(address indexed vault, address indexed creator, (address admin,address curator,uint256 timelock,address asset,uint256 maxCapacity,string name,string symbol,uint64 performanceFeeRate) indexed initialParams)',
  },
  V1Plus: {
    VaultCreated:
      'event VaultCreated(address indexed vault, address indexed creator, tuple(address admin,address curator,address guardian,uint256 timelock,address asset,uint256 maxCapacity,string name,string symbol,uint64 performanceFeeRate,uint64 minApy,uint64 minIdleFundRate) initialParams)',
  },
  V2: {
    VaultCreated:
      'event VaultCreated(address indexed vault, address indexed creator, (address admin,address curator,address guardian,uint256 timelock,address asset,address pool,uint256 maxCapacity,string name,string symbol,uint64 performanceFeeRate,uint64 minApy) initialParams)',
  },
};

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
    vaultFactoryV1Plus: [
      {
        address: '0x3a9ECfFDBDc595907f65640F810d3dDDDDe2FA61',
        fromBlock: 23138659,
      },
    ],
    vaultFactoryV2: [
      {
        address: '0xF2BDa87CA467eB90A1b68f824cB136baA68a8177',
        fromBlock: 23430000,
      },
      {
        address: '0x5b8B26a6734B5eABDBe6C5A19580Ab2D0424f027',
        fromBlock: 23430000,
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
      {
        address: '0x18b8A9433dBefcd15370F10a75e28149bcc2e301',
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
        fromBlock: 50519589,
      },
    ],
    vaultFactoryV2: [
      {
        address: '0x1401049368eD6AD8194f8bb7E41732c4620F170b',
        fromBlock: 63100000,
      },
      {
        address: '0xdffE6De6de1dB8e1B5Ce77D3222eba401C2573b5',
        fromBlock: 63100000,
      },
    ],
  },
};

// Venus/Fluid static vault-pool mapping (BSC only)
const VENUS_VAULT_POOLS = [
  {
    vault: '0xb5a2224bc5a4f42f319242ac089cdce97ff8a004',
    pool: '0x2d531ed5ef85991efb68d0582a4a3a854037da85',
  },
  {
    vault: '0xe0188f026c90f7b6d410149d21046d33f144de26',
    pool: '0x10ebea27a57bac0ededaf7bf9638e4f331fbcdc9',
  },
  {
    vault: '0x2fb88c622a408699781f140616ca0ea806d0fd96',
    pool: '0xa2640c5901feea8ffe9196c0582e42ead1a3d22b',
  },
];

const VENUS_VAULTS = new Set(VENUS_VAULT_POOLS.map((v) => v.vault));

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
      const logs = await sdk.getEventLogs({
        target: factory.address,
        eventAbi: EVENTS.V1.CreateVault,
        fromBlock: factory.fromBlock,
        toBlock: blockNumber,
        chain,
        onlyIndexer: true,
      });
      for (const log of logs) {
        addresses.push(log.args.vault);
      }
    };
    tasks.push(task());
  }
  await Promise.all(tasks);

  return addresses;
}

async function getVaultsV1({ alias, chain, chainId, number, opportunities }) {
  const vaults = [];

  const addresses = await getVaultV1Addresses(chain, number).then((addresses) =>
    addresses.filter((a) => !VAULT_BLACKLIST[chain].includes(a))
  );
  const calls = addresses.map((target) => ({ target }));
  const [aprs, assets, decimalses, names, totalAssetses] = await Promise.all([
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'uint256:apr',
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'address:asset',
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'uint8:decimals',
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'string:name',
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'uint256:totalAssets',
    }),
  ]);

  const [assetNames, priceMap] = await Promise.all([
    sdk.api.abi.multiCall({
      chain,
      calls: assets.output.map((a) => ({ target: a.output })),
      abi: 'string:symbol',
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

    const vault = {
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
      vault.apyReward = opportunity.apr;

      const breakdowns =
        (opportunity.rewardsRecord && opportunity.rewardsRecord.breakdowns) ||
        [];
      vault.rewardTokens = breakdowns
        .map((b) => b.token.address)
        .filter((a) => a);
    }

    vaults.push(vault);
  }

  return vaults;
}

async function getVaultV1PlusAddresses(chain, blockNumber) {
  const { vaultFactoryV1Plus } = VAULTS[chain];
  if (!vaultFactoryV1Plus) return [];

  const addresses = [];

  const tasks = [];
  for (const factory of vaultFactoryV1Plus) {
    const task = async () => {
      const logs = await sdk.getEventLogs({
        target: factory.address,
        eventAbi: EVENTS.V1Plus.VaultCreated,
        fromBlock: factory.fromBlock,
        toBlock: blockNumber,
        chain,
        onlyIndexer: true,
      });
      for (const log of logs) {
        addresses.push(log.args.vault);
      }
    };
    tasks.push(task());
  }
  await Promise.all(tasks);

  return addresses;
}

async function getVaultsV1Plus({
  alias,
  chain,
  chainId,
  number,
  opportunities,
}) {
  const vaults = [];

  const addresses = await getVaultV1PlusAddresses(chain, number).then(
    (addresses) => addresses.filter((a) => !VAULT_BLACKLIST[chain].includes(a))
  );
  if (addresses.length === 0) return vaults;

  const calls = addresses.map((target) => ({ target }));
  const [apys, assets, decimalses, names, totalAssetses] = await Promise.all([
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'uint256:apy',
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'address:asset',
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'uint8:decimals',
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'string:name',
    }),
    sdk.api.abi.multiCall({
      chain,
      calls,
      abi: 'uint256:totalAssets',
    }),
  ]);

  const [assetNames, priceMap] = await Promise.all([
    sdk.api.abi.multiCall({
      chain,
      calls: assets.output.map((a) => ({ target: a.output })),
      abi: 'string:symbol',
    }),
    getPrices(
      chain,
      assets.output.map((a) => a.output)
    ),
  ]);

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const assetAddress = assets.output[i].output;

    const readableApy = new BigNumber(apys.output[i].output)
      .div(new BigNumber(10).pow(6)) // actual decimals for APY is 8
      .toNumber();
    const tvlUsd = new BigNumber(totalAssetses.output[i].output)
      .div(new BigNumber(10).pow(decimalses.output[i].output))
      .times(priceMap.get(assetAddress) || 0)
      .toNumber();

    const url = new URL(
      `https://app.termmax.ts.finance/earn/${alias}/${address.toLowerCase()}`
    );
    url.searchParams.set('chain', alias);

    const vault = {
      pool: `${address}-${chain.toLowerCase()}`,
      chain,
      project: 'termmax',
      symbol: assetNames.output[i].output,
      tvlUsd,
      apyBase: readableApy,
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
      vault.apyReward = opportunity.apr;

      const breakdowns =
        (opportunity.rewardsRecord && opportunity.rewardsRecord.breakdowns) ||
        [];
      vault.rewardTokens = breakdowns
        .map((b) => b.token.address)
        .filter((a) => a);
    }

    vaults.push(vault);
  }

  return vaults;
}

async function getVaultV2Addresses(chain, blockNumber) {
  const { vaultFactoryV2 } = VAULTS[chain];

  const addresses = [];

  const tasks = [];
  for (const factory of vaultFactoryV2) {
    const task = async () => {
      const logs = await sdk.getEventLogs({
        target: factory.address,
        eventAbi: EVENTS.V2.VaultCreated,
        fromBlock: factory.fromBlock,
        toBlock: blockNumber,
        chain,
        onlyIndexer: true,
      });
      for (const log of logs) {
        addresses.push(log.args.vault);
      }
    };
    tasks.push(task());
  }
  await Promise.all(tasks);

  return addresses;
}

async function getAaveVaultEffectiveApy({
  aavePool,
  apy,
  assetAddress,
  chain,
  poolAddress,
  vaultAddress,
}) {
  const aToken = await sdk.api.abi
    .call({
      target: poolAddress,
      abi: 'address:aToken',
      chain,
    })
    .then((r) => r.output)
    .catch(() => NULL_ADDRESS);
  if (aToken === NULL_ADDRESS) return apy;

  const [assetsInThirdPool, idle] = await Promise.all([
    sdk.api.abi
      .call({
        target: aToken,
        abi: {
          inputs: [{ type: 'address' }],
          name: 'balanceOf',
          outputs: [{ type: 'uint256' }],
        },
        params: [poolAddress],
        chain,
      })
      .then((r) => r.output),
    sdk.api.abi
      .call({
        target: assetAddress,
        abi: {
          inputs: [{ type: 'address' }],
          name: 'balanceOf',
          outputs: [{ type: 'uint256' }],
        },
        params: [poolAddress],
        chain,
      })
      .then((r) => r.output),
  ]);

  const idleFund = new BigNumber(assetsInThirdPool).plus(idle);
  if (idleFund.isZero()) return apy;

  const passiveRatio = new BigNumber(assetsInThirdPool).div(idleFund);

  const currentLiquidityRate = await sdk.api.abi
    .call({
      target: aavePool,
      abi: {
        inputs: [{ type: 'address' }],
        name: 'getReserveData',
        outputs: [
          {
            components: [
              {
                components: [{ type: 'uint256', name: 'data' }],
                name: 'configuration',
                type: 'tuple',
              },
              { type: 'uint128', name: 'liquidityIndex' },
              { type: 'uint128', name: 'currentLiquidityRate' },
              { type: 'uint128', name: 'variableBorrowIndex' },
              { type: 'uint128', name: 'currentVariableBorrowRate' },
              { type: 'uint128', name: 'currentStableBorrowRate' },
              { type: 'uint40', name: 'lastUpdateTimestamp' },
              { type: 'uint16', name: 'id' },
              { type: 'address', name: 'aTokenAddress' },
              { type: 'address', name: 'stableDebtTokenAddress' },
              { type: 'address', name: 'variableDebtTokenAddress' },
              { type: 'address', name: 'interestRateStrategyAddress' },
              { type: 'uint128', name: 'accruedToTreasury' },
              { type: 'uint128', name: 'unbacked' },
              { type: 'uint128', name: 'isolationModeTotalDebt' },
            ],
            name: 'res',
            type: 'tuple',
          },
        ],
      },
      params: [assetAddress],
      chain,
    })
    .then((r) => r.output.currentLiquidityRate);

  const passiveApy = new BigNumber(currentLiquidityRate).div(
    new BigNumber(10).pow(27)
  );
  return new BigNumber(apy).plus(passiveApy.times(passiveRatio)).toNumber();
}

// Fetch Morpho vault APY from GraphQL API
async function getMorphoVaultApy(chainId, vaultAddress) {
  const query = `
    query VaultByAddress($address: String!, $chainId: Int!) {
      vaultByAddress(address: $address, chainId: $chainId) {
        state {
          apy
          netApy
          avgNetApy
        }
      }
    }
  `;
  const res = await axios.post('https://blue-api.morpho.org/graphql', {
    query,
    variables: { address: vaultAddress, chainId },
  });
  const vault = res.data?.data?.vaultByAddress;
  if (!vault) return null;
  return vault.state?.avgNetApy || vault.state?.netApy || vault.state?.apy || 0;
}

async function getMorphoVaultEffectiveApy({
  apy,
  assetAddress,
  chain,
  chainId,
  poolAddress,
}) {
  // Pool contract exposes thirdPool() for Morpho vault address
  const morphoVaultAddress = await sdk.api.abi
    .call({
      target: poolAddress,
      abi: 'address:thirdPool',
      chain,
    })
    .then((r) => r.output)
    .catch(() => NULL_ADDRESS);
  if (morphoVaultAddress === NULL_ADDRESS) return apy;

  const morphoApy = await getMorphoVaultApy(chainId, morphoVaultAddress);
  if (morphoApy === null || morphoApy === 0) return apy;

  // Get Morpho shares held by the pool, then convert to underlying assets
  const morphoShares = await sdk.api.abi
    .call({
      target: morphoVaultAddress,
      abi: {
        inputs: [{ type: 'address' }],
        name: 'balanceOf',
        outputs: [{ type: 'uint256' }],
      },
      params: [poolAddress],
      chain,
    })
    .then((r) => r.output);

  const [assetsInThirdPool, idle] = await Promise.all([
    sdk.api.abi
      .call({
        target: morphoVaultAddress,
        abi: {
          inputs: [{ type: 'uint256' }],
          name: 'convertToAssets',
          outputs: [{ type: 'uint256' }],
        },
        params: [morphoShares],
        chain,
      })
      .then((r) => r.output),
    sdk.api.abi
      .call({
        target: assetAddress,
        abi: {
          inputs: [{ type: 'address' }],
          name: 'balanceOf',
          outputs: [{ type: 'uint256' }],
        },
        params: [poolAddress],
        chain,
      })
      .then((r) => r.output),
  ]);

  const idleFund = new BigNumber(assetsInThirdPool).plus(idle);
  if (idleFund.isZero()) return apy;

  const passiveRatio = new BigNumber(assetsInThirdPool).div(idleFund);
  return new BigNumber(apy)
    .plus(new BigNumber(morphoApy).times(passiveRatio))
    .toNumber();
}

// Fetch Fluid lending tokens for Venus/Fluid APY (BSC only)
async function getFluidLendingTokens() {
  const res = await axios.get(
    'https://api.fluid.instadapp.io/v2/lending/56/tokens'
  );
  return res.data.data;
}

async function getVenusVaultEffectiveApy({
  apy,
  chain,
  poolAddress,
  vaultAddress,
}) {
  const venusMapping = VENUS_VAULT_POOLS.find(
    (v) => v.vault === vaultAddress.toLowerCase()
  );
  if (!venusMapping) return null;

  // Get thirdPool address (Fluid lending token) from pool contract
  const thirdPoolAddress = await sdk.api.abi
    .call({
      target: poolAddress,
      abi: 'address:thirdPool',
      chain,
    })
    .then((r) => r.output.toLowerCase())
    .catch(() => null);
  if (!thirdPoolAddress) return apy;

  const tokens = await getFluidLendingTokens();
  const token = tokens.find(
    (t) => t.address.toLowerCase() === thirdPoolAddress
  );
  if (!token) return apy;

  // Venus/Fluid APY: totalRate is in basis points (1/10000)
  const venusApy = Number(token.totalRate) / 10000;
  return new BigNumber(apy).plus(venusApy).toNumber();
}

async function getVaultEffectiveApy({
  apy,
  assetAddress,
  chain,
  chainId,
  poolAddress,
  vaultAddress,
}) {
  // 1. Check Venus/Fluid (static list, BSC only)
  if (VENUS_VAULTS.has(vaultAddress.toLowerCase())) {
    const venusResult = await getVenusVaultEffectiveApy({
      apy,
      chain,
      poolAddress,
      vaultAddress,
    }).catch(() => null);
    if (venusResult !== null) return venusResult;
  }

  // 2. Try Aave
  const aavePool = await sdk.api.abi
    .call({
      target: poolAddress,
      abi: 'address:aavePool',
      chain,
    })
    .then((r) => r.output)
    .catch(() => NULL_ADDRESS);
  if (aavePool !== NULL_ADDRESS)
    return await getAaveVaultEffectiveApy({
      apy,
      assetAddress,
      chain,
      poolAddress,
      vaultAddress,
      aavePool,
    });

  // 3. Try Morpho
  return await getMorphoVaultEffectiveApy({
    apy,
    assetAddress,
    chain,
    chainId,
    poolAddress,
  }).catch(() => apy);
}

async function getVaultsV2({ alias, chain, chainId, number, opportunities }) {
  const vaults = [];

  const addresses = await getVaultV2Addresses(chain, number).then((addresses) =>
    addresses.filter((a) => !VAULT_BLACKLIST[chain].includes(a))
  );
  const calls = addresses.map((target) => ({ target }));
  const [apys, assets, decimalses, names, totalAssetses, pools] =
    await Promise.all([
      sdk.api.abi.multiCall({
        chain,
        calls,
        abi: 'uint256:apy',
      }),
      sdk.api.abi.multiCall({
        chain,
        calls,
        abi: 'address:asset',
      }),
      sdk.api.abi.multiCall({
        chain,
        calls,
        abi: 'uint8:decimals',
      }),
      sdk.api.abi.multiCall({
        chain,
        calls,
        abi: 'string:name',
      }),
      sdk.api.abi.multiCall({
        chain,
        calls,
        abi: 'uint256:totalAssets',
      }),
      sdk.api.abi.multiCall({
        chain,
        calls,
        abi: 'address:pool',
      }),
    ]);

  const [assetNames, priceMap] = await Promise.all([
    sdk.api.abi.multiCall({
      chain,
      calls: assets.output.map((a) => ({ target: a.output })),
      abi: 'string:symbol',
    }),
    getPrices(
      chain,
      assets.output.map((a) => a.output)
    ),
  ]);

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const assetAddress = assets.output[i].output;

    let apy = new BigNumber(apys.output[i].output)
      .div(new BigNumber(10).pow(8))
      .toNumber();
    if (pools.output[i].output !== NULL_ADDRESS) {
      apy = await getVaultEffectiveApy({
        apy,
        assetAddress,
        chain,
        chainId,
        poolAddress: pools.output[i].output,
        vaultAddress: address,
      });
    }
    const tvlUsd = new BigNumber(totalAssetses.output[i].output)
      .div(new BigNumber(10).pow(decimalses.output[i].output))
      .times(priceMap.get(assetAddress) || 0)
      .toNumber();

    const url = new URL(
      `https://app.termmax.ts.finance/earn/${alias}/${address.toLowerCase()}`
    );
    url.searchParams.set('chain', alias);

    const vault = {
      pool: `${address}-${chain.toLowerCase()}`,
      chain,
      project: 'termmax',
      symbol: assetNames.output[i].output,
      tvlUsd,
      apyBase: apy,
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
      vault.apyReward = opportunity.apr;

      const breakdowns =
        (opportunity.rewardsRecord && opportunity.rewardsRecord.breakdowns) ||
        [];
      vault.rewardTokens = breakdowns
        .map((b) => b.token.address)
        .filter((a) => a);
    }

    vaults.push(vault);
  }

  return vaults;
}

async function getVaultsOnChain(chain, chainId, alias) {
  const vaultsOnChain = [];

  const [opportunities, { number }] = await Promise.all([
    getMerklOpportunities(),
    sdk.api.util.getLatestBlock(chain),
  ]);

  const tasks = [];
  {
    const taskV1 = async () => {
      const vaultsV1 = await getVaultsV1({
        alias,
        chain,
        chainId,
        number,
        opportunities,
      });
      for (const vault of vaultsV1) vaultsOnChain.push(vault);
    };
    tasks.push(taskV1());
  }
  {
    const taskV1Plus = async () => {
      const vaultsV1Plus = await getVaultsV1Plus({
        alias,
        chain,
        chainId,
        number,
        opportunities,
      });
      for (const vault of vaultsV1Plus) vaultsOnChain.push(vault);
    };
    tasks.push(taskV1Plus());
  }
  {
    const taskV2 = async () => {
      const vaultsV2 = await getVaultsV2({
        alias,
        chain,
        chainId,
        number,
        opportunities,
      });
      for (const vault of vaultsV2) vaultsOnChain.push(vault);
    };
    tasks.push(taskV2());
  }
  await Promise.all(tasks);

  return vaultsOnChain;
}

async function apy() {
  const vaults = [];
  const tasks = [];
  for (const key of Object.keys(VAULTS)) {
    const task = async () => {
      const { alias, chain, chainId } = VAULTS[key];
      const vaultsOnChain = await getVaultsOnChain(chain, chainId, alias);
      for (const vault of vaultsOnChain) vaults.push(vault);
    };
    tasks.push(task());
  }
  await Promise.all(tasks);
  return vaults;
}

module.exports = {
  apy,
};
