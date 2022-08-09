const {master0vixContact, oMATICContract, WBTCStrategy, DAIStrategy, WETHStrategy, USDTStrategy, MATICStrategy} = require("./Addresses");
const {ethers} = require("ethers");
const {OvixABI, erc20ABI} = require("./Abis");
const {PROVIDER} = require("./Provider");
const sdk = require("@defillama/sdk");

const master0vix = "0x8849f1a0cB6b5D6076aB150546EddEe193754F1C";
const oMATIC = "0xE554E874c9c60E45F1Debd479389C76230ae25A8";
const matic = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";


const strategiesList = [
    WBTCStrategy,
    DAIStrategy,
    WETHStrategy,
    USDTStrategy,
    MATICStrategy
]

async function main() {
    let data = [];
    let tvl;
    for (let strategy of strategiesList) {
        const OvixAPYs = await getAPY(strategy);
        if (strategy.name !== "MATIC") {
            tvl = await getErc20Balances(strategy);
        } else {
            // tvl = await getMaticBalance(strategy);
        }
        const newObj = {
            pool: strategy.address,
            project: strategy.project,
            symbol: strategy.name,
            chain: strategy.chain,
            apy: OvixAPYs.supplyAPY,
            apyBase: OvixAPYs.borrowAPY,
            tvlUsd: tvl
        };

        data.push(newObj);

    }
    return data;
}


async function getAPY(strategy) {
    const contract = new ethers.Contract(
        strategy.address,
        OvixABI,
        PROVIDER
    );

    // retrieve the supply rate per timestamp for the main0vixContract
    const supplyRatePerTimestamp =
        await contract.supplyRatePerTimestamp();

    const supplyAPY = calculateAPY(supplyRatePerTimestamp);

    const borrowRatePerTimestamp =
        await contract.borrowRatePerTimestamp();
    const borrowAPY = calculateAPY(borrowRatePerTimestamp);

    return { supplyAPY, borrowAPY };
}

function calculateAPY(rate) {
    const year = 365 * 24 * 60 * 60;
    let a = 1 + rate / 1e18;
    a = parseFloat(String(a));
    const b = Math.pow(a, year);
    return (b - 1) * 100;
}


async function getErc20Balances(strategy) {
    // retrieve balance
    const erc20Balance = await PROVIDER.getBalance(
        strategy.address
    );

    // retrieve the asset contract
    const erc20Contract = new ethers.Contract(
        strategy.address,
        OvixABI,
        PROVIDER
    );

    // get the current exchange rate
    const exchangeRate = await erc20Contract.exchangeRateStored();

    // get decimals
    const decimals = await erc20Contract.decimals();

    // convert tvl to USD
    const convertedErc20Balance = ethers.utils.formatUnits(erc20Balance, decimals);

    return Number(convertedErc20Balance);
}

function convertUSDC(
    balance,
    exchangeRateStored,
    decimals
) {
    return (
        ((parseFloat(balance) * parseFloat(exchangeRateStored)) /
                        Math.pow(1, Math.pow(10, decimals))) /
        Math.pow(1, Math.pow(10, 18))
    );
}


module.exports = {
    apy: main
}

