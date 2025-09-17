const axios = require('axios');
const sdk = require('@defillama/sdk');

const MOAR_APP_URL = 'https://app.moar.market';
const MOAR_ADDRESS = "0xa3afc59243afb6deeac965d40b25d509bb3aebc12f502b8592c283070abc2e07";
const MOAR_PACKAGE_OWNER_ADDRESS = "0x37e9ce6910ceadd16b0048250a33dac6342549acf31387278ea0f95c9057f110";

async function apy() {
    const poolsConfig = await getAptosResource(MOAR_PACKAGE_OWNER_ADDRESS, `${MOAR_ADDRESS}::pool::PoolConfigs`)
    const poolAddresses =  poolsConfig['data']['all_pools']['inline_vec'].map(x => x['inner'])

    const pools = [];
    let poolIndex = 0;
    for (const poolAddress of poolAddresses) {
        const poolData = (await getAptosResource(poolAddress, `${MOAR_ADDRESS}::pool::Pool`)).data
        const underlyingAsset = poolData.underlying_asset.inner;
        const rewardTokens = [];
        let apyReward = null;

        const [faSymbol, interestRateResponse, incentivesEnabled] = await Promise.all([
            aptosView({
                functionStr: "0x1::fungible_asset::symbol",
                type_arguments: ["0x1::fungible_asset::Metadata"],
                args: [underlyingAsset]}),
            aptosView({
                functionStr: `${MOAR_ADDRESS}::pool::get_interest_rate`,
                type_arguments: [],
                args: [poolIndex.toString()]}),
            aptosView({
                functionStr: `${MOAR_ADDRESS}::farming::is_farming_enabled`,
                type_arguments: [],
                args: [`${poolAddress}-${poolIndex}`]})
        ])
        
        if (incentivesEnabled) {
            const incentiveRate = await aptosView({
                functionStr: `${MOAR_ADDRESS}::pool::get_farming_pool_apy`,
                type_arguments: [],
                args: [poolIndex.toString(), "APT-1"]});
            apyReward = Number(incentiveRate) / 1e6;
            rewardTokens.push("0xa");
        }
        const interestRate = interestRateResponse[0];

        pools.push({
            pool: `${poolAddress}_aptos`,
            chain: 'aptos',
            project: 'moar-market',
            apyBase: (interestRate / 1e8 * (1 - poolData.fee_on_interest_bps / 1e4)) * 100,
            apyReward: apyReward,
            apyBaseBorrow: interestRate / 1e8 * 100,
            apyRewardBorrow: null,
            totalSupplyUsd: await getUSDValue(poolData.total_deposited, underlyingAsset),
            totalBorrowUsd: await getUSDValue(poolData.total_borrows, underlyingAsset),
            rewardTokens: rewardTokens,
            symbol: faSymbol,
            tvlUsd: await getUSDValue(poolData.total_deposited - poolData.total_borrows, underlyingAsset),
            underlyingTokens: [underlyingAsset],
            url: `${MOAR_APP_URL}/lend/${faSymbol.toLowerCase()}`,
        })
        poolIndex++;
    }

    return pools;
}

async function getUSDValue(amount, asset) {
    const chainApi = new sdk.ChainApi({ chain: 'aptos' })
    chainApi.addToken(asset, amount)
    const usdValue = await chainApi.getUSDValue()
    return usdValue
}

async function getAptosResource(address, resource) {
    const response = await axios.get(`https://api.mainnet.aptoslabs.com/v1/accounts/${address}/resource/${resource}`)
    return response.data
}

async function aptosView({ functionStr, type_arguments = [], args = [], ledgerVersion = undefined }) {
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
