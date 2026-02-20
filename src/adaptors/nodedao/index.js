const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

// nETH - liquid staking (new NethPool contract, migrated from old ethStakingPool)
const nethPool = '0xf3C79408164abFB6fD5dDfE33B084E4ad2C07c18';
const nETH = '0xc6572019548dfeba782ba5a2093c836626c7789a';
const oldEthStakingPool = '0x8103151E2377e78C04a3d2564e20542680ed3096';

// rnETH - restaking via EigenLayer
const restakingPool = '0x0d6F764452CA43eB8bd22788C9Db43E4b5A725Bc';
const rnETH = '0x9Dc7e196092DaC94f0c76CFB020b60FA75B97C5b';

const url = 'https://www.nodedao.com/';

const exchangeRateAbi = {
  inputs: [],
  name: 'exchangeRate',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const totalAssetsAbi = {
  inputs: [],
  name: 'totalAssets',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const getPoolData = async (poolContract, block1dayAgo, block7dayAgo) => {
  const [rateNow, rate1d, rate7d, totalAssets] = await Promise.all([
    sdk.api.abi.call({
      target: poolContract,
      abi: exchangeRateAbi,
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: poolContract,
      abi: exchangeRateAbi,
      chain: 'ethereum',
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: poolContract,
      abi: exchangeRateAbi,
      chain: 'ethereum',
      block: block7dayAgo,
    }),
    sdk.api.abi.call({
      target: poolContract,
      abi: totalAssetsAbi,
      chain: 'ethereum',
    }),
  ]);

  const apyBase =
    ((rateNow.output - rate1d.output) / rate1d.output) * 365 * 100;
  const apyBase7d =
    ((rateNow.output - rate7d.output) / rate7d.output / 7) * 365 * 100;
  const totalEth = totalAssets.output / 1e18;

  return { apyBase, apyBase7d, totalEth };
};

const getApy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;

  const [{ height: block1dayAgo }, { height: block7dayAgo }] =
    await Promise.all([
      axios
        .get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
        .then((r) => r.data),
      axios
        .get(`https://coins.llama.fi/block/ethereum/${timestamp7dayAgo}`)
        .then((r) => r.data),
    ]);

  const ethPriceKey = 'coingecko:ethereum';
  const ethPriceRes = (
    await axios.get(`https://coins.llama.fi/prices/current/${ethPriceKey}`)
  ).data;
  const ethPrice = ethPriceRes?.coins?.[ethPriceKey]?.price;
  if (!ethPrice) throw new Error('nodedao: failed to fetch ETH price');

  const [nEthData, rnEthData] = await Promise.all([
    getPoolData(nethPool, block1dayAgo, block7dayAgo),
    getPoolData(restakingPool, block1dayAgo, block7dayAgo),
  ]);

  return [
    {
      pool: `${oldEthStakingPool}-ethereum`, // preserve history
      chain: utils.formatChain('ethereum'),
      project: 'nodedao',
      symbol: 'nETH',
      tvlUsd: nEthData.totalEth * ethPrice,
      apyBase: nEthData.apyBase,
      apyBase7d: nEthData.apyBase7d,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      token: nETH,
      url: `https://app.nodedao.com/`,
    },
    {
      pool: `${rnETH}-ethereum`.toLowerCase(),
      chain: utils.formatChain('ethereum'),
      project: 'nodedao',
      symbol: 'rnETH',
      tvlUsd: rnEthData.totalEth * ethPrice,
      apyBase: rnEthData.apyBase,
      apyBase7d: rnEthData.apyBase7d,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      token: rnETH,
      url: `https://app.nodedao.com/re_stake`,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url,
};
