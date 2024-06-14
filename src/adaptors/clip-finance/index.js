const ADDRESSES = require('../assets.json')
const axios = require('axios');
const ethers = require('ethers');
const utils = require('../utils');

const sdk = require('@defillama/sdk');

const CHAINS = {
  bsc: 'bsc',
  linea: 'linea',
  base : 'base'
};

const config = {
  [CHAINS.bsc]: {
    vaultAddress: '0x03A074D130144FcE6883F7EA3884C0a783d85Fb3',
    symbol: 'USDT-USDC',
    underlyingTokens: [
      ADDRESSES.bsc.USDT,
      ADDRESSES.bsc.USDC,
    ],
  },
  [CHAINS.linea]: {
    vaultAddress: '0x03A074D130144FcE6883F7EA3884C0a783d85Fb3',
    symbol: 'USDC.e-USDT',
    underlyingTokens: [
      ADDRESSES.linea.USDC,
      ADDRESSES.linea.USDT,
    ],
  },
  [CHAINS.base]: {
    vaultAddress: '0x03A074D130144FcE6883F7EA3884C0a783d85Fb3',
    symbol: 'USDbC-USDС',
    underlyingTokens: [
      ADDRESSES.base.USDbC,
      ADDRESSES.base.USDC,
    ],
  }
};

const getUrl = (chain, from) =>
  `https://stats-kixqx.ondigitalocean.app/daily-apy?from=${from}&chain=${chain}`;

const pairsToObj = (pairs) =>
  pairs.reduce((acc, [el1, el2]) => ({ ...acc, [el1]: el2 }), {});

const getApy = async () => {
  const ONE_DAY = 86400 * 1000; // in milliseconds
  const fromDate = new Date(new Date().getTime() - 7 * ONE_DAY); // 7 days ago like

  const vaultsData = pairsToObj(
    await Promise.all(
      Object.keys(CHAINS).map(async (chain) => {
        const apyResponse = await axios.get(
          getUrl(CHAINS[chain], fromDate.getTime())
        );

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