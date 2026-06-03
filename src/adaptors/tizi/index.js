const sdk = require('@defillama/sdk');
const utils = require('../utils');

const TD = '0x469bbd88eEA8A2D9a5C6c82d9890Cf60962C27e6';
const stTD = '0x0CB091e6D9fd696b4CC8571E19e042F456c182Ad';

const YEAR_IN_SECONDS = 31536000;

const apy = async () => {
  const block = await sdk.api.util.getLatestBlock('base');

  const [totalAssetsRes, unreleasedRes, releasePeriodRes, lastYieldTimeRes] =
    await Promise.all([
      sdk.api.abi.call({
        target: stTD,
        abi: 'uint256:totalAssets',
        chain: 'base',
      }),
      sdk.api.abi.call({
        target: stTD,
        abi: 'uint256:getUnreleasedAmount',
        chain: 'base',
      }),
      sdk.api.abi.call({
        target: stTD,
        abi: 'uint256:releasePeriod',
        chain: 'base',
      }),
      sdk.api.abi.call({
        target: stTD,
        abi: 'uint256:lastYieldTime',
        chain: 'base',
      }),
    ]);

  const totalAssets = Number(totalAssetsRes.output) / 1e18;
  const unreleasedAmount = Number(unreleasedRes.output) / 1e18;
  const releasePeriod = Number(releasePeriodRes.output);
  const lastYieldTime = Number(lastYieldTimeRes.output);

  const tvlUsd = totalAssets;

  let apyBase = 0;
  const remainTime = releasePeriod - (block.timestamp - lastYieldTime);

  if (unreleasedAmount > 0 && remainTime > 0 && totalAssets > 0) {
    const aprBase =
      (unreleasedAmount * YEAR_IN_SECONDS * 100) / (totalAssets * remainTime);
    apyBase = utils.aprToApy(aprBase, 365);
  }

  let pricePerShare;
  try {
    pricePerShare =
      (
        await sdk.api.abi.call({
          target: stTD,
          abi: 'function convertToAssets(uint256 shares) view returns (uint256)',
          params: ['1000000000000000000'],
          chain: 'base',
        })
      ).output / 1e18;
  } catch (e) {
    pricePerShare = null;
  }

  return [
    {
      pool: stTD,
      symbol: 'stTD',
      project: 'tizi',
      chain: utils.formatChain('base'),
      tvlUsd,
      apyBase,
      pricePerShare: pricePerShare > 0 ? +pricePerShare.toFixed(6) : null,
      poolMeta: '7 days unstaking, 7 days linear release',
      underlyingTokens: [TD],
      token: stTD,
    },
  ];
};

module.exports = {
  apy,
  url: 'https://tizi.money/',
};
