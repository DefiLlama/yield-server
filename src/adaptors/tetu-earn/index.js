const sdk = require('@defillama/sdk');
const abi = require('./abi.json');
const BigNumber = require('bignumber.js');
const utils = require('../utils');

const POLY_BOOKKEEPER = '0x0A0846c978a56D6ea9D2602eeb8f977B21F3207F';
const POLY_CONTRACT_READER = '0xCa9C8Fba773caafe19E6140eC0A7a54d996030Da';

const FTM_BOOKKEEPER = '0x00379dD90b2A337C4652E286e4FBceadef940a21';
const FTM_CONTRACT_READER = '0xa4EB2E1284D9E30fb656Fe6b34c1680Ef5d4cBFC';

const TETU_Reward_Token_FTM = '0x65c9d9d080714cDa7b5d58989Dc27f897F165179';
const TETU_Reward_Token_MATIC = '0x255707B70BF90aa112006E1b07B9AeA6De021424';

const chainDataMap = {
  polygon: {
    BOOKKEEPER_ADDRESS: POLY_BOOKKEEPER,
    CONTRACT_READER: POLY_CONTRACT_READER,
    BASE_REWARD_TOKEN: TETU_Reward_Token_MATIC,
  },
  fantom: {
    BOOKKEEPER_ADDRESS: FTM_BOOKKEEPER,
    CONTRACT_READER: FTM_CONTRACT_READER,
    BASE_REWARD_TOKEN: TETU_Reward_Token_FTM,
  },
};

const apyChain = async (chain) => {
  const vaultsAdderssCall = await sdk.api.abi.call({
    abi: abi.find((e) => e.name === 'vaults'),
    chain: chain,
    target: chainDataMap[chain]['BOOKKEEPER_ADDRESS'],
    params: [],
  });
  const vaultAddress = vaultsAdderssCall.output;

  const vaultInfoCall = await sdk.api.abi.multiCall({
    abi: abi.find((e) => e.name === 'vaultInfo'),
    calls: vaultAddress.map((vault) => ({
      target: chainDataMap[chain]['CONTRACT_READER'],
      params: vault,
    })),
    chain: chain,
    permitFailure: true,
  });

  const vaultInfo = vaultInfoCall.output
    .map((e) => e.output)
    .filter((e) => e?.active)
    .filter((e) => e.ppfsApr !== 0);

  const lpSymbol = await Promise.all(
    vaultInfo.map(async (pool, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: pool.assets.map((assetsAddress) => ({
            target: assetsAddress,
          })),
          abi: 'erc20:symbol',
          chain: chain,
          permitFailure: true,
        })
      ).output.map(({ output }) => output)
    )
  );

  const result = vaultInfo.map((pool, index) => {
    const tvlUsd = BigNumber(pool.tvlUsdc).div(BigNumber('10').pow(18));
    const ppfsApr = BigNumber(pool.ppfsApr || '0').div(BigNumber('10').pow(18));
    const rewardApr = pool.rewardsApr
      .reduce((acc, pev) => acc.plus(BigNumber(pev)), BigNumber('0'))
      .div(BigNumber('10').pow(18));

    return {
      pool: `${pool.addr}-${chain}`,
      chain: utils.formatChain(chain),
      project: 'tetu-earn',
      symbol: lpSymbol[index].join('-'),
      tvlUsd: tvlUsd.toNumber(),
      apyReward: rewardApr.toNumber(),
      apyBase: ppfsApr.toNumber(),
      rewardTokens: pool.rewardTokens.length
        ? pool.rewardTokens
        : [chainDataMap[chain]['BASE_REWARD_TOKEN']],
      url: `https://app.tetu.io/vault/${pool.addr}`,
      underlyingTokens: pool.assets,
    };
  });
  return result;
};

async function apy() {
  const apyPolygon = await apyChain('polygon');
  const apyFantom = await apyChain('fantom');
  return apyPolygon.concat(apyFantom);
}

module.exports = {
  timetravel: false,
  apy: apy,
};
