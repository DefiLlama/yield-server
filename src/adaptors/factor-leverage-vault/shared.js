const { request, gql } = require('graphql-request');

function getAdapterByMarket(market) {
    if (market === 'aaveV3') {
        return require('./aaveV3');
    } else {
        return {
            calculateTVLPerPairinUSD: () => 0,
        }
    }
}

async function getTvl(poolAddress, assetAddress, debtAddress) {
    const subgraphUrl =
        'https://api.thegraph.com/subgraphs/name/dimasriat/factor-leverage-vault';

    const vaultAddressLowercase = poolAddress.toLowerCase();
    const assetAddressLowercase = assetAddress.toLowerCase();
    const debtAddressLowercase = debtAddress.toLowerCase();

    const queries = gql`
        query LeveragePairState(
            $vaultAddress: ID!
            $assetAddress: String
            $debtAddress: String
        ) {
            factorLeverageVault(id: $vaultAddress) {
                id
                name
                symbol
                pairState(
                    where: {
                        assetTokenAddress: $assetAddress
                        debtTokenAddress: $debtAddress
                    }
                ) {
                    assetTokenAddress
                    debtTokenAddress
                    assetBalanceRaw
                    debtBalanceRaw
                    leverageVault {
                        id
                    }
                }
            }
        }
    `;

    const result = await request(subgraphUrl, queries, {
        vaultAddress: vaultAddressLowercase,
        assetAddress: assetAddressLowercase,
        debtAddress: debtAddressLowercase,
    });

    const { symbol, pairState } = result.factorLeverageVault;

    const adapter = getAdapterByMarket(symbol);

    const tvlPerPair = await adapter.calculateTVLPerPairinUSD(pairState);

    const pairTvl =
        tvlPerPair[assetAddressLowercase]?.[debtAddressLowercase] ??
        0;

    return pairTvl;
}


module.exports = {
    getTvl,
};
