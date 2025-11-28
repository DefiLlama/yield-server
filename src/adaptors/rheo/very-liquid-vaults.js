const axios = require('axios');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');
const VeryLiquidVaultABI = require('./VeryLiquidVault.json');

const DEPLOYMENT_BLOCKS = {
  base: 35109672,
  ethereum: 23320146,
};

const VERY_LIQUID_VAULTS = {
  base: ['0xf4D43A8570Dad86595fc079c633927aa936264F4'],
  ethereum: [
    '0x3AdF08AFe804691cA6d76742367cc50A24a1F4A1',
    '0x13dDa6fD149a4Da0f2012F16e70925586ee603b8',
  ],
};

/*
interface VaultStatus {
  timestamp: number;
  totalShares: number;
  totalAssets: number;
}
*/

function uppercaseFirst(str /*: string*/) /*: string*/ {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function getLastVaultStatusLog(vault, chain) /*: Promise<VaultStatus>*/ {
  const currentBlock = await sdk.api.util.getLatestBlock(chain);
  const toBlock = currentBlock.number;
  const vaultInterface = new ethers.utils.Interface(VeryLiquidVaultABI.abi);
  const topic = vaultInterface.getEventTopic('VaultStatus');
  const logs = await sdk.api.util.getLogs({
    target: vault,
    topic: '',
    toBlock,
    fromBlock: DEPLOYMENT_BLOCKS[chain],
    keys: [],
    topics: [topic],
    chain,
  });
  const sortedLogs = logs.output.sort((a, b) => b.blockNumber - a.blockNumber);
  const lastLog = sortedLogs[0];
  const decodedLog = vaultInterface.parseLog(lastLog);
  const timestamp = await sdk.api.util.getTimestamp(lastLog.blockNumber, chain);
  const vaultStatus = {
    timestamp: timestamp,
    totalShares: Number(decodedLog.args.totalShares.toString()),
    totalAssets: Number(decodedLog.args.totalAssets.toString()),
  };
  return vaultStatus;
}

function getAPY(
  status0 /*: VaultStatus */,
  status1 /*: VaultStatus */
) /*: number */ {
  // Calculate time difference in years
  const timeDiffSeconds = status1.timestamp - status0.timestamp;
  const timeDiffYears = timeDiffSeconds / (365 * 24 * 60 * 60);

  // Calculate share price ratio (assets per share)
  const sharePrice0 = status0.totalAssets / status0.totalShares;
  const sharePrice1 = status1.totalAssets / status1.totalShares;

  // Calculate the growth rate
  const growthRate = (sharePrice1 - sharePrice0) / sharePrice0;

  // Convert to APY (annualized)
  const apy = Math.pow(1 + growthRate, 1 / timeDiffYears) - 1;

  // Return as percentage (multiply by 100)
  return apy * 100;
}

async function apy() /*: Promise<Pool[]>*/ {
  const chains = Object.keys(VERY_LIQUID_VAULTS);

  const chainResults = await Promise.all(
    chains.map(async (chain) => {
      const vaults = VERY_LIQUID_VAULTS[chain];

      const [assets, symbols, totalAssets, totalSupply, decimals] =
        await Promise.all([
          sdk.api.abi
            .multiCall({
              abi: VeryLiquidVaultABI.abi.find(({ name }) => name === 'asset'),
              calls: vaults.map((vault) => ({
                target: vault,
              })),
              chain,
            })
            .then(({ output }) => output.map(({ output }) => output)),

          sdk.api.abi
            .multiCall({
              abi: 'erc20:symbol',
              calls: vaults.map((vault) => ({
                target: vault,
              })),
              chain,
            })
            .then(({ output }) => output.map(({ output }) => output)),

          sdk.api.abi
            .multiCall({
              abi: VeryLiquidVaultABI.abi.find(
                ({ name }) => name === 'totalAssets'
              ),
              calls: vaults.map((vault) => ({
                target: vault,
              })),
              chain,
            })
            .then(({ output }) => output.map(({ output }) => output)),

          sdk.api.abi
            .multiCall({
              abi: VeryLiquidVaultABI.abi.find(
                ({ name }) => name === 'totalSupply'
              ),
              calls: vaults.map((vault) => ({
                target: vault,
              })),
              chain,
            })
            .then(({ output }) => output.map(({ output }) => output)),

          sdk.api.abi
            .multiCall({
              abi: 'erc20:decimals',
              calls: vaults.map((vault) => ({
                target: vault,
              })),
              chain,
            })
            .then(({ output }) => output.map(({ output }) => output)),
        ]);

      const assetsSymbols = await sdk.api.abi
        .multiCall({
          abi: 'erc20:symbol',
          calls: assets.map((asset) => ({
            target: asset,
          })),
          chain,
        })
        .then(({ output }) => output.map(({ output }) => output));

      const prices = await Promise.all(
        vaults.map(async (vault, i) => {
          const res = await axios.get(
            `https://coins.llama.fi/prices/current/${chain}:${assets[i]}`
          );
          return res.data.coins[`${chain}:${assets[i]}`].price;
        })
      );

      const lastVaultStatusLogPerVault = await Promise.all(
        vaults.map((vault) => getLastVaultStatusLog(vault, chain))
      );

      const apyBasePerVault = lastVaultStatusLogPerVault.map(
        (lastVaultStatusLog, i) => {
          const currentStatus = {
            timestamp: Math.floor(new Date().getTime() / 1000),
            totalShares: Number(totalSupply[i]),
            totalAssets: Number(totalAssets[i]),
          };
          return getAPY(lastVaultStatusLog, currentStatus);
        }
      );

      return vaults.map((vault, i) => ({
        pool: `rheo-vlv-${vault}`,
        chain: uppercaseFirst(chain),
        apyBase: apyBasePerVault[i],
        project: 'rheo',
        symbol: symbols[i],
        tvlUsd: (totalAssets[i] * prices[i]) / 10 ** decimals[i],
        underlyingTokens: [assets[i]],
        url: `https://veryliquid.xyz/${chain}/vault/${vault}`,
        totalSupplyUsd: (totalAssets[i] * prices[i]) / 10 ** decimals[i],
        poolMeta: symbols[i].replace('vlv', '').replace(assetsSymbols[i], ''),
      }));
    })
  );

  return chainResults.flat();
}

module.exports = {
  apy,
};
