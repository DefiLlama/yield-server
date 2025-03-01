const axios = require('axios');
const ethers = require('ethers');
const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { ContractABIs } = require('./abi');

const chain = 'arbitrum';
const rpcEndpoint = 'https://endpoints.omniatech.io/v1/arbitrum/one/public';

const factory = '0xC3179AC01b7D68aeD4f27a19510ffe2bfb78Ab3e';
const topic0_market_create =
  '0xe8066e93c2c1e100c0c76002a546075b7c6b53025db53708875180c81afda250';
const event_market_create =
  'event MarketCreated (uint256 indexed marketId, address premium, address collateral, address underlyingAsset, address token, string name, uint256 strike, address controller)';

const contract_interface = new ethers.utils.Interface([event_market_create]);

const ONE_YEAR_HOURS = 365 * 24;
const ONE_EPOCH_HOURS = 166;

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
  const toBlock = (await sdk.api.util.getLatestBlock(chain)).number;

  const logs_market_create = (
    await sdk.api.util.getLogs({
      target: factory,
      topic: '',
      fromBlock: 96059531,
      toBlock: toBlock,
      topics: [topic0_market_create],
      keys: [],
      chain,
    })
  ).output;

  const market_create = logs_market_create.map(
    (e) => contract_interface.parseLog(e).args
  );

  const premiumVaults = market_create.map((e) => e.premium);
  const collateralVaults = market_create.map((e) => e.collateral);
  const vaults = [...premiumVaults, ...collateralVaults];

  const nameRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.carouselABI.find(({ name }) => name === 'name'),
    calls: vaults.map((vault) => ({
      target: vault,
    })),
    chain,
  });
  const names = nameRes.output.map(({ output }) => output);

  const assetRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.carouselABI.find(({ name }) => name === 'asset'),
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

  const getAllEpochsRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.carouselABI.find(({ name }) => name === 'getAllEpochs'),
    calls: vaults.map((vault) => ({
      target: vault,
    })),
    chain,
  });
  const allEpochs = getAllEpochsRes.output.map(({ output }) => output);

  const claimTVLRes = await sdk.api.abi.multiCall({
    abi: ContractABIs.carouselABI.find(({ name }) => name === 'claimTVL'),
    calls: vaults
      .map((vault, index) => {
        return allEpochs[index].map((epochId) => ({
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
    abi: ContractABIs.carouselABI.find(({ name }) => name === 'finalTVL'),
    calls: vaults
      .map((vault, index) => {
        return allEpochs[index].map((epochId) => ({
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
      project: 'y2k-v2',
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
