const axios = require('axios');
const utils = require('../utils');

const poolsUrl =
  'https://swap.api.sui-prod.bluefin.io/api/v1/pools/info?limit=500';

const withPrefix = (coinType) =>
  coinType.startsWith('0x') ? coinType : `0x${coinType}`;

const apy = async () => {
  const { data } = await axios.get(poolsUrl);

  return Object.values(data)
    .map((p) => {
      const rewardTokens = [
        ...new Set((p.rewards ?? []).map((r) => withPrefix(r.token.address))),
      ];

      return {
        pool: p.address,
        chain: 'Sui',
        project: 'bluefin-spot',
        symbol: `${p.tokenA.info.symbol}-${p.tokenB.info.symbol}`,
        underlyingTokens: [
          withPrefix(p.tokenA.info.address),
          withPrefix(p.tokenB.info.address),
        ],
        rewardTokens,
        tvlUsd: Number(p.tvl),
        apyBase: Number(p.day?.apr?.feeApr),
        apyReward: Number(p.day?.apr?.rewardApr),
        poolMeta: `${Number(p.feeRate)}%`,
        url: `https://trade.bluefin.io/deposit/${p.address}`,
      };
    })
    .filter((p) => utils.keepFinite(p))
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
};

module.exports = {
  protocolId: '5427',
  apy,
};
