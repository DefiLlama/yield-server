const { request, gql } = require('graphql-request');

const url = 'https://api.thegraph.com/subgraphs/name/elkdao/cellarsnext';

const dayDataQuery = gql`
  {
    cellarDayDatas(
      where: {cellar: "<CELLAR>" }
      orderDirection: desc
      orderBy: date, first: <DAYS>
    ) {
      date
      shareValue
    }
  }
`;

async function getDayData(cellarAddress, numDays) {
  let query = dayDataQuery.replace('<CELLAR>', cellarAddress);
  query = query.replace('<DAYS>', numDays);

  const data = await request(url, query);

  return data.cellarDayDatas;
}

module.exports = {
  getDayData,
};
