const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');

const utils = require('../utils');

const UNIT_ADDRESS = '0xb95fB324b8A2fAF8ec4f76e3dF46C718402736e2';

const FLAT_MONEY_VIEWER_CONTRACT = '0x509b85EEF0df77992b29aeDdD22C7119Db87ce16';

const FLAT_MONEY_API_URL = 'https://api.flat.money/graphql';

const UNIT_APY_QUERY = gql`
  query {
    apy {
      weekly
    }
  }
`;

const chain = 'base';

const getUNITTVL = async () =>
  await sdk.api2.abi.call({
    target: FLAT_MONEY_VIEWER_CONTRACT,
    abi: 'function getFlatcoinTVL() view returns (uint256)',
    chain,
  });

const getUNITAPY = async () =>
  (await request(FLAT_MONEY_API_URL, UNIT_APY_QUERY)).apy.weekly;

const getCollateralToken = async () => {
  const target = await sdk.api2.abi.call({
    target: FLAT_MONEY_VIEWER_CONTRACT,
    abi: 'function vault() view returns (address)',
    chain,
  });
  return (
    await sdk.api.abi.call({
      target,
      abi: 'function collateral() view returns (address)',
      chain,
    })
  ).output;
};

const apy = async () => {
  const tvlUsd = (await getUNITTVL()) / 1e18;
  const apyBase = await getUNITAPY();
  const underlyingToken = await getCollateralToken();

  return [
    {
      pool: `${UNIT_ADDRESS}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'flat-money',
      symbol: utils.formatSymbol('UNIT'),
      tvlUsd,
      apyBase,
      apyReward: null,
      rewardTokens: [],
      underlyingTokens: [underlyingToken],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://flat.money/flatcoin',
};
