const utils = require('../utils');

const veth = '0xc3997ff81f2831929499c4eE4Ee4e0F08F42D4D8';

// One entry per vToken, keyed by its field name in the api response. Bifrost adds and drops
// vTokens over time (vMANTA disappeared 2026-08), so each is resolved independently -- reading
// them straight off the response meant one delisted token threw and took all eight pools with it.
const VTOKENS = [
  {
    key: 'vETH',
    pool: veth,
    chain: 'ethereum',
    symbol: 'veth',
    priceId: 'ethereum',
    rewardTokens: ['ETH'],
    underlyingTokens: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
  },
  {
    key: 'vDOT',
    pool: 'polkadot-vdot',
    chain: 'Polkadot',
    symbol: 'vDOT',
    priceId: 'polkadot',
    rewardTokens: ['DOT'],
    underlyingTokens: ['coingecko:polkadot'],
  },
  {
    key: 'vGLMR',
    pool: 'moonbeam-vglmr',
    chain: 'Moonbeam',
    symbol: 'vGLMR',
    priceId: 'moonbeam',
    rewardTokens: ['GLMR'],
    underlyingTokens: ['0xacc15dc74880c9944775448304b263d191c6077f'], // WGLMR
  },
  {
    key: 'vMOVR',
    pool: 'moonriver-vmovr',
    chain: 'Moonriver',
    symbol: 'vMOVR',
    priceId: 'moonriver',
    rewardTokens: ['MOVR'],
    underlyingTokens: ['0x98878b06940ae243284ca214f92bb71a2b032b8a'], // WMOVR
  },
  {
    key: 'vKSM',
    pool: 'kusama-vksm',
    chain: 'Kusama',
    symbol: 'vKSM',
    priceId: 'kusama',
    rewardTokens: ['KSM'],
    underlyingTokens: ['coingecko:kusama'],
  },
  {
    key: 'vBNC',
    pool: 'bifrost-vbnc',
    chain: 'Bifrost',
    symbol: 'vBNC',
    priceId: 'bifrost-native-coin',
    rewardTokens: ['BNC'],
    underlyingTokens: ['coingecko:bifrost-native-coin'],
  },
  {
    key: 'vASTR',
    pool: 'astar-vstr',
    chain: 'Astar',
    symbol: 'vASTR',
    priceId: 'astar',
    rewardTokens: ['ASTR'],
    underlyingTokens: ['0xaeaaf0e2c81af264101b9129c00f4440ccf0f720'], // WASTR
  },
  {
    key: 'vMANTA',
    pool: 'manta-vMANTA',
    chain: 'manta',
    symbol: 'vMANTA',
    priceId: 'manta-network',
    rewardTokens: ['MANTA'],
    underlyingTokens: ['0x0dc808adce2099a9f62aa87d9670745aba741746'], // WMANTA
  },
];

const getApy = async () => {
  const vToken = await utils.getData('https://api.bifrost.app/api/site');

  const priceKeys = VTOKENS.map(({ priceId }) => `coingecko:${priceId}`).join(
    ','
  );
  const { coins: prices } = await utils.getPriceApiData(
    `/prices/current/${priceKeys}`
  );

  return VTOKENS.map(({ key, priceId, ...pool }) => {
    const data = vToken[key];
    const price = prices[`coingecko:${priceId}`]?.price;
    // A vToken the api no longer reports, or one we cannot price, has no pool to publish. Keep
    // the entry above either way: it comes back on its own if Bifrost relists the token.
    if (!data || price === undefined) {
      console.error(
        `bifrost-liquid-staking: skipping ${key} (${
          data ? 'no price' : 'absent from api'
        })`
      );
      return null;
    }

    return {
      ...pool,
      project: 'bifrost-liquid-staking',
      tvlUsd: Number(data.tvm) * price,
      apyBase: Number(data.apyBase),
      apyReward: Number(data.apyReward),
      isIntrinsicSource: true,
    };
  })
    .filter(Boolean)
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '1738',
  timetravel: false,
  apy: getApy,
  url: 'https://bifrost.app/vstaking',
};
