const axios = require('axios');
const { callReadOnlyFunction } = require('@stacks/transactions');

/* Constants */

const ONE_8 = 100000000;
const ONE_12 = 1000000000000;
const SECONDS_IN_A_YEAR = 365 * 24 * 60 * 60;
const CHAIN = 'Stacks';
const NETWORK = 'mainnet';

const MARKETS = [
    {
        symbol: 'USDCx',
        decimals: 6,
        priceKeys: [
            'stacks:SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
            'coingecko:usd-coin',
        ],
        contracts: {
            asset: {
                contractAddress: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE',
                contractName: 'usdcx'
            },
            state: {
                contractAddress: 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE',
                contractName: 'state-v1',
            },
            ir: {
                contractAddress: 'SPSX722NK9V3A8D3CVQT0CDY4EBQ3E9FSDDE61FT',
                contractName: 'linear-kinked-ir-v1',
            },
            util: {
                contractAddress: 'SPSX722NK9V3A8D3CVQT0CDY4EBQ3E9FSDDE61FT',
                contractName: 'utility',
            }
        },
    },
];

/* Granite math functions */

const computeUtilizationRate = (
    openInterest,
    totalAssets
) => {
    if (totalAssets == 0) return 0;
    return openInterest / totalAssets;
};

function annualizedAPR(ur, irParams) {
    let ir;
    if (ur < irParams.urKink) ir = irParams.slope1 * ur + irParams.baseIR;
    else
        ir =
            irParams.slope2 * (ur - irParams.urKink) +
            irParams.slope1 * irParams.urKink +
            irParams.baseIR;

    return ir;
}

const calculateLpAPY = (
    ur,
    irParams,
    protocolReservePercentage
) => {
    if (ur == 0) return 0;
    else {
        const lpAPR =
            annualizedAPR(ur, irParams) * (1 - protocolReservePercentage) * ur;
        return (1 + lpAPR / SECONDS_IN_A_YEAR) ** SECONDS_IN_A_YEAR - 1;
    }
};

const calculateBorrowAPY = (
    ur,
    irParams
) => {
    const borrowApr = annualizedAPR(ur, irParams);
    return (1 + borrowApr / SECONDS_IN_A_YEAR) ** SECONDS_IN_A_YEAR - 1;
};

const computeTotalEarning = (
    shares,
    totalAssetsAccrued,
    totalLpShares,
    reserveBalance
) => {
    return Math.max(
        0,
        convertLpSharesToAssets(shares, totalLpShares, totalAssetsAccrued) -
        reserveBalance
    );
};

const convertLpSharesToAssets = (
    shares,
    totalLpShares,
    totalAssetsAccrued
) => {
    if (totalAssetsAccrued == 0) return 0;
    return (shares * totalAssetsAccrued) / totalLpShares;
};

/* Contract read helper */

const callReadOnly = async (contract, functionName, functionArgs) => {
    return callReadOnlyFunction({
        contractAddress: contract.contractAddress,
        contractName: contract.contractName,
        functionName: functionName,
        network: NETWORK,
        functionArgs: functionArgs,
        senderAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    });
}

/* Price helpers */

async function fetchPrices() {
    const keys = [...new Set(MARKETS.flatMap((p) => p.priceKeys))].join(',');
    const url = `https://coins.llama.fi/prices/current/${keys}`;
    const { data } = await axios.get(url, { timeout: 10_000 });
    return data.coins;
}


function getPrice(prices, priceKeys) {
    for (const key of priceKeys) {
        if (prices[key]?.price) return { price: prices[key].price, key };
    }
    return null;
}

/* Main function */

const getGraniteMarkets = async () => {
    try {
        const prices = await fetchPrices();

        const results = [];

        for (const market of MARKETS) {
            try {

                const priceResult = getPrice(prices, market.priceKeys);
                if (!priceResult) {
                    console.log(`Skipping ${market.symbol}: price not available`);
                    continue;
                }

                const { totalAssets, totalShares } = await callReadOnly(market.contracts.state, 'get-lp-params', [])
                    .then(r => ({
                        totalAssets: Number(r.data['total-assets'].value) / Math.pow(10, market.decimals),
                        totalShares: Number(r.data['total-shares'].value) / Math.pow(10, market.decimals)
                    }));

                const { openInterest } = await callReadOnly(market.contracts.state, 'get-debt-params', [])
                    .then(r => ({
                        openInterest: Number(r.data['open-interest'].value) / Math.pow(10, market.decimals),
                    }));

                const { totalAssetsAccrued, reserveBalance, protocolReservePercentage } = await callReadOnly(market.contracts.util, 'get-market-state', [])
                    .then(r => ({
                        totalAssets: Number(r.value.data['total-assets'].value),
                        reserveBalance: Number(r.value.data['reserve-balance'].value),
                        protocolReservePercentage: Number(r.value.data['on-chain-accrue-params'].data['protocol-reserve-percentage'].value)
                    })).then(r => ({
                        totalAssetsAccrued: r.totalAssets / Math.pow(10, market.decimals),
                        reserveBalance: r.reserveBalance / Math.pow(10, market.decimals),
                        protocolReservePercentage: r.protocolReservePercentage / ONE_8
                    }));

                const utilizationRate = computeUtilizationRate(openInterest, totalAssets);

                const irParams = await callReadOnly(market.contracts.ir, 'get-ir-params', [])
                    .then(r => ({
                        urKink: Number(r.data['utilization-kink'].value) / ONE_12,
                        baseIR: Number(r.data['base-ir'].value) / ONE_12,
                        slope1: Number(r.data['ir-slope-1'].value) / ONE_12,
                        slope2: Number(r.data['ir-slope-2'].value) / ONE_12,
                    }));

                const borrowApy = calculateBorrowAPY(utilizationRate, irParams) * 100;

                const supplyApy = calculateLpAPY(utilizationRate, irParams, protocolReservePercentage) * 100;

                const tvlUsd = computeTotalEarning(
                    totalShares,
                    totalAssetsAccrued,
                    totalShares,
                    reserveBalance
                ) * priceResult.price;

                results.push({
                    pool: `${market.contracts.state.contractAddress}.${market.contracts.state.contractName}-${CHAIN}`.toLowerCase(),
                    chain: CHAIN,
                    project: 'granite',
                    symbol: market.symbol,
                    tvlUsd: tvlUsd,
                    apyBase: supplyApy,
                    apyBaseBorrow: borrowApy,
                    underlyingTokens: [`${market.contracts.asset.contractAddress}.${market.contracts.asset.contractName}`],
                    token: `${market.contracts.asset.contractAddress}.${market.contracts.asset.contractName}`,
                    url: 'https://app.granite.world',
                });
            } catch (error) {
                console.log(`Error processing pool ${market.symbol}: ${error.message}`);
            }
        }

        return results;

    } catch (error) {
        console.log(`Error in getGraniteMarkets: ${error.message}`);
        return [];
    }
}

module.exports = {
    protocolId: '6268',
    timetravel: false,
    apy: getGraniteMarkets,
    url: 'https://app.granite.world',
};
