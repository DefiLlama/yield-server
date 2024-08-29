const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils.js');

const PRIME_ETH = '0x6ef3D766Dfe02Dc4bF04aAe9122EB9A0Ded25615';
const LRT_ORACLE = '0xA755c18CD2376ee238daA5Ce88AcF17Ea74C1c32';

const apy = async () => {
  const totalSupply = await sdk.api.abi.call({
    abi: 'uint:totalSupply',
    target: PRIME_ETH,
  });
  // primeETH/ETH price
  const primeEthPrice = await sdk.api.abi.call({
    abi: 'uint:primeETHPrice',
    target: LRT_ORACLE,
  });
  const priceData = await utils.getData(
    'https://coins.llama.fi/prices/current/coingecko:ethereum?searchWidth=4h'
  );
  const ethPrice = priceData.coins['coingecko:ethereum'].price;
  const tvlUsd =
    ((totalSupply.output * primeEthPrice.output) / 1e36) * ethPrice;

  const { data } = await axios.get(
    'https://api.originprotocol.com/api/v2/primestaked'
  );

  const primeStaked = {
    pool: '0x6ef3D766Dfe02Dc4bF04aAe9122EB9A0Ded25615-ethereum'.toLowerCase(),
    chain: 'Ethereum',
    project: 'prime-staked-eth',
    symbol: 'primeETH',
    apy: data.apy,
    tvlUsd,
    underlyingTokens: [
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      '0x0000000000000000000000000000000000000000',
      '0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3',
    ],
  };

  return [primeStaked];
};
module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.primestaked.com',
};
