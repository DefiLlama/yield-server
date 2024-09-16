const { abi } = require('./abi');
const sdk = require('@defillama/sdk');
const { calculateAPY } = require('./utils');
const BigNumber = require('bignumber.js');
const utils = require('../utils');

const chains = ['ethereum', 'arbitrum', 'polygon', 'base'];
const UI_POOL_DATA_PROVIDERS = { "ethereum": '0x6Ab39f4e9F494733893Ca90212558e55C7196012', "arbitrum": '0x775f2616557824bbcf2ea619cA2BacaBd930F2BD', 'polygon': '0x2464dA5c26651cdceD9f6afa9afdc79B5f6413AD', 'base': '0xb9d350537A63B7e5cb02B44e230e093C0abB2707'};
const ADDRESSES_PROVIDERS = { "ethereum": '0x16085E000eAC286aa503326cBcEe4564268a7F8f', "arbitrum": '0x66d2eaD9cbE6754985a9Be7B829502228Ef8b49B', 'polygon': '0x488402D92f32eEdA5cf61521ADf7f8e8f1DcaC20', 'base': '0x5C6C6ab99afDa79865e57a12c025B0Ad355276aC'};

async function apy() {
    const pools = await Promise.all(
        chains.map(async (chain) => {
            const uiPoolDataProviderAddress = UI_POOL_DATA_PROVIDERS[chain];
            const addressesProviderAddress = ADDRESSES_PROVIDERS[chain];
            const reservesData = (await sdk.api.abi.call({
                target: uiPoolDataProviderAddress,
                abi: abi,
                params: addressesProviderAddress,
                chain,
            })).output[0];
            const pools = reservesData
                .map((reserve, index) => {
                    const tvlUsd = new BigNumber(reserve.availableLiquidity)
                        .multipliedBy(reserve.priceInMarketReferenceCurrency)
                        .shiftedBy(-(Number(reserve.decimals) + 8))
                        .toNumber();
                    const totalBorrowUsd = new BigNumber(reserve.totalScaledVariableDebt)
                        .multipliedBy(reserve.variableBorrowIndex)
                        .multipliedBy(reserve.priceInMarketReferenceCurrency)
                        .shiftedBy(-(27 + Number(reserve.decimals) + 8))
                        .toNumber();
                    const totalSupplyUsd = tvlUsd + totalBorrowUsd;
                    return {
                        pool: `${reserve.yTokenAddress}-${chain}`.toLowerCase(),
                        chain: utils.formatChain(chain),
                        project: 'yldr',
                        symbol: reserve.symbol,
                        tvlUsd,
                        apyBase: calculateAPY(reserve.liquidityRate).toNumber() * 100,
                        underlyingTokens: [reserve.underlyingAsset],
                        totalSupplyUsd,
                        totalBorrowUsd,
                        apyBaseBorrow:
                            calculateAPY(reserve.variableBorrowRate).toNumber() * 100,
                        ltv: reserve.baseLTVasCollateral / 10000,
                        url: `https://yldr.com/lending`,
                        borrowable: reserve.borrowingEnabled,
                    };
                });

            return pools;
        })
    );
    return pools.flat();
}

module.exports = {
    timetravel: true,
    apy: apy,
};
