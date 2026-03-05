const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const BigNumber = require('bignumber.js');

const klpManagerAddress = '0x53E6D11B66aBF344028b69f2468120c6afA47F53';
const feeKlpTrackerAddress = '0xbD1a3CBD6E391A01eD98289cC82D1b0b5D14b1f1';
const PERP_V1_VAULT = '0xa721f9f61CECf902B2BCBDDbd83E71c191dEcd8b'; // Kava PerpV1 Vault

const KAI = '0x52369B1539EA8F4e1eadEEF18D85462Dcf9a3658';
const KLP = '0x5d370C8Fb021cfaa663D35a7c26fb59699ff42DA';

const secondsPerYear = 31536000;

async function getKlpTvl() {
  let tvl = await sdk.api.abi.call({
    target: klpManagerAddress,
    abi: abi['getAumInUsdk'],
    chain: 'kava',
    params: [false],
  });

  return tvl.output * 10 ** -18;
}

async function calculateKlpPrice() {
  try {
    // Fetch AUMs and KLP Supply
    let aums = await sdk.api.abi.call({
      target: klpManagerAddress,
      abi: abi['getAums'],
      chain: 'kava',
      params: [],
    });

    let klpSupply = await sdk.api.abi.call({
      target: KLP,
      abi: 'erc20:totalSupply',
      chain: 'kava',
      params: [],
    });

    // Convert AUMs to a readable format (divide by 1e30)
    const aumValues = aums.output.map((value) =>
      new BigNumber(value).dividedBy(1e30)
    );
    const klpSupplyAdjusted = new BigNumber(klpSupply.output).dividedBy(1e18);

    // Calculate the median of AUMs
    if (aumValues.length !== 2) {
      throw new Error('Expected exactly 2 values from getAums');
    }
    const medianAum = aumValues[0].plus(aumValues[1]).dividedBy(2);

    // Calculate the price
    const price = medianAum.dividedBy(klpSupplyAdjusted);

    return price.toString();
  } catch (error) {
    console.error('Error calculating KLP price:', error);
  }
}

async function getFeeKLPTrackerValues() {
  let decimals = await sdk.api.abi.call({
    target: feeKlpTrackerAddress,
    abi: 'erc20:decimals',
    chain: 'kava',
  });

  let supply = await sdk.api.abi.call({
    target: feeKlpTrackerAddress,
    abi: 'erc20:totalSupply',
    chain: 'kava',
    params: [],
  });

  let tokensPerInterval = await sdk.api.abi.call({
    target: feeKlpTrackerAddress,
    abi: abi['tokensPerInterval'],
    chain: 'kava',
    params: [KAI],
  });

  const feeKlp = new BigNumber(tokensPerInterval.output)
    .multipliedBy(secondsPerYear)
    .dividedBy(1e18)
    .toString();

  const feeKlpSupply = new BigNumber(supply.output).dividedBy(1e18).toString();

  return { feeKlp, feeKlpSupply };
}

async function getPoolKlp(pTvl, pFeeKlp, pFeeKlpSupply, pKlpPrice, pPriceData) {
  const rewardTvl = Number(pFeeKlpSupply) * Number(pKlpPrice);

  const yearlyFeeKlp =
    Number(pFeeKlp) * pPriceData['coingecko:kinetixfi'].price;
  const apyFee = (yearlyFeeKlp / rewardTvl) * 100;

  return {
    pool: feeKlpTrackerAddress,
    chain: utils.formatChain('kava'),
    project: 'kinetix-derivatives',
    symbol: 'KAVA-axlETH-WETH-axlWBTC-WBTC-ATOM-USDt',
    poolMeta: 'KLP',
    tvlUsd: parseFloat(pTvl),
    apyBase: apyFee,
    apyReward: 0,
    rewardTokens: [KAI],
    underlyingTokens: [KLP],
  };
}

const getPools = async () => {
  let pools = [];

  const priceKeys = ['kinetixfi'].map((t) => `coingecko:${t}`).join(',');

  const { coins: priceData } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  const klpTvl = await getKlpTvl();
  const klpPrice = await calculateKlpPrice();

  const { feeKlp, feeKlpSupply } = await getFeeKLPTrackerValues();

  pools.push(
    await getPoolKlp(klpTvl, feeKlp, feeKlpSupply, klpPrice, priceData)
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://kinetix.finance/pool/perpv1',
};
