const sdk = require('@defillama/sdk');
const { getAprFromDefillamaPool, makeReadable } = require('./utils');
const utils = require('../../utils');
const { default: axios } = require('axios');

const MASTER_PENPIE_ADDRESS = '0x0776C06907CE6Ff3d9Dbf84bA9B3422d7225942D';
const PNP_ADDRESS = '0x2Ac2B254Bc18cD4999f64773a966E4f4869c34Ee';

async function getPenpieApr(underlyingTokenAddress) {
  const tokenPrices = await utils.getPrices(
    [PNP_ADDRESS, underlyingTokenAddress],
    'arbitrum'
  );

  const pnpPriceInUSD = tokenPrices.pricesByAddress[PNP_ADDRESS.toLowerCase()];
  const poolPriceInUSD =
    tokenPrices.pricesByAddress[underlyingTokenAddress.toLowerCase()];

  const { output } = await sdk.api.abi.call({
    target: MASTER_PENPIE_ADDRESS,
    abi: 'function getPoolInfo(address) public view returns (uint256,uint256,uint256,uint256)',
    params: [underlyingTokenAddress],
    chain: 'arbitrum',
  });

  const secondsPerYear = 31536000;
  const totalStaked = makeReadable(output[2]);
  const emissionPerSecondsInPNP = makeReadable(output[0]);
  const emissionPerYearInPNP = emissionPerSecondsInPNP * secondsPerYear;
  const emissionPerYearInUSD = emissionPerYearInPNP * pnpPriceInUSD;

  const tvlInUSD = totalStaked * poolPriceInUSD;

  const response = await axios.get(
    `https://api-v2.pendle.finance/core/v1/42161/markets/${underlyingTokenAddress}`
  );

  const apr =
    (emissionPerYearInUSD * 100) / tvlInUSD +
    response.data.maxBoostedApy * 100 * 0.83 +
    response.data.swapFeeApy;

  return apr;
}

module.exports = { getPenpieApr };
