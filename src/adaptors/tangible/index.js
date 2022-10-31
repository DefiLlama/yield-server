const ethers = require('ethers');

const utils = require('../utils');

const provider = new ethers.providers.StaticJsonRpcProvider(
  'https://polygon-rpc.com'
);

const USDR_ADDRESS = '0xb5DFABd7fF7F83BAB83995E72A52B97ABb7bcf63';
const USDR = new ethers.Contract(
  USDR_ADDRESS,
  ['function totalSupply() view returns (uint256)'],
  provider
);

const TNGBL_ADDRESS = '0x49e6A20f1BBdfEeC2a8222E052000BbB14EE6007';

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'http://usdr-api.us-east-1.elasticbeanstalk.com/usdr/apy'
  );

  const totalSupply = await USDR.totalSupply();

  const usdrPool = {
    pool: USDR_ADDRESS,
    chain: utils.formatChain('polygon'),
    project: 'tangible',
    symbol: utils.formatSymbol('USDR'),
    tvlUsd: Number(totalSupply) / 1e9,
    apy: Number(apyData.usdr),
    apyReward: Number(apyData.tngbl),
    rewardTokens: [TNGBL_ADDRESS],
    underlyingTokens: [USDR_ADDRESS],
  };

  return [usdrPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.tangible.store/usdr',
};
