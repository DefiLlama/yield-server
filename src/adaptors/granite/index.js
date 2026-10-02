const axios = require('axios');
const { callReadOnlyFunction, contractPrincipalCV } = require('@stacks/transactions');

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
            collateral: {
                contractAddress: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4',
                contractName: 'sbtc-token',
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

                const totalAssets = await callReadOnly(market.contracts.state, 'get-lp-params', [])
                    .then(r => Number(r.data['total-assets'].value) / Math.pow(10, market.decimals));

                const openInterest = await callReadOnly(market.contracts.state, 'get-debt-params', [])
                    .then(r => Number(r.data['open-interest'].value) / Math.pow(10, market.decimals));

                const marketState = await callReadOnly(market.contracts.util, 'get-market-state', [])
                    .then(r => r.value.data);

                const scale = Math.pow(10, market.decimals);
                
                const protocolReservePercentage =
                    Number(marketState['on-chain-accrue-params'].data['protocol-reserve-percentage'].value) / ONE_8;
                
                const openInterestAccrued =
                    (Number(marketState['lp-open-interest'].value) +
                        Number(marketState['staked-open-interest'].value) +
                        Number(marketState['protocol-open-interest'].value)) / scale;

                const utilizationRate = computeUtilizationRate(openInterest, totalAssets);

                const irParams = await callReadOnly(market.contracts.ir, 'get-ir-params', [])
                    .then(r => ({
                        urKink: Number(r.data['utilization-kink'].value) / ONE_12,
                        baseIR: Number(r.data['base-ir'].value) / ONE_12,
                        slope1: Number(r.data['ir-slope-1'].value) / ONE_12,
                        slope2: Number(r.data['ir-slope-2'].value) / ONE_12,
                    }));

                const collateralInfo = await callReadOnly(
                    market.contracts.state,
                    'get-collateral',
                    [contractPrincipalCV(market.contracts.collateral.contractAddress, market.contracts.collateral.contractName)]
                );
                const ltv = Number(collateralInfo.value.data['max-ltv'].value) / ONE_8;

                const borrowApy = calculateBorrowAPY(utilizationRate, irParams) * 100;

                const supplyApy = calculateLpAPY(utilizationRate, irParams, protocolReservePercentage) * 100;

                const tvlUsd =
                    (Number(marketState['market-token-balance'].value) / scale) * priceResult.price;
                
                const totalBorrowUsd = openInterestAccrued * priceResult.price;

                const totalSupplyUsd =
                    (Number(marketState['total-assets'].value) / scale) * priceResult.price;

                results.push({
                    pool: `${market.contracts.state.contractAddress}.${market.contracts.state.contractName}-${CHAIN}`.toLowerCase(),
                    chain: CHAIN,
                    project: 'granite',
                    symbol: market.symbol,
                    tvlUsd: tvlUsd,
                    totalSupplyUsd,
                    totalBorrowUsd,
                    apyBase: supplyApy,
                    apyBaseBorrow: borrowApy,
                    ltv,
                    underlyingTokens: [`${market.contracts.asset.contractAddress}.${market.contracts.asset.contractName}`],
                    token: `${market.contracts.asset.contractAddress}.${market.contracts.asset.contractName}`,
                    url: 'https://app.granite.world',
                });
            } catch (error) {
                throw new Error(`Error processing pool ${market.symbol}: ${error.message}`);
            }
        }

        return results;

    } catch (error) {
        throw new Error(`Error in getGraniteMarkets: ${error.message}`);
    }
}

module.exports = {
    protocolId: '6268',
    timetravel: false,
    apy: getGraniteMarkets,
    url: 'https://app.granite.world',
};
