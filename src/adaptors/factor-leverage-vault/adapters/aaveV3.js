const sdk = require('@defillama/sdk3');
const utils = require('../../utils');
const { makeReadable, getCoinPriceMap } = require('./utils');

const poolAddress = '0x794a61358d6845594f94dc1db02a252b5b4814ad';
const poolAbis = [
    'uint256:getReserveNormalizedIncome',
    'uint256:getReserveNormalizedIncome',
];

async function getAssetRatesMap(addresses) {
    const ratePromises = addresses.map(async (address) => {
        const { output } = await sdk.api.abi.call({
            target: poolAddress,
            abi: poolAbis[0],
            params: [address],
            chain: 'arbitrum',
        });
        return output;
    });
    const ratesMap = rates.reduce((acc, rate, index) => {
        acc[addresses[index]] = makeReadable(rate, 27);
        return acc;
    }, {});

    return ratesMap;
}

async function getDebtRatesMap(addresses) {
    const ratePromises = addresses.map(async (address) => {
        const { output } = await sdk.api.abi.call({
            target: poolAddress,
            abi: poolAbis[1],
            params: [address],
            chain: 'arbitrum',
        });
        return output;
    });
    const ratesMap = rates.reduce((acc, rate, index) => {
        acc[addresses[index]] = makeReadable(rate, 27);
        return acc;
    }, {});

    return ratesMap;
}

function setPairTvl(pairTvl, assetTokenAddress, debtTokenAddress, balance) {
    pairTvl = {
        ...pairTvl,
        [assetTokenAddress]: {
            ...pairTvl[assetTokenAddress],
            [debtTokenAddress]: balance,
        },
    };
    return pairTvl;
}

async function calculatePairTvlUsd(pairStates) {
    const assetAddresses = [];
    const debtAddresses = [];

    for (let i = 0; i < pairStates.length; i++) {
        const { assetTokenAddress, debtTokenAddress } = pairStates[i];
        assetAddresses.push(assetTokenAddress);
        debtAddresses.push(debtTokenAddress);
    }
    const underlyingAssetAddresses = [
        ...new Set([...assetAddresses, ...debtAddresses]),
    ];

    const [assetRateMap, debtRateMap, priceMap] = await Promise.all([
        getAssetRatesMap(assetAddresses),
        getDebtRatesMap(debtAddresses),
        getCoinPriceMap(underlyingAssetAddresses, this.chainId),
    ]);

    let pairTvl = {};

    for (let i = 0; i < pairStates.length; i++) {
        const {
            assetTokenAddress,
            debtTokenAddress,
            assetBalanceRaw,
            debtBalanceRaw,
        } = pairStates[i];

        const assetRate = assetRateMap[assetTokenAddress];
        const debtRate = debtRateMap[debtTokenAddress];

        const assetBalance =
            makeReadable(parseInt(assetBalanceRaw) * parseInt(assetRate), 27) /
            10 ** priceMap[assetTokenAddress].decimals;
        const debtBalance =
            makeReadable(parseInt(debtBalanceRaw) * parseInt(debtRate), 27) /
            10 ** priceMap[debtTokenAddress].decimals;

        const assetBalanceInUsd =
            assetBalance * priceMap[assetTokenAddress].price;

        const debtBalanceInUsd = debtBalance * priceMap[debtTokenAddress].price;

        const netBalanceInUsd = assetBalanceInUsd + debtBalanceInUsd;

        pairTvl = setPairTvl(
            pairTvl,
            assetTokenAddress,
            debtTokenAddress,
            netBalanceInUsd.toFixed(2)
        );
    }

    return pairTvl;
}

module.exports = {
    calculatePairTvlUsd,
};
