const utils = require('../utils');

const OSWAP_STATS_ENDPOINT = 'https://v2-stats.oswap.io/api/v1';
const LIQUIDITY_PROVIDER_ENDPOINT = 'https://liquidity.obyte.org';
const OSWAP_TOKEN_ENDPOINT = 'https://token.oswap.io/api'; //@see https://token.oswap.io/farming/all

const COMMON_DATA = { chain: 'Obyte', project: 'oswap-amm' };

// Obyte asset unit hashes (from Counterstake bridge API)
const OBYTE_ASSETS = {
  GBYTE: 'base',
  USDC: 'S/oCESzEO8G2hvQuI6HsyPr0foLfKwzs+GU73nO9H40=',
  WBTC: 'vApNsebTEPb3QDNNfyLsDB/iI5st9koMpAqvADzTw5A=',
  ETH: 'RF/ysZ/ZY4leyc3huUq1yFc0xTS0GdeFQu8RmXas4ys=',
  OUSD: '0IwAk71D5xFP0vTzwamKBwzad3I1ZUjZ1gdeB5OnfOg=',
  LINE: 'kNWO9R4/oiZ7m+3k4RgBxR2Lrdb/rtfIYB2XKVytCc0=',
  BUSD: 'Rqd8mi8+pOnlieU13G7RFFBJnY71D2/opd3ssaEcMZU=',
  BNB: 'AHVV8Um6AwHY9/nsX/YMZkWSBptWdn4g9aYVhNLcUWs=',
  MATIC: 'zN8X/+o3iXuhmfwNMVcI+pKRJmzLvFbrJ3yvjCHbRBE=',
  KUSDC: 'KMt8I2XieRnFOEn3xmDcKM6kkgS7RD7KkoWHVoL770I=',
  KUSDT: 'yuEojU0XlavWIdTSWlDWRXvBYaS2nLr/H6xaRDMTT5g=',
  KAVA: 'qJoRaemF/fTzn+f618vpvEl14oJ1GmqNnpGod9WH0Fk=',
};

function getUnderlyingTokensFromSymbol(symbol) {
  const parts = symbol.split('-');
  const tokens = parts.map((s) => OBYTE_ASSETS[s]).filter(Boolean);
  return tokens.length > 0 ? tokens : undefined;
}

const poolsFunction = async () => {
  const poolsData = await utils.getData(`${OSWAP_STATS_ENDPOINT}/yield`);

  const apyRewards = await utils.getData(
    `${LIQUIDITY_PROVIDER_ENDPOINT}/mining-apy`
  );

  const farmingPoolsAPY = await utils.getData(`${OSWAP_TOKEN_ENDPOINT}/lp_apy`)?.then((data) => data?.data);

  return poolsData
    .map(({ address, pool, apyBase, ...rest }) => {
      const farmingAPY = +(farmingPoolsAPY.find((pool) => address === pool.address)?.apy || 0);
      let apyReward = apyRewards[address] || null;

      if (!apyReward || farmingAPY && (farmingAPY > apyReward)) {
        apyReward = farmingAPY;
      }

      return ({
        url: `https://oswap.io/#/swap/${address}`,
        apyReward,
        apyBase,
        rewardTokens: ['GBYTE'],
        underlyingTokens: getUnderlyingTokensFromSymbol(rest.symbol || ''),
        pool: `${address}-obyte`.toLowerCase(),
        ...rest,
        ...COMMON_DATA,
      })
    })
    .filter(({ apyBase }) => apyBase !== null)
    .filter((p) => p.symbol !== 'O-GBYTE-WBTC-WBTC');
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
