const sdk = require('@defillama/sdk3');
const { apy } = require('../../pendle');
const { getAprFromDefillamaPool, makeReadable } = require('../shared');
const utils = require('../../utils');

/*//////////////////////////////////////////////////////////////////////////////
                                     VLP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

const MASTER_PENPIE_ADDRESS = '0x0776C06907CE6Ff3d9Dbf84bA9B3422d7225942D';
const PNP_ADDRESS = '0x2Ac2B254Bc18cD4999f64773a966E4f4869c34Ee';

async function getPenpiePrice() {
  const pnpPriceInUSD = (await utils.getPrices([PNP_ADDRESS], 'arbitrum'))
    .pricesByAddress[PNP_ADDRESS.toLowerCase()];
}

async function getPenpieApr(poolAddress) {
  const apr = await getAprFromDefillamaPool(apy, poolAddress);

  const tokenPrices = await utils.getPrices(
    [PNP_ADDRESS, poolAddress],
    'arbitrum'
  );

  const pnpPriceInUSD = tokenPrices.pricesByAddress[PNP_ADDRESS];
  const poolPriceInUSD = tokenPrices.pricesByAddress[poolAddress];

  const { output } = await sdk.api.abi.call({
    target: MASTER_PENPIE_ADDRESS,
    abi: 'function getPoolInfo(address) public view returns (uint256,uint256,uint256,uint256)',
    params: [poolAddress],
    chain: 'arbitrum',
  });
  const totalStaked = makeReadable(output[2]);
  const emissionPerSecondsInPNP = makeReadable(output[0]);
  const emissionPerYearInPNP = emissionPerSecondsInPNP * secondsPerYear;
  const emissionPerYearInUSD = emissionPerYearInPNP * pnpPriceInUSD;

  const tvlInUSD = totalStaked * poolPriceInUSD;

  // const secondsPerYear = 31536000;

  // const data = (await viemPublicClient.readContract({
  //   address: this.MASTER_PENPIE as `0x${string}`,
  //   abi: PenpieVaultABI,
  //   functionName: 'getPoolInfo',
  //   args: [assetAddress],
  // })) as any[];
  // const emission = data[0];
  // const totalStaked = data[2];

  // const emissionPerSecondsInPNP = await this.makeResultReadable(
  //   emission,
  //   18,
  // );
  // const emissionPerYearInPNP = emissionPerSecondsInPNP * secondsPerYear;
  // const emissionPerYearInUSD = emissionPerYearInPNP * pnpPriceInUSD;
  // const response = await this.getPoolDetail();
  // const pendleMarketLpPriceInUSD = response.lp.price.usd;
  // const tvlInUSD =
  //   (await this.makeResultReadable(totalStaked, 18)) *
  //   pendleMarketLpPriceInUSD;
  // const apr =
  //   (emissionPerYearInUSD * 100) / tvlInUSD +
  //   response?.maxBoostedApy * 100 * 0.83 +
  //   response.swapFeeApy;

  return apr;
}

module.exports = { getPenpieApr };
