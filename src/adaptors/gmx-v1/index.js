const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');

const arbitrumGmxAddress = '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a';
const arbitrumGlpManagerAddress = '0x321F653eED006AD1C29D174e17d96351BDe22649';
const arbitrumFeeGmxTrackerAddress =
  '0xd2D1162512F927a7e282Ef43a362659E4F2a728F';
const arbitrumInflationGmxTrackerAddress =
  '0x908C4D94D34924765f1eDc22A1DD098397c59dD4';
const arbitrumFeeGlpTrackerAddress =
  '0x4e971a87900b931fF39d1Aad67697F49835400b6';
const arbitrumInflationGlpTrackerAddress =
  '0x1aDDD80E6039594eE970E5872D247bf0414C8903';

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
const project = 'gmx-v1';

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
      pChain == 'arbitrum'
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
      pChain == 'arbitrum' ? arbitrumGmxAddress : avalacheGmxAddress,
      pChain,
      'erc20:balanceOf',
      pChain == 'arbitrum'
        ? [arbitrumInflationGmxTrackerAddress]
        : [avalancheInflationGmxTrackerAddress]
    ));

  const tvsGmx = pStakedGmx * gmxPrice;
  const tvsEsGmx = pStakedEsGmx * gmxPrice;
  const yearlyFeeGmx =
    pChain == 'arbitrum'
      ? pFeeGmx * pPriceData['coingecko:ethereum'].price
      : pFeeGmx * pPriceData['coingecko:avalanche-2'].price;
  const yearlyInflationGmx = pInflationGmx * gmxPrice;
  const apyFee = (yearlyFeeGmx / tvsGmx) * 100;
  const apyInflation = (yearlyInflationGmx / tvsEsGmx) * 100;
  const chainString = pChain === 'avax' ? 'avalanche' : pChain;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(chainString),
    project,
    symbol: utils.formatSymbol('GMX'),
    tvlUsd: tvlGmx,
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens:
      chainString === 'arbitrum' ? [arbitrumGmxAddress] : [avalacheGmxAddress],
    underlyingTokens: [
      chainString === 'arbitrum' ? arbitrumGmxAddress : avalacheGmxAddress,
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
    pChain == 'arbitrum'
      ? pFeeGlp * pPriceData['coingecko:ethereum'].price
      : pFeeGlp * pPriceData['coingecko:avalanche-2'].price;
  const yearlyInflationGlp = pInflationGlp * pPriceData['coingecko:gmx'].price;
  const apyFee = (yearlyFeeGlp / pTvl) * 100;
  const apyInflation = (yearlyInflationGlp / pTvl) * 100;
  const chainString = pChain === 'avax' ? 'avalanche' : pChain;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(chainString),
    project,
    symbol: 'WBTC-ETH-USDC-DAI-FRAX-LINK-UNI-USDT',
    poolMeta: 'GLP',
    tvlUsd: parseFloat(pTvl),
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens:
      chainString === 'arbitrum' ? [arbitrumGmxAddress] : [avalacheGmxAddress],
    underlyingTokens: [
      chainString === 'arbitrum'
        ? '0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258'
        : '0x01234181085565ed162a948b6a5e88758CD7c7b8',
    ],
  };
}

const getPools = async () => {
  let pools = [];

  const priceKeys = ['gmx', 'ethereum', 'avalanche-2']
    .map((t) => `coingecko:${t}`)
    .join(',');
  const { coins: priceData } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  const arbitrumStakedGmx = await getAdjustedAmount(
    arbitrumFeeGmxTrackerAddress,
    'arbitrum',
    'erc20:totalSupply'
  );
  const arbitrumStakedEsGmx = await getAdjustedAmount(
    arbitrumInflationGmxTrackerAddress,
    'arbitrum',
    'erc20:totalSupply'
  );
  const arbitrumFeeGmx = await getAdjustedAmount(
    arbitrumFeeGmxTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );
  const arbitrumInflationGmx = await getAdjustedAmount(
    arbitrumInflationGmxTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolGmx(
      'arbitrum',
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
    'arbitrum',
    abi['tokensPerInterval']
  );
  const arbitrumInflationGlp = await getAdjustedAmount(
    arbitrumInflationGlpTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolGlp(
      'arbitrum',
      await getGlpTvl('arbitrum'),
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
  pools.push(
    await getPoolGmx(
      'avax',
      avalancheInflationGmxTrackerAddress,
      avalancheStakedGmx,
      avalancheStakedEsGmx,
      avalancheFeeGmx,
      avalancheInflationGmx,
      priceData
    )
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
  pools.push(
    await getPoolGlp(
      'avax',
      await getGlpTvl('avax'),
      avalancheInflationGlpTrackerAddress,
      avalancheFeeGlp,
      avalancheInflationGlp,
      priceData
    )
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.gmx.io/#/earn',
};
