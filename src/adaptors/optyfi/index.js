const superagent = require('superagent');
const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const { default: BigNumber } = require('bignumber.js');
const { ethers } = require('ethers');
const optyfi_api = 'https://api.opty.fi';
const get_vaults_api = `${optyfi_api}/v1/yield/vaults`;
const get_strategy_apy_api = `${optyfi_api}/v1/yield/strategy_score/strategy_hash`;
const abi = {
  totalSupply: {
    inputs: [],
    name: 'totalSupply',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  investStrategyHash: {
    inputs: [],
    name: 'investStrategyHash',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  getPricePerFullShare: {
    inputs: [],
    name: 'getPricePerFullShare',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  decimals: {
    inputs: [],
    name: 'decimals',
    outputs: [
      {
        internalType: 'uint8',
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};

const EMPTY_STRATEGY_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

async function getTVL(chainName, tokenAddress, decimals) {
  const totalSupply = (
    await sdk.api.abi.call({
      target: tokenAddress,
      abi: abi.totalSupply,
      chain: chainName,
    })
  ).output;

  const pricePerFullShare = (
    await sdk.api.abi.call({
      target: tokenAddress,
      abi: abi.getPricePerFullShare,
      chain: chainName,
    })
  ).output;
  const convertedPricePerFullShare = ethers.utils.formatUnits(
    pricePerFullShare,
    18
  );
  const tvl = BigNumber(convertedPricePerFullShare)
    .multipliedBy(BigNumber(totalSupply))
    .div(`1e${decimals}`);
  return Number(tvl);
}

const main = async () => {
  const vaults = (await axios.get(get_vaults_api)).data.items;
  const filteredVaults = [];
  const vaultsAddresses = [];
  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    if (!vault.is_staging && [1, 137].includes(vault.chain.chain_id)) {
      filteredVaults.push(vault);
      const underlyingToken = `${vault.chain.chain_name.toLowerCase()}:${
        vault.vault_underlying_token.address
      }`;
      if (!vaultsAddresses.includes(underlyingToken)) {
        vaultsAddresses.push(underlyingToken);
      }
    }
  }
  const keys = vaultsAddresses.join(',').toLowerCase();
  const usdPrice = (
    await superagent.get(`https://coins.llama.fi/prices/current/${keys}`)
  ).body.coins;
  const pools = [];
  for (let i = 0; i < filteredVaults.length; i++) {
    const vault = filteredVaults[i];
    const tvl = await getTVL(
      vault.chain.chain_name,
      vault.vault_token.address,
      vault.vault_token.decimals
    );
    const strategyHash = (
      await sdk.api.abi.call({
        target: vault.vault_token.address,
        abi: abi.investStrategyHash,
        chain: vault.chain.chain_name,
      })
    ).output;
    const tvlUsd = Number(
      new BigNumber(tvl).multipliedBy(
        usdPrice[
          `${vault.chain.chain_name.toLowerCase()}:${vault.vault_underlying_token.address.toLowerCase()}`
        ].price
      )
    );
    let apyBase = 0;
    if (strategyHash !== EMPTY_STRATEGY_HASH) {
      const fetchedApy = (
        await axios.get(`${get_strategy_apy_api}/${strategyHash}`)
      ).data;
      apyBase = Number(fetchedApy.strategy_score.total_apy);
    }
    const opSymbol = vault.vault_token.symbol.split('-');
    pools.push({
      pool: `${vault.vault_token.address}-${vault.chain.chain_name}`.toLowerCase(),
      chain: utils.formatChain(vault.chain.chain_name),
      project: 'optyfi',
      symbol: opSymbol[0],
      tvlUsd,
      apyBase,
      underlyingTokens: [vault.vault_underlying_token.address],
      url: `https://app.opty.fi/vault/${vault.vault_token.address}`,
      poolMeta: opSymbol[1],
    });
  }
  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.opty.fi/',
};
