const sdk = require('@defillama/sdk');
const utils = require('../utils');
const cvr = require('./caviar');

const caviar = require('./abis/Caviar.json');
const caviarStakingChef = require('./abis/CaviarStakingChef.json');
const usdr = require('./abis/USDR.json');

const CHAIN_NAME = 'polygon';
const TNGBL_ADDRESS = '0x49e6A20f1BBdfEeC2a8222E052000BbB14EE6007';
const project = 'tangible-rwa';

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'http://usdr-api.us-east-1.elasticbeanstalk.com/usdr/apy'
  );

  const totalSupply = await sdk.api.abi
    .call({
      target: usdr.address,
      abi: usdr.abi.find((m) => m.name === 'totalSupply'),
      chain: CHAIN_NAME,
    })
    .then((result) => result.output);

  const usdrPool = {
    pool: usdr.address,
    chain: utils.formatChain('polygon'),
    project,
    symbol: utils.formatSymbol('USDR'),
    tvlUsd: Number(totalSupply) / 1e9,
    apyBase: Number(apyData.usdr),
    apyReward: Number(apyData.tngbl),
    rewardTokens: [TNGBL_ADDRESS],
    underlyingTokens: [usdr.address],
    url: 'https://www.tangible.store/realusd',
  };

  const [tvl, aprBase, aprReward] = await cvr.pool();

  const caviarPool = {
    pool: caviarStakingChef.address,
    chain: utils.formatChain('polygon'),
    project,
    symbol: utils.formatSymbol('CVR'),
    tvlUsd: Number(tvl),
    apyBase: Number(utils.aprToApy(aprBase, 52)),
    apyReward: Number(utils.aprToApy(aprReward, 52)),
    rewardTokens: [usdr.address],
    underlyingTokens: [caviar.address],
    poolMeta: 'Caviar Staking Pool',
    url: 'https://www.tangible.store/caviar',
  };

  return [usdrPool, caviarPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
