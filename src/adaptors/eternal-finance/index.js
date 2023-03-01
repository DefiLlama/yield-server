const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const MODULE_ADDRESS = '0x25a64579760a4c64be0d692327786a6375ec80740152851490cfd0b53604cf95';
const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const RESOURCE_URL = `${NODE_URL}/accounts/${MODULE_ADDRESS}/resources`;
const COINS_LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/';
const VAULT_MODULE_ADDRESS = `${MODULE_ADDRESS}::vault::Vaults`;
const VAULT_CONFIG_MODULE_ADDRESS = `${MODULE_ADDRESS}::vault_config::VaultConfigStore`;
const METADATA_MODULE_ADDRESS = `${MODULE_ADDRESS}::bank::MetaData`;
const IB_TOKEN_PREFIX = `0x1::coin::CoinInfo<${MODULE_ADDRESS}::vault::IbToken<`
const INTEREST_RATE_DENOM = new BigNumber(1000000000000);

function simpleMapToObj(simpleMap,) {
    return Object.fromEntries(simpleMap.map((obj) => [obj.key, obj.value]));
}

async function getAllResources() {
    const accountResources = await utils.getData(RESOURCE_URL);

    let vaultConfigs = {};
    let vaults = {};
    let ibTokenBalance = {};
    let metadata;

    accountResources.forEach(({ type, data }) => {
        if (type === VAULT_CONFIG_MODULE_ADDRESS) {
            vaultConfigs = simpleMapToObj(data.configs.data);
        } else if (type === VAULT_MODULE_ADDRESS) {
            vaults = simpleMapToObj(data.vaults.data);
        } else if (type.slice(0, IB_TOKEN_PREFIX.length) === IB_TOKEN_PREFIX) {
            let tokenStruct = type.split('<').pop().split('>>')[0];
            ibTokenBalance[tokenStruct] = data.supply.vec[0].integer.vec[0].value;
        } else if (type === METADATA_MODULE_ADDRESS) {
            metadata = data;
        }
    })
    
    return {
        vaultConfigs,
        vaults,
        ibTokenBalance,
        metadata,
    }
}

// find interest per sec
function getBorrowingInterest(balance, vaultDebtVal, vaultConfig) {
    const { interest_model: model } = vaultConfig;
    
    if (vaultDebtVal.eq(0) && balance.eq(0)) return new BigNumber(0);

    let total = vaultDebtVal.plus(balance);
    let utilization = vaultDebtVal.times(100).times(INTEREST_RATE_DENOM).div(total);
    if (utilization.lt(model.ceil_slope_1)) {
        let p1 = utilization.times(model.max_interest_slope_1).div(model.ceil_slope_1);
        return p1;
    } else if (utilization.lt(model.ceil_slope_2)) {
        return (new BigNumber(model.max_interest_slope_1)
            .plus(
                (utilization.minus(model.ceil_slope_1))
                    .times(new BigNumber(model.max_interest_slope_2).minus(model.max_interest_slope_1))
                    .div(new BigNumber(model.ceil_slope_2).minus(model.ceil_slope_1))
            )
        );
    } else if (utilization < model.ceil_slope_3) {
        return (new BigNumber(model.max_interest_slope_2)
            .plus(
                (utilization.minus(model.ceil_slope_2))
                    .times(new BigNumber(model.max_interest_slope_3).minus(model.max_interest_slope_2))
                    .div(new BigNumber(model.ceil_slope_3).minus(model.ceil_slope_2))
            )
        );
    } else {
        return new BigNumber(model.max_interest_slope_3);
    }
}

async function main() {
    const {
        vaultConfigs,
        vaults,
        ibTokenBalance,
        metadata,
    } = await getAllResources();

    const tokenPrices = await Promise.all(metadata.banks_arr.map((tokenAddr) => {
        return utils.getData(`${COINS_LLAMA_PRICE_URL}aptos:${tokenAddr}`)
    }))

    const apy = metadata.banks_arr.map((lendingToken, idx) => {
        const tokenPrice = tokenPrices[idx]?.coins?.[`aptos:${lendingToken}`];
        if (!tokenPrice) return undefined;
        const ibTokenSupply = ibTokenBalance[lendingToken];
        const vaultInfo = vaults[lendingToken];
        const vaultConfig = vaultConfigs[lendingToken];
        const totalBalance = new BigNumber(vaultInfo.balance);
        const totalBorrowed = new BigNumber(vaultInfo.vault_debt_val);
        const totalSupply = totalBorrowed.plus(totalBalance)
        const utilization = totalBorrowed.div(totalSupply);
        const borrowingInterest = getBorrowingInterest(totalBalance, totalBorrowed, vaultConfig).div(INTEREST_RATE_DENOM).toNumber() * 100;
        const lendingApy = borrowingInterest * utilization.toNumber() * (1 - 0.18);
        const priceConversionFactor = new BigNumber(1).shiftedBy(-tokenPrice.decimals).times(tokenPrice.price);
        return {
            pool: `${lendingToken}-aptos`.toLowerCase(),
            chain: utils.formatChain('aptos'),
            project: 'eternal-finance',
            symbol: utils.formatSymbol(tokenPrice.symbol),
            tvlUsd: new BigNumber(vaultInfo.balance).multipliedBy(priceConversionFactor).toNumber(),
            apyBase: lendingApy,
            underlyingTokens: [lendingToken],
            apyBaseBorrow: borrowingInterest,
            totalSupplyUsd: totalSupply.multipliedBy(priceConversionFactor).toNumber(),
            totalBorrowUsd: totalBorrowed.multipliedBy(priceConversionFactor).toNumber(),
            ltv: 0,
            poolMeta: '2x leverage'
        };
    }).filter(v => v);
    return apy;
}

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://app.eternalfinance.io/lend',
};
