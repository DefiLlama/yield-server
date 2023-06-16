const Web3 = require('web3');
const axios = require('axios');
const utils = require('../utils');

const { vaultABI, oracleABI } = require('./abis');

const RPC_URL = 'https://rpc.ankr.com/eth';

const PROLUGUE_VAULT_ADDRESS = '0x6110d61DD1133b0f845f1025d6678Cd22A11a2fe';
const LEVERAGE_VAULT_ADDRESS = '0xd68871bd7D28572860b2E0Ee5c713b64445104F9';
const FLAGSHIP_VAULT_ADDRESS = '0xAe11ae7CaD244dD1d321Ff2989543bCd8a6Db6DF';
const ETHUSD_ORACLE_ADDRESS = '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419';

const web3 = new Web3(RPC_URL);

async function apr() {
  const prologueVault = new web3.eth.Contract(vaultABI, PROLUGUE_VAULT_ADDRESS);
  const leverageVault = new web3.eth.Contract(vaultABI, LEVERAGE_VAULT_ADDRESS);
  const flagshipVault = new web3.eth.Contract(vaultABI, FLAGSHIP_VAULT_ADDRESS);
  const oracle = new web3.eth.Contract(oracleABI, ETHUSD_ORACLE_ADDRESS);

  const ethPrice = await oracle.methods.latestAnswer().call();
  const totalAssetsPrologue = await prologueVault.methods.totalAssets().call();
  const tvlUsdPrologue = (totalAssetsPrologue / 10 ** 18) * (ethPrice / 10 ** 8);
  const { data: prologueData } = await axios.get(
    `https://api.spicefi.xyz/v1/api/off-chain-vaults/${PROLUGUE_VAULT_ADDRESS}?env=prod`
  );
  const actualApyPrologue = prologueData?.data?.okrs?.actual_returns;
  const historicalApyPrologue = prologueData?.data?.okrs?.expected_return * 100;

  const totalAssetsLeverage = await leverageVault.methods.totalAssets().call();
  const tvlUsdLeverage = (totalAssetsLeverage / 10 ** 18) * (ethPrice / 10 ** 8);
  const { data: leverageData } = await axios.get(
    `https://api.spicefi.xyz/v1/api/off-chain-vaults/${LEVERAGE_VAULT_ADDRESS}?env=prod`
  );
  const actualApyLeverage = leverageData?.data?.okrs?.actual_returns;
  const historicalApyLeverage = leverageData?.data?.okrs?.expected_return * 100;

  const totalAssetsFlagship = await flagshipVault.methods.totalAssets().call();
  const tvlUsdFlagship = (totalAssetsFlagship / 10 ** 18) * (ethPrice / 10 ** 8);
  const { data: flagshipData } = await axios.get(
    `https://api.spicefi.xyz/v1/api/off-chain-vaults/${FLAGSHIP_VAULT_ADDRESS}?env=prod`
  );
  const actualApyFlagship = flagshipData?.data?.okrs?.actual_returns;
  const historicalApyFlagship = flagshipData?.data?.okrs?.expected_return * 100;

  return [
    {
      pool: `Spice-Prologue-Vault`,
      poolMeta: 'Prologue Vault',
      chain: 'Ethereum',
      project: 'spice-finance',
      symbol: 'WETH',
      tvlUsd: tvlUsdPrologue,
      apyBase: Math.max(actualApyPrologue, historicalApyPrologue),
    },
    {
      pool: `Spice-Leverage-Vault`,
      poolMeta: 'Leverage Vault',
      chain: 'Ethereum',
      project: 'spice-finance',
      symbol: 'WETH',
      tvlUsd: tvlUsdLeverage,
      apyBase: Math.max(actualApyLeverage, historicalApyLeverage),
    },
    {
      pool: `Spice-Flagship-Vault`,
      poolMeta: 'Flagship Vault',
      chain: 'Ethereum',
      project: 'spice-finance',
      symbol: 'WETH',
      tvlUsd: tvlUsdFlagship,
      apyBase: Math.max(actualApyFlagship, historicalApyFlagship),
    },
  ];
}

const main = async () => {
  return await apr();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.spicefi.xyz/',
};
