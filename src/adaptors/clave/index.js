const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');
const {
  BigNumber,
  utils: { formatUnits },
} = require('ethers');

const abiClaveStaking = require('./abiClaveStaking.json');

const ZK = '0x5a7d6b2f92c77fad6ccabd7ee0624e64907eaf3e';
const ZtakeV1Address = '0x9248F1Ee8cBD029F3D22A92EB270333a39846fB2';

const ONE_YEAR = 31557600;

const POOL_CONFIG = {
  zk: {
    name: `clave-zk`,
    abi: abiClaveStaking,
    chain: 'era',
    contract: ZtakeV1Address,
    token: ZK,
    type: 'v1',
  },
};

const buildTokenParam = (chain, address) => {
  return `${chain}:${address}`;
};

const buildPriceUrl = (chain, address) => {
  return `https://coins.llama.fi/prices/current/${buildTokenParam(
    chain,
    address
  )}`;
};

const getTokenData = async (address) => {
  const { data } = await axios.get(buildPriceUrl('era', address));
  return data.coins[buildTokenParam('era', address)];
};

const getV1PoolData = async ({ abi, contract, chain, name, token }) => {
  const { output: totalSupply } = await sdk.api.abi.call({
    target: contract,
    abi: abi.find((m) => m.name === 'totalSupply'),
    chain,
  });

  const { output: finishAt } = await sdk.api.abi.call({
    target: contract,
    abi: abi.find((m) => m.name === 'finishAt'),
    chain,
  });

  const { output: rewardRate } = await sdk.api.abi.call({
    target: contract,
    abi: abi.find((m) => m.name === 'rewardRate'),
    chain,
  });

  const { decimals, price, symbol } = await getTokenData(token);

  const formattedtotalSupply = formatUnits(totalSupply, decimals);
  const tvlUsd = Number(formattedtotalSupply) * price;

  const NOW = finishAt >= Math.floor(Date.now() / 1000);
  let formattedRewardAmount = 0;
  let apyReward = 0;

  if (finishAt > NOW) {
    formattedRewardAmount = formatUnits(
      BigNumber.from(rewardRate).mul(ONE_YEAR).mul(100),
      decimals
    );
    apyReward = Number(formattedRewardAmount) / Number(formattedtotalSupply);
  }

  return {
    pool: name,
    chain: utils.formatChain(chain),
    project: 'clave',
    symbol: utils.formatSymbol(symbol),
    tvlUsd,
    apyReward,
    rewardTokens: [ZK],
  };
};

const getApy = async () => {
  const zkPool = await getV1PoolData(POOL_CONFIG.zk);
  return [zkPool].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://getclave.io',
};
