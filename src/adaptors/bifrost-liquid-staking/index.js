const utils = require('../utils');

const veth = '0xc3997ff81f2831929499c4eE4Ee4e0F08F42D4D8';

const getApy = async () => {
  const vToken = await utils.getData('https://api.bifrost.app/api/site');

  const priceKeys = [
    'ethereum',
    'polkadot',
    'kusama',
    'bifrost-native-coin',
    'moonbeam',
    'moonriver',
    'astar',
    'manta-network',
  ]
    .map((t) => `coingecko:${t}`)
    .join(',');
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  const vDOT = {
    pool: 'polkadot-vdot',
    chain: 'Polkadot',
    project: 'bifrost-liquid-staking',
    symbol: 'vDOT',
    tvlUsd: vToken.vDOT.tvm * prices['coingecko:polkadot'].price,
    apyBase: Number(vToken.vDOT.apyBase),
    apyReward: Number(vToken.vDOT.apyReward),
    rewardTokens: ['DOT'],
  };

  const vGLMR = {
    pool: 'moonbeam-vglmr',
    chain: 'Moonbeam',
    project: 'bifrost-liquid-staking',
    symbol: 'vGLMR',
    tvlUsd: vToken.vGLMR.tvm * prices['coingecko:moonbeam'].price,
    apyBase: Number(vToken.vGLMR.apyBase),
    apyReward: Number(vToken.vGLMR.apyReward),
    rewardTokens: ['GLMR'],
    underlyingTokens: ['0xAcc15dC74880C9944775448304B263D191c6077F'], // WGLMR
  };

  const vASTR = {
    pool: 'astar-vstr',
    chain: 'Astar',
    project: 'bifrost-liquid-staking',
    symbol: 'vASTR',
    tvlUsd: vToken.vASTR.tvm * prices['coingecko:astar'].price,
    apyBase: Number(vToken.vASTR.apyBase),
    apyReward: Number(vToken.vASTR.apyReward),
    rewardTokens: ['ASTR'],
    underlyingTokens: ['0xAeaaf0e2c81Af264101B9129C00F4440cCF0F720'], // WASTR
  };

  const vMOVR = {
    pool: 'moonriver-vmovr',
    chain: 'Moonriver',
    project: 'bifrost-liquid-staking',
    symbol: 'vMOVR',
    tvlUsd: vToken.vMOVR.tvm * prices['coingecko:moonriver'].price,
    apyBase: Number(vToken.vMOVR.apyBase),
    apyReward: Number(vToken.vMOVR.apyReward),
    rewardTokens: ['MOVR'],
    underlyingTokens: ['0x98878B06940aE243284CA214f92Bb71a2b032B8A'], // WMOVR
  };

  const vBNC = {
    pool: 'bifrost-vbnc',
    chain: 'Bifrost',
    project: 'bifrost-liquid-staking',
    symbol: 'vBNC',
    tvlUsd: vToken.vBNC.tvm * prices['coingecko:bifrost-native-coin'].price,
    apyBase: Number(vToken.vBNC.apyBase),
    apyReward: Number(vToken.vBNC.apyReward),
    rewardTokens: ['BNC'],
  };

  const vKSM = {
    pool: 'kusama-vksm',
    chain: 'Kusama',
    project: 'bifrost-liquid-staking',
    symbol: 'vKSM',
    tvlUsd: vToken.vKSM.tvm * prices['coingecko:kusama'].price,
    apyBase: Number(vToken.vKSM.apyBase),
    apyReward: Number(vToken.vKSM.apyReward),
    rewardTokens: ['KSM'],
  };

  const vMANTA = {
    pool: 'manta-vMANTA',
    chain: 'manta',
    project: 'bifrost-liquid-staking',
    symbol: 'vMANTA',
    tvlUsd: vToken.vMANTA.tvm * prices['coingecko:manta-network'].price,
    apyBase: Number(vToken.vMANTA.apyBase),
    apyReward: Number(vToken.vMANTA.apyReward),
    rewardTokens: ['MANTA'],
    underlyingTokens: ['0x0Dc808adcE2099A9F62AA87D9670745AbA741746'], // WMANTA
  };

  const vETH = {
    pool: veth,
    chain: 'ethereum',
    project: 'bifrost-liquid-staking',
    symbol: 'veth',
    tvlUsd: vToken.vETH.tvm * prices['coingecko:ethereum'].price,
    apyBase: Number(vToken.vETH.apyBase),
    apyReward: Number(vToken.vETH.apyReward),
    underlyingTokens: [veth],
    rewardTokens: ['ETH'],
  };

  return [vETH, vDOT, vGLMR, vMOVR, vKSM, vBNC, vASTR, vMANTA];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://bifrost.app/vstaking',
};
