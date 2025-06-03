const axios = require('axios');
const sdk = require('@defillama/sdk');

const MOAR_APP_URL = 'https://app.moar.market';
const MOAR_ADDRESS = "0xa3afc59243afb6deeac965d40b25d509bb3aebc12f502b8592c283070abc2e07";

async function apy() {
    const allPoolsResponse = await function_view({
        functionStr: `${MOAR_ADDRESS}::pool::get_all_pools`,
        type_arguments: [],
        args: [],
    })

    const pools = [];
    for (const poolData of allPoolsResponse) {
        const underlyingAsset = poolData.underlying_asset.inner;
        const faSymbol = await function_view({
            functionStr: "0x1::fungible_asset::symbol",
            type_arguments: ["0x1::fungible_asset::Metadata"],
            args: [underlyingAsset],
        })

        pools.push({
            pool: poolData.name,
            chain: 'aptos',
            project: 'moar-market',
            apyBase: (poolData.interest_rate / 1e8 * (1 - poolData.fee_on_interest_bps / 1e4)) * 100,
            apyReward: null,
            apyBaseBorrow: poolData.interest_rate / 1e8 * 100,
            apyRewardBorrow: null,
            totalSupplyUsd: await getUSDValue(poolData.total_deposited, underlyingAsset),
            totalBorrowUsd: await getUSDValue(poolData.total_borrows, underlyingAsset),
            rewardTokens: [],
            symbol: faSymbol,
            tvlUsd: await getUSDValue(poolData.total_deposited - poolData.total_borrows, underlyingAsset),
            underlyingTokens: [poolData.underlying_asset.inner],
            url: `${MOAR_APP_URL}/lend/${faSymbol.toLowerCase()}`,
        })
    }

    return pools;
}

async function getUSDValue(amount, asset) {
    const chainApi = new sdk.ChainApi({ chain: 'aptos' })
    chainApi.addToken(asset, amount)
    const usdValue = await chainApi.getUSDValue()
    return usdValue
}

async function function_view({ functionStr, type_arguments = [], args = [], ledgerVersion = undefined }) {
    let path = `https://api.mainnet.aptoslabs.com/v1/view`
    if (ledgerVersion !== undefined) path += `?ledger_version=${ledgerVersion}`
    const response = await axios.post(path,
        { "function": functionStr, "type_arguments": type_arguments, arguments: args },
        {
            headers: {
                'Content-Type': 'application/json',
            },
        }
    )
    return response.data.length === 1 ? response.data[0] : response.data
}

module.exports = {
    timetravel: true,
    apy: apy,
    url: `${MOAR_APP_URL}/lend`,
};
