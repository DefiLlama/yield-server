const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const { Decimal } = require('decimal.js');
const { request, gql } = require('graphql-request');


const arbitrumGmxAddress = '0x681D3e1b54B3E1a338feB5B076cebf53a697d51F';
const arbitrumGlpManagerAddress = '0x8d5398E5f97554334DDdc8ec4b9855652c887802';
const arbitrumFeeGmxTrackerAddress =
  '0x93bCfA19C135685b8029F85110Be38c1F8652dF1';
const arbitrumInflationGmxTrackerAddress =
  '0x8D084d359aEC7e9C810E4Ce3fe5434750a230FD1';
const arbitrumFeeGlpTrackerAddress =
  '0x16240E94B7F4A34aDc5e8407fb34d72530eE6c4A';
const arbitrumInflationGlpTrackerAddress =
  '0xffCC76DeE7221E1a19421920e1fc3B5eAd4C23a0';

const avalacheGmxAddress = '0x62edc0692BD897D2295872a9FFCac5425011c661';
const avalancheGlpManagerAddress = '0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F';
const avalancheFeeGmxTrackerAddress =
  '0x4d268a7d4C16ceB5a606c173Bd974984343fea13';
const avalancheInflationGmxTrackerAddress =
  '0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342';
const avalancheFeeGlpTrackerAddress =
  '0xd2D1162512F927a7e282Ef43a362659E4F2a728F';
const avalancheInflationGlpTrackerAddress =
  '0x9e295B5B976a184B14aD8cd72413aD846C299660';

const secondsPerYear = 31536000;
const divisor = 10n ** 30n;

async function getAdjustedAmount(pTarget, pChain, pAbi, pParams = []) {
  let decimals = await sdk.api.abi.call({
    target: pTarget,
    abi: 'erc20:decimals',
    chain: pChain,
  });
  let supply = await sdk.api.abi.call({
    target: pTarget,
    abi: pAbi,
    chain: pChain,
    params: pParams,
  });

  return pAbi == abi['tokensPerInterval']
    ? supply.output * 10 ** -decimals.output * secondsPerYear
    : supply.output * 10 ** -decimals.output;
}

async function getGlpTvl(pChain) {
  let tvl = await sdk.api.abi.call({
    target:
      pChain == 'polygon'
        ? arbitrumGlpManagerAddress
        : avalancheGlpManagerAddress,
    abi: abi['getAumInUsdg'],
    chain: pChain,
    params: [false],
  });

  return tvl.output * 10 ** -18;
}

async function getPoolGmx(
  pChain,
  pInflationTrackerAddress,
  pStakedGmx,
  pStakedEsGmx,
  pFeeGmx,
  pInflationGmx,
  pPriceData
) {
  const tvlGmx =
    pPriceData.gmx.usd *
    (await getAdjustedAmount(
      pChain == 'polygon' ? arbitrumGmxAddress : avalacheGmxAddress,
      pChain,
      'erc20:balanceOf',
      pChain == 'polygon'
        ? [arbitrumInflationGmxTrackerAddress]
        : [avalancheInflationGmxTrackerAddress]
    ));
  const tvsGmx = pStakedGmx * pPriceData.gmx.usd;
  const tvsEsGmx = pStakedEsGmx * pPriceData.gmx.usd;
  const yearlyFeeGmx =
    pChain == 'polygon'
      ? pFeeGmx * pPriceData.wmatic.usd
      : pFeeGmx * pPriceData['avalanche-2'].usd;
  const yearlyInflationGmx = pInflationGmx * pPriceData.gmx.usd;
  const apyFee = (yearlyFeeGmx / tvsGmx) * 100;
  const apyInflation = (yearlyInflationGmx / tvsEsGmx) * 100;
  const chainString = pChain === 'avax' ? 'avalanche' : pChain;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(chainString),
    project: 'covo-finance',
    symbol: utils.formatSymbol('COVO'),
    tvlUsd: tvlGmx,
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens:
      chainString === 'polygon' ? [arbitrumGmxAddress] : [avalacheGmxAddress],
    underlyingTokens: [
      chainString === 'polygon' ? arbitrumGmxAddress : avalacheGmxAddress,
    ],
  };
}

