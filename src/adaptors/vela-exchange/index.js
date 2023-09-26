const ethers = require('ethers');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const VaultABI = require('./VaultABI.json');
const VLPABI = require('./VLPABI.json');
const axios = require('axios');

const BRIDGED_USDC_ADDRESS = { ['arbitrum']: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', ['base']: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' }
const VAULT_ADDRESS = '0xC4ABADE3a15064F9E3596943c699032748b13352';
const VLP_ADDRESS = { ['arbitrum']: '0xC5b2D9FDa8A82E8DcECD5e9e6e99b78a9188eB05', ['base']: '0xEBf154Ee70de5237aB07Bd6428310CbC5e5c7C6E'};
const RPC = { ['arbitrum']: 'https://arb-mainnet.g.alchemy.com/v2/demo', ['base']: 'https://mainnet.base.org'};
const chains = ['arbitrum', 'base']

const poolsFunction = async () => {

  const pools = [];

  for(let i = 0; i < chains.length; i++){
    const chain = chains[i]
  // 14 days
  let distance = await axios(
    `https://coins.llama.fi/block/${chain}/${Math.floor(
      new Date(new Date(Date.now() - 12096e5)).getTime() / 1000
    )}`
  );

  sdk.api.config.setProvider(
    `${chain}`,
    new ethers.providers.JsonRpcProvider(
      `${RPC[chain]}`
    )
  );
  
  const current = (
    await sdk.api.abi.call({
      target: VAULT_ADDRESS,
      abi: VaultABI.filter(({ name }) => name === 'getVLPPrice')[0],
      chain: `${chain}`,
    })
  ).output;

  const totalSupply = (
    await sdk.api.abi.call({
      target: VLP_ADDRESS[chain],
      abi: VLPABI.filter(({ name }) => name === 'totalSupply')[0],
      chain: `${chain}`,
    })
  ).output;

  const historical = (
    await sdk.api.abi.call({
      target: VAULT_ADDRESS,
      abi: VaultABI.filter(({ name }) => name === 'getVLPPrice')[0],
      chain: `${chain}`,
      block: distance.data.height,
    })
  ).output;

  const diff = current - historical;

  const APR = 365 * (diff / historical / 14) * 100;

  const VLPPool = {
    pool: `${VAULT_ADDRESS}-${chain}`.toLowerCase(),
    chain: utils.formatChain(`${chain}`),
    project: 'vela-exchange',
    symbol: 'USDC',
    poolMeta: 'VLP',
    tvlUsd: (Number(totalSupply) / 1e18) * (Number(current) / 1e5),
    apyBase: APR,
    underlyingTokens: [BRIDGED_USDC_ADDRESS[chain]],
  };
  pools.push(VLPPool)
}

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.vela.exchange/staking/vlp',
};
