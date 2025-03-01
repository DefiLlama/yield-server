const axios = require('axios');
const ethers = require('ethers');
const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { ContractABIs } = require('./abi');

const chain = 'arbitrum';
const rpcEndpoint = 'https://endpoints.omniatech.io/v1/arbitrum/one/public';
const vault_factory = '0x984e0eb8fb687afa53fc8b33e12e04967560e092';

const ONE_YEAR_HOURS = 365 * 24;
const ONE_EPOCH_HOURS = 24 * 7;

const abis = {
  getVaults: {
    inputs: [
      {
        internalType: 'uint256',
        name: 'index',
        type: 'uint256',
      },
    ],
    name: 'getVaults',
    outputs: [
      {
        internalType: 'address[]',
        name: 'vaults',
        type: 'address[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  marketIndex: {
    inputs: [],
    name: 'marketIndex',
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
};

const getTokenBalance = (provider, tokenAddress, ownerAddress, decimals) => {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ContractABIs.miniERC20ABI,
    provider
  );
  return tokenContract.balanceOf(ownerAddress).then((balance) => {
    return balance / Math.pow(10, decimals);
  });
};

const getApy = async () => {
  const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);

  const poolLength = (
    await sdk.api.abi.call({
      target: vault_factory,
      chain,
      abi: abis.marketIndex,
    })
  ).output;

  const vaultRes = await sdk.api.abi.multiCall({
    abi: abis.getVaults,
    calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
      target: vault_factory,
      params: i,
    })),
    chain,
  });

  const vaults = vaultRes.output
    .map(({ output }) => output)
    .flat()
    .map((e) => e.toLowerCase());

  const nameRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.vaultABI.find(({ name }) => name === 'name'),
    calls: vaults.map((vault) => ({
      target: vault,
    })),
    chain,
  });
  const names = nameRes.output.map(({ output }) => output);

  const assetRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.vaultABI.find(({ name }) => name === 'asset'),
    calls: vaults.map((vault) => ({
      target: vault,
    })),
    chain,
  });
  const assets = assetRes.output.map(({ output }) => output);

  const symbolsRes = await sdk.api.abi.multiCall({
    abi: 'erc20:symbol',
    calls: assets.map((t, i) => ({
      target: t,
    })),
    chain,
  });
  const symbols = symbolsRes.output.map((o) => o.output);

  const epochLengthRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.vaultABI.find(({ name }) => name === 'epochsLength'),
    calls: vaults.map((vault) => ({
      target: vault,
    })),
    chain,
  });
  const epochsLengths = epochLengthRes.output.map(({ output }) => output);

  const allEpochsRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.vaultABI.find(({ name }) => name === 'epochs'),
    calls: epochsLengths
      .map((epochLength, index) => {
        return [...Array(Number(epochLength)).keys()].map((i) => ({
          target: vaults[index],
          params: i,
        }));
      })
      .flat(),
    chain,
  });
  const allEpochs = {};
  allEpochsRes.output.forEach(({ input, output }) => {
    if (!allEpochs[input.target]) {
      allEpochs[input.target] = [];
    }
    allEpochs[input.target].push(output);
  });

  const claimTVLRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.vaultABI.find(({ name }) => name === 'idClaimTVL'),
    calls: vaults
      .map((vault, index) => {
        return allEpochs[vault].map((epochId) => ({
          target: vault,
          params: epochId,
        }));
      })
      .flat(),
    chain,
  });
  const claimTVLs = {};
  claimTVLRes.output.forEach(({ input, output }) => {
    if (!claimTVLs[input.target]) {
      claimTVLs[input.target] = [];
    }
    claimTVLs[input.target].push(output);
  });

  const finalTVLRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.vaultABI.find(({ name }) => name === 'idFinalTVL'),
    calls: vaults
      .map((vault, index) => {
        return allEpochs[vault].map((epochId) => ({
          target: vault,
          params: epochId,
        }));
      })
      .flat(),
    chain,
  });
  const finalTVLs = {};
  finalTVLRes.output.forEach(({ input, output }) => {
    if (!finalTVLs[input.target]) {
      finalTVLs[input.target] = [];
    }
    finalTVLs[input.target].push(output);
  });

  const underlyings = [...new Set(assets)];
  const prices = (
    await utils.getPrices(
      underlyings.map((underlying) => `${chain}:${underlying}`)
    )
  ).pricesByAddress;

  const tokenBalances = {};
  for (let i = 0; i < underlyings.length; i += 1) {
    const vaultsForThisAsset = assets
      .map((asset, index) => ({
        asset,
        index,
      }))
      .filter((e) => e.asset === underlyings[i])
      .map((e) => vaults[e.index]);

    const balanceRes = await sdk.api.abi.multiCall({
      abi: ContractABIs.miniERC20ABI.find(({ name }) => name === 'balanceOf'),
      calls: vaultsForThisAsset.map((vault) => ({
        target: underlyings[i],
        params: vault,
      })),
      chain,
    });
    const balances = balanceRes.output.map(({ output }) => output);
    balances.forEach((value, index) => {
      tokenBalances[vaultsForThisAsset[index]] = value;
    });
  }

  var pools = [];
  for (let i = 0; i < vaults.length; i += 1) {
    let lastRoi = 0;
    for (let j = claimTVLs[vaults[i]].length - 1; j >= 0; j -= 1) {
      const finalTVL = Number(finalTVLs[vaults[i]][j]);
      const claimTVL = Number(claimTVLs[vaults[i]][j]);
      if (finalTVL == 0) {
        continue;
      }
      lastRoi = (claimTVL / finalTVL - 1) * 100;
      break;
    }
    const apy =
      100 * ((1 + lastRoi / 100) ** (ONE_YEAR_HOURS / ONE_EPOCH_HOURS) - 1);

    const tokenLocked = Number(tokenBalances[vaults[i]]) / Math.pow(10, 18);
    const tokenPrice = prices[assets[i].toLowerCase()];
    const tvlUsd = tokenLocked * tokenPrice;

    pools.push({
      pool: vaults[i],
      poolMeta: names[i],
      chain,
      project: 'y2k-v1',
      symbol: symbols[i],
      apyBase: apy,
      apyBase7d: apy,
      underlyingTokens: [assets[i]],
      tvlUsd,
      url: 'https://app.y2k.finance/market',
    });
  }
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
