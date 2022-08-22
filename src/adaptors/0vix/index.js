const {ethers} = require("ethers");
const {OvixABI, unitrollerABI, erc20ABI, oracleABI} = require("./Abis");
const {PROVIDER} = require("./Provider");
const sdk = require("@defillama/sdk");

const unitroller = "0x8849f1a0cB6b5D6076aB150546EddEe193754F1C";
const oracleContract = '0x1c312b14c129EabC4796b0165A2c470b659E5f01';



async function main() {
    let data = [];
    let tvl;

    // retrieve up-to-date tokens list
    const strategiesList = await getAllMarkets();

    for (let strategy of strategiesList) {
        const OvixAPYs = await getAPY(strategy);

        tvl = await getErc20Balances(strategy);


        const newObj = {
            pool: strategy,
            project: "0vix",
            symbol: OvixAPYs.tokenName,
            chain: "polygon",
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
        strategy,
        OvixABI,
        PROVIDER
    );

    // get the token name
    const tokenName = await contract.name();

    // retrieve the supply rate per timestamp for the main0vixContract
    const supplyRatePerTimestamp =
        await contract.supplyRatePerTimestamp();

    const supplyAPY = calculateAPY(supplyRatePerTimestamp);

    const borrowRatePerTimestamp =
        await contract.borrowRatePerTimestamp();
    const borrowAPY = calculateAPY(borrowRatePerTimestamp);

    return { tokenName, supplyAPY, borrowAPY };
}

function calculateAPY(rate) {
    const year = 365 * 24 * 60 * 60;
    let a = 1 + rate / 1e18;
    a = parseFloat(String(a));
    const b = Math.pow(a, year);
    return (b - 1) * 100;
}

// retrieve all token markets
async function getAllMarkets() {
    const unitrollerContract = new ethers.Contract(
        unitroller,
        unitrollerABI,
        PROVIDER,
    );

    // get all the oToken addresses from the unitroller contract
    const allMarkets = await unitrollerContract.getAllMarkets();

    return allMarkets;
}


async function getErc20Balances(strategy) {

    // retrieve the asset contract
    const oTokenContract = new ethers.Contract(
        strategy,
        OvixABI,
        PROVIDER
    );

    // get decimals for the oToken
    const oDecimals = parseInt(await oTokenContract.decimals());

    // get the total supply
    const oTokenTotalSupply = await oTokenContract.totalSupply();

    // get the exchange rate stored
    const oExchangeRateStored = await oTokenContract.exchangeRateStored();

    // // get the contract for the underlying token
    const underlyingTokenAddress = new ethers.Contract(
        strategy,
        erc20ABI,
        PROVIDER,
    );

    // retrieve the oracle contract
    const oracle = new ethers.Contract(
        oracleContract,
        oracleABI,
        PROVIDER,
    );

    // get the decimals for the underlying token
    const underlyingDecimals = parseInt(
        await underlyingTokenAddress.decimals(),
    );

    // get the underlying price of the asset from the oracle
    const oracleUnderlyingPrice = Number(
        await oracle.getUnderlyingPrice(strategy),
    );


    // do the conversions
    return convertTvlUSD(
        oTokenTotalSupply,
        oExchangeRateStored,
        oDecimals,
        underlyingDecimals,
        oracleUnderlyingPrice,
    );
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

function convertTvlUSD(
    totalSupply,
    exchangeRateStored,
    oDecimals,
    underlyingDecimals,
    oracleUnderlyingPrice,
) {
    return (
        (((totalSupply * exchangeRateStored) / 10 ** (18 + underlyingDecimals)) *
            oracleUnderlyingPrice) /
        10 ** (36 - underlyingDecimals)
    );
}


module.exports = {
    apy: main
}

