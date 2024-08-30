const axios = require('axios');
const ethers = require('ethers');
const utils = require('../utils');

const sdk = require('@defillama/sdk');

const CHAINS = {
  bsc: 'bsc',
  linea: 'linea',
  base: 'base',
};

const config = {
  [CHAINS.bsc]: {
    vaultAddress: '0x03A074D130144FcE6883F7EA3884C0a783d85Fb3',
    symbol: 'USDT-USDC',
    underlyingTokens: [
      '0x55d398326f99059fF775485246999027B3197955',
      '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    ],
  },
  [CHAINS.linea]: {
    vaultAddress: '0x03A074D130144FcE6883F7EA3884C0a783d85Fb3',
    symbol: 'USDC.e-USDT',
    underlyingTokens: [
      '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
      '0xA219439258ca9da29E9Cc4cE5596924745e12B93',
    ],
  },
  [CHAINS.base]: {
    vaultAddress: '0x03A074D130144FcE6883F7EA3884C0a783d85Fb3',
    symbol: 'USDbC-USDС',
    underlyingTokens: [
      '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ],
  },
};

const getUrl = (path, queries) =>
  `https://stats-kixqx.ondigitalocean.app/${path}${queries}`;

const getTestUrl = (path, queries) => `http://localhost:8080/${path}${queries}`;

const pairsToObj = (pairs) =>
  pairs.reduce((acc, [el1, el2]) => ({ ...acc, [el1]: el2 }), {});

const getMultiStrategyVaultsApy = async () => {
  const ONE_DAY = 86400 * 1000; // in milliseconds
  const fromDate = new Date(new Date().getTime() - 7 * ONE_DAY); // 7 days ago like

  const vaultsData = pairsToObj(
    await Promise.all(
      Object.keys(CHAINS).map(async (chain) => {
        const queries = `?from=${fromDate.getTime()}&chain=${CHAINS[chain]}`;
        const apyResponse = await axios.get(getUrl('daily-apy', queries));

        let apy = 0;
        if (apyResponse.data.status === 'multistrategy_vault_apy_calculated') {
          apy = Number(apyResponse.data.data.apy);
        }

        const {
          output: [tvlUsdBN],
        } = await sdk.api.abi.call({
          target: config[chain].vaultAddress,
          abi: abis.getStrategiesValue,
          chain,
        });

        const tvlUsd = Number(ethers.utils.formatUnits(tvlUsdBN, 18)) || 0;

        return [
          chain,
          {
            tvlUsd,
            apy,
          },
        ];
      })
    )
  );

  const pools = Object.keys(CHAINS).map((chain) => {
    return {
      pool: `${config[chain].vaultAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'clip-finance',
      symbol: config[chain].symbol,
      tvlUsd: vaultsData[chain].tvlUsd,
      apy: vaultsData[chain].apy,
      underlyingTokens: config[chain].underlyingTokens,
    };
  });

  return pools;
};

const getPoolsApy = async () => {
  const pools = [];

  // const poolsData = pairsToObj(
  await Promise.all(
    Object.keys(CHAINS).map(async (chain) => {
      const apyResponse = await axios.get(
        getTestUrl('pools-apy', `?chain=${CHAINS[chain]}`)
      );
      console.log('apyResponse', apyResponse.data.data);
      const tvlResponse = await axios.get(
        getTestUrl('pools-tvl', `?chain=${CHAINS[chain]}`)
      );
      console.log('tvlResponse', tvlResponse.data.data);

      // const poolsKeys = new Set([
      //   ...Object.keys(apyResponse.data.data),
      //   ...Object.keys(tvlResponse.data.data),
      // ]);

      // console.log('poolsKeys', poolsKeys);
    })
  );
  // );
};

const getApy = async () => {
  const multiStrategyVaultsApy = await getMultiStrategyVaultsApy();
  await getPoolsApy();

  return [...multiStrategyVaultsApy];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://clip.finance/',
};

const abis = {
  getStrategiesValue: {
    inputs: [],
    name: 'getStrategiesValue',
    outputs: [
      {
        internalType: 'uint256',
        name: 'totalBalance',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'totalStrategyBalance',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'totalIdleStrategyBalance',
        type: 'uint256',
      },
      {
        internalType: 'uint256[]',
        name: 'balances',
        type: 'uint256[]',
      },
      {
        internalType: 'uint256[]',
        name: 'idleBalances',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};
