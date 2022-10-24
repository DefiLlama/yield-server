const utils = require('../utils');
const { request, gql } = require('graphql-request');
const { cronosPools } = require('../magik-farm/config');

const URL = "https://api.thegraph.com/subgraphs/name/protofire/maker-protocol";
const query = gql`
    query CollateralTypesQuery {
        collateralTypes {
            totalCollateral
            rate
            id
            stabilityFee
            totalDebt
            debtNormalized
            debtCeiling
            auctionDuration
            price {
                id
                value
            }
        }
    }
`;

const main = async (timestamp) => {
    const data = (await request(URL, query)).collateralTypes
    return data.map(pool => {
        return {
            pool: pool.id + `-ethereum`,
            chain: utils.formatChain('ethereum'),
            project: 'makerdao',
            symbol: pool.id,
            apy: 0,
            tvlUsd: Number(pool.totalCollateral),
            apyBaseBorrow: Number(pool.rate),
        }
    })
};

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://makerdao.com/'
};