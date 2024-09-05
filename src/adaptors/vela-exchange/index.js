const ethers = require('ethers');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const VaultABI = require('./VaultABI.json');
const VLPABI = require('./VLPABI.json');
const RewarderABI = require('./RewarderABI.json');
const TokenFarmABI = require('./TokenFarmABI.json');
const axios = require('axios');

const VELA_ADDRESS = {
  ['arbitrum']: '0x088cd8f5eF3652623c22D48b1605DCfE860Cd704',
  ['base']: '0x5A76A56ad937335168b30dF3AA1327277421C6Ae',
};
const USDC_ADDRESS = {
  ['arbitrum']: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  ['base']: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
};

const GHO_ADDRESS = {
  ['arbitrum']: '0x7dfF72693f6A4149b17e7C6314655f6A9F7c8B33',
};

const VELA_REWARDER_ADDRESS = {
  ['arbitrum']: '0x1353e6C747Da576cEB760862f610b3ec5DBA0D21',
  ['base']: '0xDD5aD536E987bF72Dddc1BF518f3bb8Cc2c615e2'
}

const TOKEN_FARM_ADDRESS = {
    ['arbitrum']: '0x60b8C145235A31f1949a831803768bF37d7Ab7AA',
    ['base']: '0x00B01710c2098b883C4F93dD093bE8Cf605a7BDe'
}

const VAULT_ADDRESS = '0xC4ABADE3a15064F9E3596943c699032748b13352';

const VLP_ADDRESS = {
  ['arbitrum']: '0xC5b2D9FDa8A82E8DcECD5e9e6e99b78a9188eB05',
  ['base']: '0xEBf154Ee70de5237aB07Bd6428310CbC5e5c7C6E',
};

const RPC = {
  ['arbitrum']: 'https://arbitrum.llamarpc.com',
  ['base']: 'https://mainnet.base.org',
};

const chains = ['arbitrum', 'base'];

const VAULT_START_TIME = {
  ['arbitrum']: new Date(Date.UTC(2023, 5, 26, 4, 38)).getTime(),
  ['base']: new Date(Date.UTC(2023, 8, 5, 15, 0)).getTime(),
};

const poolsFunction = async () => {
  const pools = [];
  const secondsPerYear = 31536000;

  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];

    const velaPrice = (
      await utils.getPrices(
        ['0x088cd8f5eF3652623c22D48b1605DCfE860Cd704'],
        'arbitrum'
      )
    ).pricesBySymbol.vela;

    sdk.api.config.setProvider(
      `${chain}`,
      new ethers.providers.JsonRpcProvider(`${RPC[chain]}`)
    );

    const esVela =       (
      await sdk.api.abi.call({
        target: TOKEN_FARM_ADDRESS[chain],
        abi: TokenFarmABI.filter(({ name }) => name === 'esVELA')[0],
        chain: `${chain}`,
      })
    ).output

    const poolTotalLP = ethers.utils.formatUnits(
      (
        await sdk.api.abi.call({
          target: TOKEN_FARM_ADDRESS[chain],
          abi: TokenFarmABI.filter(({ name }) => name === 'poolTotalLp')[0],
          chain: `${chain}`,
          params: [esVela]
        })
      ).output,
      18
    );

    const poolTotal = poolTotalLP * parseFloat(velaPrice)
    const rewardsPerSecUSDC = ethers.utils.formatUnits(
      (
        await sdk.api.abi.call({
          target: VELA_REWARDER_ADDRESS[chain],
          abi: RewarderABI.filter(({ name }) => name === 'poolRewardsPerSec')[0],
          chain: `${chain}`,
          params: [esVela]
        })
      ).output.rewardsPerSec[1],
      18
    );


    const USDC_ROI = (100 * (parseFloat(rewardsPerSecUSDC) * 365 * 86400)) / poolTotal

    const current = ethers.utils.formatUnits(
      (
        await sdk.api.abi.call({
          target: VAULT_ADDRESS,
          abi: VaultABI.filter(({ name }) => name === 'getVLPPrice')[0],
          chain: `${chain}`,
        })
      ).output,
      5
    );

    const totalSupply = (
      await sdk.api.abi.call({
        target: VLP_ADDRESS[chain],
        abi: VLPABI.filter(({ name }) => name === 'totalSupply')[0],
        chain: `${chain}`,
      })
    ).output;

    const diff = current - 1;
    const now = new Date();
    const dayDiff = Math.floor(
      (new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours(),
          now.getUTCMinutes()
        )
      ).getTime() -
        VAULT_START_TIME[chain]) /
        (24 * 60 * 60 * 1000)
    );
    /// APR Calculations ///
    const APR = 365 * (diff / 1 / dayDiff) * 100;

    const VLPPool = {
      pool: `${VAULT_ADDRESS}-${chain}`.toLowerCase(),
      chain: utils.formatChain(`${chain}`),
      project: 'vela-exchange',
      symbol: 'USDC',
      poolMeta: 'VLP',
      tvlUsd: (Number(totalSupply) / 1e18) * Number(current),
      apyBase: APR,
      underlyingTokens: chain === 'arbitrum'? [USDC_ADDRESS[chain], GHO_ADDRESS[chain]] : [USDC_ADDRESS[chain]],
    };

    const GHOPool = {
      pool: `${VAULT_ADDRESS}-${GHO_ADDRESS[chain]}-${chain}`.toLowerCase(),
      chain: utils.formatChain(`${chain}`),
      project: 'vela-exchange',
      symbol: 'GHO',
      poolMeta: 'VLP',
      tvlUsd: (Number(totalSupply) / 1e18) * Number(current),
      apyBase: APR,
      underlyingTokens: [GHO_ADDRESS[chain], USDC_ADDRESS[chain]],
    };
  
    const VelaPool = {
      pool: `${TOKEN_FARM_ADDRESS[chain]}-${chain}`.toLowerCase(),
      chain: utils.formatChain(`${chain}`),
      project: 'vela-exchange',
      symbol: 'esVELA',
      poolMeta: 'esVela vesting is up to 6 months',
      tvlUsd: Number(poolTotalLP) * Number(velaPrice),
      apyReward: (USDC_ROI * current) + APR,
      underlyingTokens: [VELA_ADDRESS[chain]],
      rewardTokens: [USDC_ADDRESS[chain]]
    };

    pools.push(VLPPool);
    pools.push(VelaPool)
    if(chain === 'arbitrum'){ pools.push(GHOPool) }

  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.vela.exchange/staking/vlp',
};
