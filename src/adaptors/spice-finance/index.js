const Web3 = require('web3');
const axios = require('axios');
const utils = require('../utils');

const { vaultABI, oracleABI } = require('./abis');

const RPC_URL = 'https://rpc.ankr.com/eth';

const PROLUGUE_VAULT_ADDRESS = '0x6110d61DD1133b0f845f1025d6678Cd22A11a2fe';
const ETHUSD_ORACLE_ADDRESS = '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419';

const web3 = new Web3(RPC_URL);

async function apr() {
  const { data } = await axios.get(
    `https://api.spicefi.xyz/v1/api/off-chain-vaults/aggregators/${PROLUGUE_VAULT_ADDRESS}?env=prod`
  );

  const vault = new web3.eth.Contract(vaultABI, PROLUGUE_VAULT_ADDRESS);
  const oracle = new web3.eth.Contract(oracleABI, ETHUSD_ORACLE_ADDRESS);

  const totalAssets = await vault.methods.totalAssets().call();
  const ethPrice = await oracle.methods.latestAnswer().call();
  const tvlUsd = (totalAssets / 10 ** 18) * (ethPrice / 10 ** 8);
  const apy = data?.data?.okrs?.expected_return * 100;

  return [
    {
      pool: `Spice-Prologue-Vault`,
      chain: 'Ethereum',
      project: 'spice-finance',
      symbol: 'WETH',
      tvlUsd,
      apy,
      apyBase: apy,
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
