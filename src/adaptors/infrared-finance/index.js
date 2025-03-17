const axios = require('axios');
const { ethers } = require('ethers');
const iberaAbi = require('./abi');
const IBERA_ADDRESS = '0x9b6761bf2397bb5a6624a856cc84a3a14dcd3fe5';

const RPC_URL = 'https://rpc.berachain.com/';
const apy = async () => {
  const [apyResponse] = await Promise.all([
    axios.get('https://infrared.finance/api/ibera?chainId=80094'),
  ]);
  const apyValue = apyResponse.data.apr;
  const currentPrice = apyResponse.data.stake_receipt_token.price;
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(IBERA_ADDRESS, iberaAbi, provider);
  const totalSupply = await contract.totalSupply()
    .then(response => Number(ethers.utils.formatEther(response)))
    .catch(error => {
      console.error('Failed to fetch totalSupply:', error);
      throw error;
    });

    return [
    {
      pool: IBERA_ADDRESS,
      chain: 'berachain',
      project: 'infrared-finance',
      symbol: 'IBERA',
      tvlUsd: totalSupply * currentPrice,
      apyBase: apyValue * 100,
      underlyingTokens: [IBERA_ADDRESS],
    },
  ];
};
module.exports = { apy, url: 'https://infrared.finance/education/ibera' };
