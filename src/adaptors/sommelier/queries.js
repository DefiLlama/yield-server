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

const hourDataQuery = gql`
  {
    cellarHourDatas(
      where: {cellar: "<CELLAR>", date_gte: <START>, date_lte: <END> }
      orderDirection: desc
      orderBy: date
    ) {
      date
      shareValue
    }
  }
`;

async function getHourData(cellarAddress, startDate, endDate) {
  let query = hourDataQuery.replace('<CELLAR>', cellarAddress);
  query = query.replace('<START>', startDate);
  query = query.replace('<END>', endDate);

  const data = await request(url, query);

  return data.cellarHourDatas;
}

module.exports = {
  getDayData,
  getHourData,
};
