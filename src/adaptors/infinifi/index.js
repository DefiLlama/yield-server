const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');

const siUSDAddress = '0xDBDC1Ef57537E34680B898E1FEBD3D68c7389bCB';
const iUSDAddress = '0x48f9e38f3070AD8945DFEae3FA70987722E3D89c';

const lockingControllerCallData = {
  address: '0x1d95cC100D6Cd9C7BbDbD7Cb328d99b3D6037fF7',
  exchangeRateAbi: 'function exchangeRate(uint32 epoch) external view returns (uint256)',
  bucketsAbi: 'function buckets(uint32 epoch) external view returns (address,uint256,uint256)', //  shareToken address, totalReceiptTokens uint256, multiplier uint256
}

const poolsFunction = async () => {
  try {
    const pools = [];

    pools.push(await computeStakedTokenAPY());

    pools.push(...await computeLockedTokensAPY());

    return pools;
    
  } catch (error) {
    console.error('Error fetching infiniFi data:', error);
    return [];
  }
};


/**
 * Compute the APY for the staked iUSD token, this is a simple erc4626, using the utils function
 * @returns {Promise<{pool: string;chain: any;project: string;symbol: any;tvlUsd: number;apyBase: number;poolMeta: string;url: string;}>}
 */
async function computeStakedTokenAPY() {
  const erc4626Infos = await utils.getERC4626Info(siUSDAddress, 'ethereum');

  return {
    pool: `${siUSDAddress}-ethereum`.toLowerCase(),
    chain: utils.formatChain('ethereum'),
    project: 'infinifi',
    symbol: utils.formatSymbol('siUSD'),
    tvlUsd: parseFloat(ethers.utils.formatUnits(erc4626Infos.tvl, 18)),
    apyBase: erc4626Infos.apyBase,
    poolMeta: 'Staked iUSD',
    url: 'https://infinifi.xyz/',
    underlyingTokens: [iUSDAddress],
  };

}


/**
 * Compute the APY for the locked tokens, this is a bit more complex, we need to get the exchange rate for the bucket and the total supply of the bucket
 * This is done using multicalls to the locking controller contract and querying for blockNow and blockYesterday
 * @returns {Promise<{pool: string;chain: any;project: string;symbol: any;tvlUsd: number;apyBase: number;poolMeta: string;url: string;}[]>}
 */
async function computeLockedTokensAPY() {
  const pools = [];
  const dateNow = Math.round(Date.now() / 1000);
  const dateOneDayAgo = dateNow - 24 * 60 * 60;
  const [blockOneDayAgo, blockNow] = await utils.getBlocksByTime([dateOneDayAgo, dateNow], 'ethereum');
  const buckets = [1, 2, 4, 6, 8, 13];

  const multicallOptionsNow = {
    abi: lockingControllerCallData.exchangeRateAbi,
    calls: buckets.map((bucket) => ({
      target: lockingControllerCallData.address,
      params: [bucket.toString()],
    })),
    block: blockNow,
    chain: 'ethereum',
  };


  const multicallOptionsTotalSupplyNow = {
    abi: lockingControllerCallData.bucketsAbi,
    calls: buckets.map((bucket) => ({
      target: lockingControllerCallData.address,
      params: [bucket.toString()],
    })),
    block: blockNow,
    chain: 'ethereum',
  };

  const multicallOptionsOneDayAgo = {
    abi: lockingControllerCallData.exchangeRateAbi,
    calls: buckets.map((bucket) => ({
      target: lockingControllerCallData.address,
      params: [bucket.toString()],
    })),
    block: blockOneDayAgo,
    chain: 'ethereum',
  };

  const multicallNow = await sdk.api.abi.multiCall(multicallOptionsNow);
  const multicallBucketsNow = await sdk.api.abi.multiCall(multicallOptionsTotalSupplyNow);
  const multicallOneDayAgo = await sdk.api.abi.multiCall(multicallOptionsOneDayAgo);

  // console.log(multicallNow.output);
  // console.log(multicallOneDayAgo.output);
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const exchangeRateNow = multicallNow.output[i];
    const bucketData = multicallBucketsNow.output[i];
    console.log(bucketData);
    const tokenAddress = bucketData.output[0];
    const totalSupplyNow = bucketData.output[1];
    const totalSupplyNowNormalized = parseFloat(ethers.utils.formatUnits(totalSupplyNow, 18));
    const exchangeRateOneDayAgo = multicallOneDayAgo.output[i];
    // console.log(exchangeRateNow, exchangeRateOneDayAgo);
    const exchangeRateNowNormalized = parseFloat(ethers.utils.formatUnits(exchangeRateNow.output, 18));
    const exchangeRateOneDayAgoNormalized = parseFloat(ethers.utils.formatUnits(exchangeRateOneDayAgo.output, 18));
    const apy = (exchangeRateNowNormalized / exchangeRateOneDayAgoNormalized) ** 365 * 100 - 100;
    // console.log(`bucket ${bucket} apy: ${apy}`);
    pools.push({
      pool: `${tokenAddress}-ethereum`.toLowerCase(),
      chain: utils.formatChain('ethereum'),
      project: 'infinifi',
      symbol: utils.formatSymbol(`liUSD-${bucket}w`),
      tvlUsd: totalSupplyNowNormalized,
      apyBase: apy,
      poolMeta: `Locked iUSD - ${bucket} week${bucket > 1 ? 's' : ''}`,
      url: 'https://infinifi.xyz/',
      underlyingTokens: [iUSDAddress],
    });
  }

  return pools;
}



module.exports = {
  timetravel: true,
  apy: poolsFunction,
  url: 'https://infinifi.xyz/',
};