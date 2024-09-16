const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const { request, gql } = require('graphql-request');
const BigNumber = require('bignumber.js');

const baseUrl = sdk.graph.modifyEndpoint('FLWnk6nG7NDSTJWEh7UE2FBiYpUT6sspurmLzacNkGYr');

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
  const gmxPrice = pPriceData['coingecko:gmx'].price;
  const tvlGmx =
    gmxPrice *
    (await getAdjustedAmount(
      pChain == 'polygon' ? arbitrumGmxAddress : avalacheGmxAddress,
      pChain,
      'erc20:balanceOf',
      pChain == 'polygon'
        ? [arbitrumInflationGmxTrackerAddress]
        : [avalancheInflationGmxTrackerAddress]
    ));
  const tvsGmx = pStakedGmx * gmxPrice;
  const tvsEsGmx = pStakedEsGmx * gmxPrice;
  const yearlyFeeGmx =
    pChain == 'polygon'
      ? pFeeGmx * pPriceData['coingecko:wmatic'].price
      : pFeeGmx * pPriceData['coingecko:avalanche-2'].price;
  const yearlyInflationGmx = pInflationGmx * gmxPrice;
  const apyFee = (yearlyFeeGmx / tvsGmx) * 100;
  const apyInflation = (yearlyInflationGmx / tvsEsGmx) * 100;
  const chainString = pChain === 'avax' ? 'avalanche' : pChain;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(chainString),
    project: 'covo-v1',
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
      ? pFeeGlp * pPriceData['coingecko:wmatic'].price
      : pFeeGlp * pPriceData['coingecko:avalanche-2'].price;
  const yearlyInflationGlp = pInflationGlp * pPriceData['coingecko:gmx'].price;
  const apyFee = (yearlyFeeGlp / pTvl) * 100;
  const apyInflation = (yearlyInflationGlp / pTvl) * 100;
  const chainString = pChain === 'avax' ? 'avalanche' : pChain;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(chainString),
    project: 'covo-v1',
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

const query = gql`
  {
    uniswapPrice(id: "0x681D3e1b54B3E1a338feB5B076cebf53a697d51F") {
      token
      value
      timestamp
    }
  }
`;
function divideStrings(dividend, divisor) {
  let quotient = '';
  let remainder = '';
  let idx = 0;

  while (idx < dividend.length) {
    let currentDigit = Number(dividend[idx]);
    remainder = remainder.concat(currentDigit.toString());
    while (remainder.length > 1 && remainder[0] === '0') {
      remainder = remainder.slice(1);
    }
    if (Number(remainder) < Number(divisor)) {
      quotient = quotient.concat('0');
    } else {
      let count = 0;
      while (Number(remainder) >= Number(divisor)) {
        remainder = (Number(remainder) - Number(divisor)).toString();
        count++;
      }
      quotient = quotient.concat(count.toString());
    }
    idx++;
  }

  while (quotient.length > 1 && quotient[0] === '0') {
    quotient = quotient.slice(1);
  }

  return quotient;
}

const getPools = async () => {
  let pools = [];

  const priceKeys = ['gmx', 'wmatic', 'avalanche-2']
    .map((t) => `coingecko:${t}`)
    .join(',');
  const { coins: priceData } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  let queryC = query;
  let covographprice = await request(baseUrl, queryC);
  covographprice = new BigNumber(covographprice.uniswapPrice.value);
  decimal = new BigNumber(1000000000000000000000000000000);

  const covopricedecstring = covographprice.dividedBy(decimal);

  const covoprice = parseFloat(covopricedecstring.toString());
  priceData['coingecko:gmx'].price = covoprice;

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
