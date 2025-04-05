const utils = require('../utils');
const axios = require('axios');

const endpoint = 'https://cu.ao-testnet.xyz'
const controllerId = 'SmmMv0rJwfIDVM3RvY2-P729JFYwhdGSeGo2deynbfY'
const chain = 'AO'

const apy = async () => {

    const supportedTokensRes = await DryRun(controllerId, "Get-Tokens")
    const supportedTokens = JSON.parse(supportedTokensRes.Messages[0].Data)
    const poolPromises = supportedTokens.map(async poolObject => {


    const getAPRRes = await DryRun(poolObject.oToken, "Get-APR");
    const APRTagsObject = Object.fromEntries(
        getAPRRes.Messages[0].Tags.map((tag) => [tag.name, tag.value])
    );
    // TODO: find supply APR and borrow APR
    const supplyAPY = 1
    const borrowAPR = 1

    const infoRes = await DryRun(poolObject.oToken, "Info");
    const infoTagsObject = Object.fromEntries(
        infoRes.Messages[0].Tags.map((tag) => [tag.name, tag.value])
    );

    const ticker = poolObject.ticker
    const tokenUSDPrice = 1 // TODO: find QAR/USDC price

    const totalLends = scaleBalance(infoTagsObject['Cash'], infoTagsObject['Denomination'])
    const totalBorrows = scaleBalance(infoTagsObject['Total-Borrows'], infoTagsObject['Denomination'])
    const ltv = Number(infoTagsObject['Collateral-Factor']) / 100 // TODO: double check this
    
    return {
        pool: `${ReceivedTokenAddress}-${chain}`.toLowerCase(),
        chain,
        project: 'liquidops',
        symbol: utils.formatSymbol(`o${poolObject.ticker}`),
        tvlUsd: totalLends * tokenUSDPrice,
        apyBase: supplyAPY,
        apyReward: null,
        rewardTokens: null,
        underlyingTokens: [poolObject.id],
        poolMeta: null,
        url: `https://liquidops.io/${ticker}`,
        apyBaseBorrow: borrowAPR,
        apyRewardBorrow: null,
        totalSupplyUsd: totalLends * tokenUSDPrice,
        totalBorrowUsd: totalBorrows * tokenUSDPrice,
        ltv
        };
    });
    
    const poolsArray = await Promise.all(poolPromises);
    
    return poolsArray
 
}

apy().then(poolsArray => {
    console.log('Final result:', poolsArray);
  }).catch(error => {
    console.error('Error:', error);
  });


// Access AO on chain data via the node endpoint
async function DryRun(target, action) {
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
            ["Variant", "ao.TN.1"]
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

module.exports = {
    apy,
    url: 'https://liquidops.io/',
};
// npm run test --adapter=liquidops




  
