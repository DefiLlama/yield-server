const BigNumber = require('bignumber.js')
const { gql, request } = require('graphql-request');

const SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/mikemccready/truefi-legacy'
const LOAN_FACTORY_2_START_BLOCK = 12467595

interface Loan {
  amount: typeof BigNumber
  apy: number
  poolAddress: string
  status: string
}

const getLoans = gql`
  {
    loans(first: 1000) {
      amount
      APY
      poolAddress
      status
    }
  }
`

function isLoanActive (status: string) {
  return status === '1' || status === '2'
}

async function getActiveLoans() {
  const { loans } = await request(SUBGRAPH_URL, getLoans.replace('<PLACEHOLDER>', LOAN_FACTORY_2_START_BLOCK))
  const activeLoansRaw = loans.filter(({ status }) => isLoanActive(status))
  const activeLoans: Loan[] = activeLoansRaw.map(({ amount, ...rest }) => ({
    ...rest,
    amount: new BigNumber(Number(amount))
  }))
  return activeLoans
}

module.exports = {
  getActiveLoans
}
