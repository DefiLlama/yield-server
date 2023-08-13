const ethers = require('ethers');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const VaultABI = require('./VaultABI.json');
const VLPABI = require('./VLPABI.json');
const axios = require('axios');

const BRIDGED_USDC_ADDRESS = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
const VAULT_ADDRESS = '0xC4ABADE3a15064F9E3596943c699032748b13352';
const VLP_ADDRESS = '0xC5b2D9FDa8A82E8DcECD5e9e6e99b78a9188eB05';

const poolsFunction = async () => {
  // 14 days
  let distance = await axios(
    `https://coins.llama.fi/block/arbitrum/${Math.floor(
      new Date(new Date(Date.now() - 12096e5)).getTime() / 1000
    )}`
  );

  sdk.api.config.setProvider(
    'arbitrum',
    new ethers.providers.JsonRpcProvider(
      'https://arb-mainnet.g.alchemy.com/v2/demo'
    )
  );
  
  const current = (
    await sdk.api.abi.call({
      target: VAULT_ADDRESS,
      abi: VaultABI.filter(({ name }) => name === 'getVLPPrice')[0],
      chain: 'arbitrum',
    })
  ).output;

  const totalSupply = (
    await sdk.api.abi.call({
      target: VLP_ADDRESS,
      abi: VLPABI.filter(({ name }) => name === 'totalSupply')[0],
      chain: 'arbitrum',
    })
  ).output;

  const historical = (
    await sdk.api.abi.call({
      target: VAULT_ADDRESS,
      abi: VaultABI.filter(({ name }) => name === 'getVLPPrice')[0],
      chain: 'arbitrum',
      block: distance.data.height,
    })
  ).output;

  const diff = current - historical;

  const APR = 365 * (diff / historical / 14) * 100;

  const VLPPool = {
    pool: `${VAULT_ADDRESS}-arbitrum`.toLowerCase(),
    chain: utils.formatChain('arbitrum'),
    project: 'vela-exchange',
    symbol: 'USDC',
    poolMeta: 'VLP',
    tvlUsd: (Number(totalSupply) / 1e18) * (Number(current) / 1e5),
    apyBase: APR,
    underlyingTokens: [BRIDGED_USDC_ADDRESS],
  };

  return [VLPPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.vela.exchange/staking/vlp',
};
