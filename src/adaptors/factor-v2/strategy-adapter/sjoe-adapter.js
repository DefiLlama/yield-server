const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const { getCoinDataFromDefillamaAPI, getCurrentTimestamp } = require('./utils');

async function getMonthlyReward() {
  const query = gql`
    query feeBankDayDatasQuery($first: Int! = 100, $dateAfter: Int!) {
      dayDatas(
        first: $first
        orderBy: date
        orderDirection: desc
        where: { date_gte: $dateAfter }
      ) {
        id
        date
        usdRemitted
      }
    }
  `;
  const thirtyDaysAgoRaw = getCurrentTimestamp() - 30 * 86400;
  const thirtyDaysAgo = thirtyDaysAgoRaw - (thirtyDaysAgoRaw % 86400);
  const variables = {
    dateAfter: thirtyDaysAgo,
  };
  const { dayDatas } = await request(
    sdk.graph.modifyEndpoint('AuX5GL2oSPVcgHUbBow5SU3yoxWFNFdmGLvEX9nb1gUb'),
    query,
    variables
  );

  const monthlyReward = dayDatas.reduce((acc, dayData) => {
    return acc + parseFloat(dayData.usdRemitted);
  }, 0);
  return monthlyReward;
}

async function getTVLFromSource(underlyingTokenAddress) {
  const [{ output: internalJoeBalance }, coinData] = await Promise.all([
    sdk.api.abi.call({
      target: '0x43646A8e839B2f2766392C1BF8f60F6e587B6960',
      abi: 'uint256:internalJoeBalance',
      chain: 'arbitrum',
    }),
    getCoinDataFromDefillamaAPI('arbitrum', underlyingTokenAddress),
  ]);

  const { price, decimals } = coinData;

  return (parseInt(internalJoeBalance.toString()) * price) / 10 ** decimals;
}

async function getSJoeApr(underlyingTokenAddress) {
  const monthlyReward = await getMonthlyReward();
  const sJoeTVL = await getTVLFromSource(underlyingTokenAddress);
  const apr = ((monthlyReward * 12) / sJoeTVL) * 100;
  return apr;
}

module.exports = { getSJoeApr };
