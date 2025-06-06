const utils = require('../utils');
const axios = require('axios');

const endpoint = 'https://cu.ao-testnet.xyz'
const controllerId = 'SmmMv0rJwfIDVM3RvY2-P729JFYwhdGSeGo2deynbfY'
const redstoneOracleAddress = 'R5rRjBFS90qIGaohtzd1IoyPwZD0qJZ25QXkP7_p5a0'
const chain = 'AO'


const apy = async () => {

    const supportedTokensRes = await DryRun(controllerId, "Get-Tokens")
    const supportedTokens = JSON.parse(supportedTokensRes.Messages[0].Data)

    const redstoneTickers = JSON.stringify(supportedTokens.map(token => token.ticker))
    const redstonePriceFeedRes = await DryRun(redstoneOracleAddress, "v2.Request-Latest-Data", [["Tickers", redstoneTickers]]);
    const redstonePrices = JSON.parse(redstonePriceFeedRes.Messages[0].Data)

    const poolPromises = supportedTokens.map(async poolObject => {

    const getAPRRes = await DryRun(poolObject.oToken, "Get-APR");
    const APRTagsObject = Object.fromEntries(
        getAPRRes.Messages[0].Tags.map((tag) => [tag.name, tag.value])
    );
    const borrowAPR = formatBorrowAPR(APRTagsObject)
   
    const infoRes = await DryRun(poolObject.oToken, "Info");
    const infoTagsObject = Object.fromEntries(
        infoRes.Messages[0].Tags.map((tag) => [tag.name, tag.value])
    );

    const ticker = poolObject.ticker
    const tokenUSDPrice = (redstonePrices[ticker]).v

    const totalLends = scaleBalance(infoTagsObject['Cash'], infoTagsObject['Denomination'])
    const totalBorrows = scaleBalance(infoTagsObject['Total-Borrows'], infoTagsObject['Denomination'])
    const totalSupply = scaleBalance(infoTagsObject['Total-Supply'], infoTagsObject['Denomination'])

    let supplyAPY = formatSupplyAPR(borrowAPR,  infoTagsObject, totalBorrows, totalSupply)

    if (supplyAPY.toString() === 'NaN') {
        supplyAPY = 0
    }

    const ltv = Number(infoTagsObject['Collateral-Factor']) / 100

    const tokenID = poolObject.id
    const oTokenID = poolObject.oToken
    
    return {
        pool: `${oTokenID}-${chain}`.toLowerCase(),
        chain,
        project: 'liquidops',
        symbol: utils.formatSymbol(`o${ticker}`),
        tvlUsd: totalLends * tokenUSDPrice,
        apyBase: supplyAPY,
        underlyingTokens: [tokenID],
        url: `https://liquidops.io/${ticker}`,
        apyBaseBorrow: borrowAPR,
        totalSupplyUsd: totalSupply * tokenUSDPrice,
        totalBorrowUsd: totalBorrows * tokenUSDPrice,
        ltv
        };
    });
    
    const poolsArray = await Promise.all(poolPromises);
    
    return poolsArray
 
}


// Access AO on chain data via the node endpoint
async function DryRun(target, action, extraTags = []) {
    const response = await axios.post(`${endpoint}/dry-run?process-id=${target}`, {
        Id: "1234", 
        Target: target, 
        Owner: "1234", 
        Anchor: "0", 
        Data: "1234",
        Tags: [
            ["Target", target],
            ["Action", action],
            ["Data-Protocol", "ao"],
            ["Type", "Message"],
            ["Variant", "ao.TN.1"],
            ...extraTags
        ].map(([name, value]) => ({ name, value }))
    }, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return response.data;
}


function scaleBalance(amount, denomination) {
    const scaledDivider = BigInt(10) ** BigInt(denomination)
    const balance = BigInt(amount)  / scaledDivider
    return Number(balance)
}

function formatBorrowAPR(aprResponse) {
    const apr = parseFloat(aprResponse["Annual-Percentage-Rate"]);
    const rateMultiplier = parseFloat(aprResponse["Rate-Multiplier"]);
    return apr / rateMultiplier
}

function formatSupplyAPR(borrowAPR, infoTagsObject, totalBorrows, totalSupply) {
    const utilizationRate = totalBorrows / totalSupply
    const reserveFactorFract = Number(infoTagsObject['Reserve-Factor']) / 100;
    return borrowAPR * utilizationRate * (1 - reserveFactorFract);
}


module.exports = {
    apy,
};
// npm run test --adapter=liquidops

