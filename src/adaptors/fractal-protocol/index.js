const utils = require('../utils');
const Web3 = require('web3');
const vaultAbi = [
  {
    inputs: [],
    name: 'getTokenPrice',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];
const usdfAbi = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];
const USDF_TOKEN_CONTRACT = '0x51acB1ea45c1EC2512ae4202B9076C13016dc8aA';
const FRACTAL_VAULT_CONTRACT = '0x3eB82f2eD4d992dc0Bed328214A0907250f4Ec82';

const web3 = new Web3(process.env.INFURA_CONNECTION);

const fractalMetrics = async () => {
  //fetch apr from api
  const data = await utils.getData(
    'https://api.fractalprotocol.org/api/vault/historical-apr'
  );
  const apyData = data.slice(-1)[0].apr;

  //set contracts
  const usdfContract = new web3.eth.Contract(usdfAbi, USDF_TOKEN_CONTRACT);
  const vaultContract = new web3.eth.Contract(vaultAbi, FRACTAL_VAULT_CONTRACT);

  const usdfTotalSupply = await usdfContract.methods.totalSupply().call();
  const usdfPrice = await vaultContract.methods.getTokenPrice().call();

  const tvl = (usdfTotalSupply * usdfPrice) / 1e12;

  const fractalVault = {
    pool: '0x3eB82f2eD4d992dc0Bed328214A0907250f4Ec82',
    chain: utils.formatChain('ethereum'),
    project: 'fractal-protocol',
    symbol: utils.formatSymbol('USDF'),
    tvlUsd: tvl,
    apy: Number(apyData),
  };

  return [fractalVault]; // Fractal Protocol only has a single vault with APY
};

module.exports = {
  timetravel: false,
  apy: fractalMetrics,
};
