const { request, gql } = require('graphql-request');

exports.getActiveTerms = async (url) => {
  const now = Math.floor(Date.now() / 1000);

  const query = gql`
    {
      terms(where: { start_lte: ${now}, end_gt: ${now} }) {
        id
        assetName
        assetSymbol
        assetDecimals
        underlying
        underlyingName
        underlyingSymbol
        underlyingDecimals
        start
        end
        depositCap
        feeRate
        realizedYield
        depositedAmount
        currentDepositedAmount
        liquidated
        txCount
        provider {
          id
        }
        network
        nextTerm {
          id
        }
      }
    }
  `;

  const { terms } = await request(url, query);

  return terms;
};

exports.getPastAndActiveTerms = async (url) => {
  const now = Math.floor(Date.now() / 1000);

  const query = gql`
    {
      terms(where: { end_gt: ${now} }) {
        id
        assetName
        assetSymbol
        assetDecimals
        underlying
        underlyingName
        underlyingSymbol
        underlyingDecimals
        start
        end
        depositCap
        feeRate
        realizedYield
        depositedAmount
        currentDepositedAmount
        liquidated
        txCount
        provider {
          id
        }
        network
        nextTerm {
          id
        }
      }
    }
  `;

  const { terms } = await request(url, query);

  return terms;
};
