const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');

const polygonMvxAddress = '0x2760e46d9bb43dafcbecaad1f64b93207f9f0ed7';
const polygonMvlpManagerAddress = '0x13E733dDD6725a8133bec31b2Fc5994FA5c26Ea9';

const polygonFeeMvxTrackerAddress =
  '0xaCEC858f6397Dd227dD4ed5bE91A5BB180b8c430';
const polygonInflationMvxTrackerAddress =
  '0xE8e2E78D8cA52f238CAf69f020fA961f8A7632e9';

const polygonFeeMvlpTrackerAddress =
  '0xaBD6c70C41FdF9261dfF15F4eB589b44a37072eB';
const polygonInflationMvlpTrackerAddress =
  '0xA6ca41Bbf555074ed4d041c1F4551eF48116D59A';

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

async function getMvlpTvl(pChain) {
  let tvl = await sdk.api.abi.call({
    target: pChain == 'polygon' ? polygonMvlpManagerAddress : '',
    abi: abi['getAumInUsdm'],
    chain: pChain,
    params: [false],
  });

  return tvl.output * 10 ** -18;
}

async function getPoolMvx(
  pChain,
  pInflationTrackerAddress,
  pStakedMvx,
  pStakedEsMvx,
  pFeeMvx,
  pInflationMvx,
  pPriceData
) {
  const tvlMvx =
    pPriceData.mvx.price *
    (await getAdjustedAmount(
      pChain == 'polygon' ? polygonMvxAddress : '',
      pChain,
      'erc20:balanceOf',
      pChain == 'polygon' ? [polygonInflationMvxTrackerAddress] : []
    ));

  const tvsMvx = pStakedMvx * pPriceData.mvx.price;
  const tvsEsMvx = pStakedEsMvx * pPriceData.mvx.price;

  const yearlyFeeMvx =
    pChain == 'polygon' ? pFeeMvx * pPriceData.matic.price : 0;
  const yearlyInflationMvx = pInflationMvx * pPriceData.mvx.price;

  const apyFee = (yearlyFeeMvx / tvsMvx) * 100;
  const apyInflation = (yearlyInflationMvx / tvsEsMvx) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project: 'metavault.trade',
    symbol: utils.formatSymbol('MVX'),
    tvlUsd: tvlMvx,
    apy: apyFee + apyInflation,
  };
}

async function getPoolMvlp(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pFeeMvlp,
  pInflationMvlp,
  pPriceData
) {
  const yearlyFeeMvlp =
    pChain == 'polygon' ? pFeeMvlp * pPriceData.matic.price : 0;
  const yearlyInflationMvlp = pInflationMvlp * pPriceData.mvx.price;
  const apyFee = (yearlyFeeMvlp / pTvl) * 100;
  const apyInflation = (yearlyInflationMvlp / pTvl) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project: 'metavault.trade',
    symbol: utils.formatSymbol('MVLP'),
    tvlUsd: parseFloat(pTvl),
    apy: apyFee + apyInflation,
  };
}

const getPools = async () => {
  let pools = [];

  const priceKeys = ['metavault-trade', 'matic-network']
    .map((t) => `coingecko:${t}`)
    .join(',');
  const { coins: priceDataRes } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );
  const priceData = {
    mvx: priceDataRes['coingecko:metavault-trade'],
    matic: priceDataRes['coingecko:matic-network'],
  };

  const polygonStakedMvx = await getAdjustedAmount(
    polygonFeeMvxTrackerAddress,
    'polygon',
    'erc20:totalSupply'
  );
  const polygonStakedEsMvx = await getAdjustedAmount(
    polygonInflationMvxTrackerAddress,
    'polygon',
    'erc20:totalSupply'
  );
  const polygonFeeMvx = await getAdjustedAmount(
    polygonFeeMvxTrackerAddress,
    'polygon',
    abi['tokensPerInterval']
  );
  const polygonInflationMvx = await getAdjustedAmount(
    polygonInflationMvxTrackerAddress,
    'polygon',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMvx(
      'polygon',
      polygonInflationMvxTrackerAddress,
      polygonStakedMvx,
      polygonStakedEsMvx,
      polygonFeeMvx,
      polygonInflationMvx,
      priceData
    )
  );

  const polygonFeeMvlp = await getAdjustedAmount(
    polygonFeeMvlpTrackerAddress,
    'polygon',
    abi['tokensPerInterval']
  );
  const polygonInflationMvlp = await getAdjustedAmount(
    polygonInflationMvlpTrackerAddress,
    'polygon',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMvlp(
      'polygon',
      await getMvlpTvl('polygon'),
      polygonInflationMvlpTrackerAddress,
      polygonFeeMvlp,
      polygonInflationMvlp,
      priceData
    )
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://metavault.trade/earn',
};