async function getPoolGlp(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pFeeGlp,
  pInflationGlp,
  pPriceData
) {
  const yearlyFeeGlp =
    pChain == 'polygon'
      ? pFeeGlp * pPriceData.wmatic.usd
      : pFeeGlp * pPriceData['avalanche-2'].usd;
  const yearlyInflationGlp = pInflationGlp * pPriceData.gmx.usd;
  const apyFee = (yearlyFeeGlp / pTvl) * 100;
  const apyInflation = (yearlyInflationGlp / pTvl) * 100;
  const chainString = pChain === 'avax' ? 'avalanche' : pChain;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(chainString),
    project: 'covo-finance',
    symbol: utils.formatSymbol('COVOLP'),
    tvlUsd: parseFloat(pTvl),
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens:
      chainString === 'polygon' ? [arbitrumGmxAddress] : [avalacheGmxAddress],

    underlyingTokens: [
      chainString === 'polygon' ? arbitrumGmxAddress : avalacheGmxAddress,
    ],
    underlyingTokens: [
      chainString === 'polygon'
        ? '0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258'
        : '0x01234181085565ed162a948b6a5e88758CD7c7b8',
    ],
  };
}

const baseUrl = 'https://api.thegraph.com/subgraphs/name/defi-techz/covo-price';

const query = gql`
{
  uniswapPrice(id:"0x681D3e1b54B3E1a338feB5B076cebf53a697d51F") {
        token
value
timestamp
  }
}

`;


const getPools = async () => {
  let pools = [];

  const priceData = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=gmx%2Cwmatic%2Cavalanche-2&vs_currencies=usd'
  );


  let queryC = query;
  let covographprice = await request(baseUrl, queryC);
  covographprice = covographprice.uniswapPrice;

  const covopricedec = new Decimal(covographprice.value);

  const covopricedecstring = covopricedec.div(divisor.toString()); // perform the division using Decimal
  const covoprice = parseFloat(covopricedecstring.toString()); 
  priceData.gmx.usd = covoprice;
 

  const arbitrumStakedGmx = await getAdjustedAmount(
    arbitrumFeeGmxTrackerAddress,
    'polygon',
    'erc20:totalSupply'
  );
  const arbitrumStakedEsGmx = await getAdjustedAmount(
    arbitrumInflationGmxTrackerAddress,
    'polygon',
    'erc20:totalSupply'
  );
  const arbitrumFeeGmx = await getAdjustedAmount(
    arbitrumFeeGmxTrackerAddress,
    'polygon',
    abi['tokensPerInterval']
  );
  const arbitrumInflationGmx = await getAdjustedAmount(
    arbitrumInflationGmxTrackerAddress,
    'polygon',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolGmx(
      'polygon',
      arbitrumInflationGmxTrackerAddress,
      arbitrumStakedGmx,
      arbitrumStakedEsGmx,
      arbitrumFeeGmx,
      arbitrumInflationGmx,
      priceData
    )
  );

  const arbitrumFeeGlp = await getAdjustedAmount(
    arbitrumFeeGlpTrackerAddress,
    'polygon',
    abi['tokensPerInterval']
  );
  const arbitrumInflationGlp = await getAdjustedAmount(
    arbitrumInflationGlpTrackerAddress,
    'polygon',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolGlp(
      'polygon',
      await getGlpTvl('polygon'),
      arbitrumInflationGlpTrackerAddress,
      arbitrumFeeGlp,
      arbitrumInflationGlp,
      priceData
    )
  );

  const avalancheStakedGmx = await getAdjustedAmount(
    avalancheFeeGmxTrackerAddress,
    'avax',
    'erc20:totalSupply'
  );
  const avalancheStakedEsGmx = await getAdjustedAmount(
    avalancheInflationGmxTrackerAddress,
    'avax',
    'erc20:totalSupply'
  );
  const avalancheFeeGmx = await getAdjustedAmount(
    avalancheFeeGmxTrackerAddress,
    'avax',
    abi['tokensPerInterval']
  );
  const avalancheInflationGmx = await getAdjustedAmount(
    avalancheInflationGmxTrackerAddress,
    'avax',
    abi['tokensPerInterval']
  );
  

  const avalancheFeeGlp = await getAdjustedAmount(
    avalancheFeeGlpTrackerAddress,
    'avax',
    abi['tokensPerInterval']
  );
  const avalancheInflationGlp = await getAdjustedAmount(
    avalancheInflationGlpTrackerAddress,
    'avax',
    abi['tokensPerInterval']
  );
 

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.covo.finance/#/earn',
};
