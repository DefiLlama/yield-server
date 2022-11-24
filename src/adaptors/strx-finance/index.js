const utils = require('../utils');
const {
    request,
    gql,
    GraphQLClient
} = require('graphql-request');

const client = new GraphQLClient('https://graphql.bitquery.io', {
    headers: {
      'X-API-KEY': 'BQYXycn5sT0mgVrAyf0FjAeMwfGeVEia'
    }
});

const STAKING_ADDRESS = 'TGrdCu9fu8csFmQptVE25fDzFmPU9epamH';
const FREEZE_ADDRESS = 'TSTrx3UteLMBdeGe9Edwwi2hLeQCmLPZ5g';

async function getRevenue() {
    const query = gql`
  query {
    tron {
      transfers(
        currency: {is: "TRX"}
        receiver: {is: "${STAKING_ADDRESS}"}
        success: true
        external: true
        date: {since: "${new Date(new Date()-604800*1000).toISOString()}", till: "${new Date().toISOString()}"}
      ) {
        amount
        contractType(contractType: {is: Transfer})
      }
    }
  }
  `;
    const data = await client.request(query);
    return (data.tron.transfers[0].amount * (10 ** 6));
}

async function getTrxBalance(address) {
    const data = await utils.getData('https://apilist.tronscan.org/api/account?address=' + address);
    return data.balance + (data.totalFrozen || 0)
}

async function getCurrentStake() {
    let stakingBalance = await getTrxBalance(STAKING_ADDRESS);
    let frozenBalance = await getTrxBalance(FREEZE_ADDRESS);
    return stakingBalance + frozenBalance;
}

async function calcAPY(revenue, stake) {
    return (revenue * 365 / 7 / stake) * 100;
}

const poolsFunction = async () => {
    const revenue = await getRevenue();
    const totalStake = await getCurrentStake();
    const weeklyAPY = await calcAPY(revenue, totalStake);
    const dataTvl = await utils.getData(
        'https://api.llama.fi/tvl/strx-finance'
    );

    const StakingPool = {
        pool: 'TGrdCu9fu8csFmQptVE25fDzFmPU9epamH',
        chain: utils.formatChain('tron'),
        project: 'strx-finance',
        symbol: utils.formatSymbol('TRX'),
        tvlUsd: dataTvl,
        apyBase: Number(weeklyAPY)
    };

    return [StakingPool];
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: "https://app.strx.finance",
};
