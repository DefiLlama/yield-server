const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');

const siUSDAddress = '0xDBDC1Ef57537E34680B898E1FEBD3D68c7389bCB';
const iUSDAddress = '0x48f9e38f3070AD8945DFEae3FA70987722E3D89c';

// add new l2 deployments here
const l2SiUSD = {
  base: {
    siUSD: '0xA7845e48995A974bD1d130F4CA8C61fA47Fb4107',
    iUSD: '0xF007bA6D86A46Ca9170C387Dd316c58d1c457751',
  },
  monad: {
    siUSD: '0x5855e6B9b3cD6960FA3E751A87353c3e40401b9B',
    iUSD: '0x127066E1982940c33fDC882D9c138296AB15F97f',
  },
};

const lockingControllerCallData = {
  address: '0x1d95cC100D6Cd9C7BbDbD7Cb328d99b3D6037fF7',
  exchangeRateAbi: 'function exchangeRate(uint32 epoch) external view returns (uint256)',
  bucketsAbi: 'function buckets(uint32 epoch) external view returns (address,uint256,uint256)', //  shareToken address, totalReceiptTokens uint256, multiplier uint256
}

const poolsFunction = async () => {
  try {
    const pools = [];

    pools.push(...await computeStakedTokenAPY());

    pools.push(...await computeLockedTokensAPY());

    return pools;

  } catch (error) {
    console.error('Error fetching infiniFi data:', error);
    return [];
  }
};


/**
 * Compute the APY for the staked iUSD token, this is a simple erc4626, using the utils function but it also returns the pools for the base and monad chains
 * @returns {Promise<{pool: string;chain: any;project: string;symbol: any;tvlUsd: number;apyBase: number;poolMeta: string;url: string;}[]>}
 */

async function computeStakedTokenAPY() {
  // ethereum info also has the mirrored siUSD from the L2 deployments (base, monad, maybe more in the future)
  // L2s supply will be removed from the ethereum pool in the following loop
  const ethereumInfo = await utils.getERC4626Info(siUSDAddress, 'ethereum');

  const pools = [];
  const ethereumPool = {
    pool: `${siUSDAddress}-ethereum`.toLowerCase(),
    chain: utils.formatChain('ethereum'),
    project: 'infinifi',
    symbol: 'siUSD',
    tvlUsd: parseFloat(ethers.utils.formatUnits(ethereumInfo.tvl, 18)),
    apyBase: ethereumInfo.apyBase,
    pricePerShare: ethereumInfo.pricePerShare,
    poolMeta: 'Staked iUSD',
    url: 'https://infinifi.xyz/',
    underlyingTokens: [iUSDAddress],
    isIntrinsicSource: true,
  };

  for (const [chain, config] of Object.entries(l2SiUSD)) {
    const l2Pool = await computeL2StakedTokenAPY(chain,config,ethereumInfo);
    // for each l2 pools we need to substract the TVL out of the ethereum pool
    ethereumPool.tvlUsd -= l2Pool.tvlUsd;
    // console.log(`removing ${l2Pool.tvlUsd} from ethereum pool, ${ethereumPool.tvlUsd} left`);
    pools.push(l2Pool);
  }


  // add the ethereum pool to the pools after substracting the L2s supplies
  pools.push(ethereumPool);

  return pools;
}

async function computeL2StakedTokenAPY(
  chain,
  config,
  ethereumInfo
) {
  const totalSupply = await sdk.api.abi.call({
    target: config.siUSD,
    abi: 'erc20:totalSupply',
    chain,
  });

  const supply = parseFloat(
    ethers.utils.formatUnits(totalSupply.output, 18)
  );

  return {
    pool: `${config.siUSD}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: 'infinifi',
    symbol: 'siUSD',
    tvlUsd: supply * ethereumInfo.pricePerShare,
    apyBase: ethereumInfo.apyBase,
    pricePerShare: ethereumInfo.pricePerShare,
    poolMeta: 'Staked iUSD',
    url: 'https://infinifi.xyz/',
    underlyingTokens: [config.iUSD],
    isIntrinsicSource: false,
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
      symbol: `liUSD-${bucket}w`,
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
  protocolId: '6245',
  timetravel: true,
  apy: poolsFunction,
  url: 'https://infinifi.xyz/',
};
