const sdk = require('@defillama/sdk');
const axios = require('axios');
const ethers = require('ethers');
const abi = require('./abi.json');
const utils = require('../utils');

const project = 'steadefi';

const CONSTANT = {
  43114: {
    name: 'avax',
    chainLinkOracle: '0xd8D520903DF0cAfEe9b989922173D636290572c2',
  },
  42161: {
    name: 'arbitrum',
    chainLinkOracle: '0x43697612E11e5C53F1DE1c0AeddCEEC0a0Bff9b6',
  },
};

async function apy() {
  const vaultResponse = (
    await axios.get(`https://api.steadefi.com/vaults`)
  ).data.filter((v) => v.status !== 'Hidden');

  const lendingPoolResponse = (
    await axios.get(`https://api.steadefi.com/lending-pools`)
  ).data.filter((v) => v.status !== 'Hidden');

  const vaults = await Promise.all(
    vaultResponse.map(async (p) => {
      const chain = CONSTANT[p.chainId].name;
      const chainString = utils.formatChain(chain);

      const readerAddress = (
        await sdk.api.abi.call({
          target: p.address,
          abi: abi.VAULT.find(({ name }) => name === 'reader'),
          chain,
        })
      ).output;

      const equityValue = (
        await sdk.api.abi.call({
          target: readerAddress,
          abi: abi.VAULT_READER.find(({ name }) => name === 'equityValue'),
          chain,
        })
      ).output;

      return {
        pool: `${p.address}-${chainString}`.toLowerCase(),
        chain: chainString,
        project,
        symbol: utils.formatSymbol(p.symbol),
        poolMeta: p.protocol,
        tvlUsd: Number(ethers.utils.formatUnits(equityValue)),
        apy: utils.aprToApy(Number(p.data.apr.totalApr * 100)),
      };
    }),
  );

  const lendingPools = await Promise.all(
    lendingPoolResponse.map(async (p) => {
      const chain = CONSTANT[p.chainId].name;
      const chainString = utils.formatChain(chain);

      const lendingAPR = (
        await sdk.api.abi.call({
          target: p.address,
          abi: abi.LENDING_POOL.find(({ name }) => name === 'lendingAPR'),
          chain,
        })
      ).output;

      const totalValue = (
        await sdk.api.abi.call({
          target: p.address,
          abi: abi.LENDING_POOL.find(({ name }) => name === 'totalValue'),
          chain,
        })
      ).output;

      const assetDecimals = (
        await sdk.api.abi.call({
          target: p.address,
          abi: abi.LENDING_POOL.find(({ name }) => name === 'assetDecimals'),
          chain,
        })
      ).output;

      const assetPrice = (
        await sdk.api.abi.call({
          target: CONSTANT[p.chainId].chainLinkOracle,
          abi: abi.CHAINLINK_ORACLE.find(
            ({ name }) => name === 'consultIn18Decimals',
          ),
          params: p.baseToken.address,
          chain,
        })
      ).output;

      return {
        pool: `${p.address}-${chainString}`.toLowerCase(),
        chain: chainString,
        project,
        symbol: utils.formatSymbol(p.symbol),
        tvlUsd:
          Number(ethers.utils.formatUnits(totalValue, Number(assetDecimals))) *
          Number(ethers.utils.formatUnits(assetPrice)),
        apy: utils.aprToApy(Number(ethers.utils.formatUnits(lendingAPR)) * 100),
      };
    }),
  );

  return [...lendingPools, ...vaults];
}

const main = async () => {
  const data = await apy();

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://steadefi.com/vaults',
};
