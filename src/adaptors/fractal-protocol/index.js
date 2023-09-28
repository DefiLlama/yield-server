const utils = require('../utils');
const sdk = require('@defillama/sdk');

const vaultAbi = {
  inputs: [],
  name: 'getTokenPrice',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const usdfAbi = {
  inputs: [],
  name: 'totalSupply',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const USDF_TOKEN_CONTRACT = '0x51acB1ea45c1EC2512ae4202B9076C13016dc8aA';
const FRACTAL_VAULT_CONTRACT = '0x3EAa4b3e8967c02cE1304C1EB35e8C5409838DFC';

const fractalMetrics = async () => {
  //fetch apr from api
  const data = await utils.getData(
    'https://api.fractalprotocol.org/vault/ethereum/historical-apr'
  );
  const apyData = data.slice(-1)[0].apr;

  const usdfTotalSupply = (
    await sdk.api.abi.call({
      target: USDF_TOKEN_CONTRACT,
      abi: usdfAbi,
      chain: 'ethereum',
    })
  ).output;

  const usdfPrice = (
    await sdk.api.abi.call({
      target: FRACTAL_VAULT_CONTRACT,
      abi: vaultAbi,
      chain: 'ethereum',
    })
  ).output;

  const tvl = (usdfTotalSupply * usdfPrice) / 1e12;

  const fractalVault = {
    pool: '0x3eB82f2eD4d992dc0Bed328214A0907250f4Ec82',
    chain: utils.formatChain('ethereum'),
    project: 'fractal-protocol',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: tvl,
    apy: Number(apyData),
  };

  return [fractalVault]; // Fractal Protocol only has a single vault with APY
};

module.exports = {
  timetravel: false,
  apy: fractalMetrics,
  url: 'https://app.fractalprotocol.org/',
};
