const utils = require('../utils');
const { GraphQLClient, gql} = require('graphql-request')


const endPoint = 'https://d2c7awq32ho327.cloudfront.net/graphql'
var graphQLClient = new GraphQLClient(endPoint)
const SMART_CREDIT = '0x72e9D9038cE484EE986FEa183f8d8Df93f9aDA13'.toLowerCase()


const underlyingStats = gql`
  query {
    underlyingCurrencies {
      symbol,
      name,
      ethAddress,
      riskFreeRate,
      exchangeRate,
      medianExchangeRate,
      isUnderlying,
      isCollateral,
      decimalPlaces,
      totalBorrowedAmount,
      totalBorrowedValueInUSD,
      totalLendedAmount,
      totalLendedValueInUSD,
      maxAPY,
      minInterestRate,
      lendersAPY,
      borrowersAPY
    }
  }
`;

const requiredCollateralRatio = gql`
  query RequiredCollateralRatio($loanAmount: Float!, $loanTerm: Int!, $loanRequestValidity: DateTime!, $collateralCurrency: String!, $underlyingCurrency: String!, $userRating: Int!) {
    requiredCollateralRatio(
      loanAmount: $loanAmount, 
      loanTerm: $loanTerm, 
      loanRequestValidity: $loanRequestValidity, 
      collateralCurrency: $collateralCurrency, 
      underlyingCurrency: $underlyingCurrency, 
      userRating: $userRating
    ) {
      collateralRatio
    }
  }
`;
async function getStats(query,variables) {
  return await graphQLClient.request(query,variables)
}
const poolsFunction = async () => {
  const apyData = await getStats(underlyingStats);
  const variablesArr = apyData.underlyingCurrencies.map(item => ({
    loanAmount: 1, //Required param otherwise does not have any impact on the calculation
    loanTerm: item.symbol === "SMARTCREDIT" ? 90 : 30,
    loanRequestValidity: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    collateralCurrency: item.symbol,
    underlyingCurrency: item.symbol,
    userRating: 1,   //calculating lower bound(worst credit score)
  }));
  const resultArr = await Promise.all(variablesArr.map(variables => getStats(requiredCollateralRatio, variables)));
  return apyData.underlyingCurrencies.map((item, i) => ({
    pool: (`${item.ethAddress}-smartcredit`).toLowerCase(),
    chain: utils.formatChain("Ethereum"),
    project: "smartcredit",
    symbol: utils.formatSymbol(item.symbol),
    tvlUsd: item.totalLendedValueInUSD - item.totalBorrowedValueInUSD,
    apyBase: Math.floor(item.maxAPY),
    apyReward: Math.floor(item.lendersAPY),
    rewardTokens: [SMART_CREDIT],
    underlyingTokens: [(item.ethAddress).toLowerCase()],
    poolMeta:item.symbol === "SMARTCREDIT" ? '90-180 days' : '30-90 days',
    apyBaseBorrow: Math.floor(item.minInterestRate),
    apyRewardBorrow: Math.floor(item.borrowersAPY),
    totalSupplyUsd: item.totalLendedValueInUSD,
    totalBorrowUsd: item.totalBorrowedValueInUSD,
    ltv: (resultArr[i].requiredCollateralRatio.collateralRatio / 1000)
  }));
};


module.exports = {
  timetravel: false,
  apy: poolsFunction,
    url: 'https://appv2.smartcredit.io',
};