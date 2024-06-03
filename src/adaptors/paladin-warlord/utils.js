const axios = require('axios');
const sdk = require('@defillama/sdk');
const { warStakerABI } = require('./abi/WarStaker');

const WAR_STAKER_ADDRESS = '0xA86c53AF3aadF20bE5d7a8136ACfdbC4B074758A';

const getLlamaPrice = async (tokenAddress) => {
  const res = await axios.get(`https://coins.llama.fi/prices/current/ethereum:${tokenAddress}`);
  return res.data.coins[`ethereum:${tokenAddress}`].price;
};

const getCoingeckoPrice = async (tokenAddress) => {
  const res = await axios.get(
    `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`
  );
  return res.data[tokenAddress].usd;
};

const getTotalPricePerToken = async (
  tokenAmount,
  tokenAddress
) => {
  tokenAddress = tokenAddress.toLowerCase();
  const tokenPrice = await getLlamaPrice(tokenAddress).catch(() =>
    getCoingeckoPrice(tokenAddress).catch(() => 0)
  );
  return tokenPrice * tokenAmount;
};

const fetchRewardStates = async (tokenAddress) => {
  const res = await sdk.api.abi.call({
    abi: warStakerABI.find((a) => a.name === 'rewardStates'),
    target: WAR_STAKER_ADDRESS,
    params: tokenAddress,
  });
  return res.output;
}

module.exports = {
  getTotalPricePerToken,
  fetchRewardStates,
};