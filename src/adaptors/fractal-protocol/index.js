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
const FRACTAL_CHRONOS_POOL = '0x468B6e0f89fa727A47d9512021050797B4875D6d';
const FRACTAL_CAMELOT_POOL = '0xf011B036934b58A619D2822d90ecd726126Efdf2';
const FRACTAL_CAMELOT_NITRO_POOL = '0x5d209809d3284309cC34B9D092f88fFc690de6c2';

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

  const chronosData = await utils.getData(
    'https://stats.chronos.exchange/get-all-apr-pool'
  );

  const fractalChronosPoolData = chronosData['sAMM-USDF/USDC']

  const camelotPoolData = await utils.getData(
    'https://api.camelot.exchange/v2/liquidity-v2-pools-data'
  );

  const camelotNitroPoolData = await utils.getData(
    'https://api.camelot.exchange/v2/nitro-pools-data'
  );

  const fractalCamelotPoolData = camelotPoolData.data.pools['0xf011B036934b58A619D2822d90ecd726126Efdf2']

  const fractalCamelotNitroPoolData = camelotNitroPoolData.data.nitros['0x5d209809d3284309cC34B9D092f88fFc690de6c2']

  const fractalChronosData = {
    pool: '0x468B6e0f89fa727A47d9512021050797B4875D6d',
    chain: utils.formatChain('arbitrum'),
    project: 'fractal-protocol',
    symbol: utils.formatSymbol('USDF-USDC'),
    tvlUsd: fractalChronosPoolData.tvl,
    apy: Number(fractalChronosPoolData.apr),
  }

  const fractalCamelotData = {
    pool: '0xf011B036934b58A619D2822d90ecd726126Efdf2',
    chain: utils.formatChain('arbitrum'),
    project: 'fractal-protocol',
    symbol: utils.formatSymbol('USDF-USDC'),
    tvlUsd: fractalCamelotPoolData.averageReserveUSD,
    apy: Number(fractalCamelotPoolData.oneWeekAverageAPR) + Number(fractalCamelotNitroPoolData.incentivesApr),
  }

  const fractalVault = {
    pool: '0x3EAa4b3e8967c02cE1304C1EB35e8C5409838DFC',
    chain: utils.formatChain('ethereum'),
    project: 'fractal-protocol',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: tvl,
    apy: Number(apyData),
  };

  return [fractalChronosData, fractalCamelotData, fractalVault]; 
};

module.exports = {
  timetravel: false,
  apy: fractalMetrics,
  url: 'https://app.fractalprotocol.org/',
};
