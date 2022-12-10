// const utils = require('../utils');
const sdk = require('@defillama/sdk');
const axios = require('axios');

const abiProtocol = require('./abis/protocolContractABI.json')
const abiLendingPools = require('./abis/lendingPoolsABI.json');
// const { tokens } = require('../across/constants');

// Fringe's primary contract addy for each chain. 
// The primary contract tells us the list of lending pool contracts.
const primaryContractAddys = [
    {
        "chain":"ethereum",
        "chainSpecificProtocolContractAddy": "0x46558DA82Be1ae1955DE6d6146F8D2c1FE2f9C5E"
    }
];

const getPrices = async (chain, addresses) => {
    const uri = `${addresses.map((address) => `${chain}:${address}`)}`;

    try {    
        const res = await axios.get('https://coins.llama.fi/prices/current/' + uri);
 
        const prices = res.data.coins;
        const pricesObj = Object.entries(prices).reduce(
            (acc, [address, price]) => ({
                ...acc,
                [address.split(':')[1].toLowerCase()]: price.price,
            }),
            {}
        );
        console.log(pricesObj);
        return pricesObj;
    
    } catch (error) {
        console.log(error)
    }
};

const getLenderAPY = async (chain, lendingTokenPoolAddy) => {
    // Calc lender APY for this lending token.
    // Lender APY for lending = (((supplyRatePerBlock / 1e18) * BLOCK_PER_DAY + 1)^DAY_PER_YEAR - 1) * 100
    
    
    let supplyRatePerBlockRes = await sdk.api.abi.call({
        target: lendingTokenPoolAddy,
        chain: chain,
        abi: abiLendingPools.find((e) => e.name === 'supplyRatePerBlock')
    });

    let supplyRatePerBlock = supplyRatePerBlockRes['output'];

    return (((supplyRatePerBlock / 1e18) * 7200 + 1) ** 365 - 1) * 100;
};


// Notes: lending tokens = our interest-bearing fTokens.


// Get the list of lending tokens listed by Fringe, chain by chain.
const allLendingTokens = async () => {
    
    let lendingTokens = [];

    console.log('primaryContractAddys.length', primaryContractAddys.length);
    for (let i = 0; i < primaryContractAddys.length; i++) {
        
        const chainSpecific = primaryContractAddys[i];
        

        // Get count of lending tokens for this chain.
        let lendingTokensCountRes = await sdk.api.abi.call({
            target: chainSpecific.chainSpecificProtocolContractAddy,
            chain: chainSpecific.chain,
            abi: abiProtocol.find((e) => e.name === 'lendingTokensLength')
        });
        let lendingTokensCount = lendingTokensCountRes['output'];

        console.log('lendingTokensCount', lendingTokensCount);

        // Add lending tokens for this chain to our full list. 
        for (let i = 0; i < lendingTokensCount; i++) {
            
            console.log('in lending tokens count loop',i);
            // e.g. USDC addy
            let underlyingTokenAddyRes = await sdk.api.abi.call({
                target: chainSpecific.chainSpecificProtocolContractAddy,
                chain: chainSpecific.chain,
                params: [i],
                abi: abiProtocol.find((e) => e.name === 'lendingTokens')
            });

            let underlyingTokenAddy = underlyingTokenAddyRes['output'].toLowerCase();

            console.log('underlyingTokenAddy ',underlyingTokenAddy);

            // fToken addy. e.g. fUSDC addy 
            let lendingTokenPoolAddyRes = await sdk.api.abi.call({
                target: chainSpecific.chainSpecificProtocolContractAddy,
                chain: chainSpecific.chain,
                params: [underlyingTokenAddy],
                abi: abiProtocol.find((e) => e.name === 'lendingTokenInfo')
            });

            let lendingTokenPoolAddy = lendingTokenPoolAddyRes['output']['bLendingToken'].toLowerCase();

            console.log('lendingTokenPoolAddy', lendingTokenPoolAddy);

            // e.g. USDC
            let underlyingTokenSymbolRes = await sdk.api.abi.call({
                target: underlyingTokenAddy,
                chain: chainSpecific.chain,
                params: [],
                abi: "erc20:symbol"
            });

            let underlyingTokenSymbol = underlyingTokenSymbolRes['output'];

            console.log('underlyingTokenSymbol', underlyingTokenSymbol);

            // Get lend APY for this lending token.
            let lenderAPY = await getLenderAPY(chainSpecific.chain, lendingTokenPoolAddy);

            console.log('lenderAPY', lenderAPY);

            //////////// Calc TVL in USD for the lending token.
            // From the lending token, get decimals. 
            let decimalsOfLendingTokenRes = await sdk.api.abi.call({
                target: underlyingTokenAddy,
                chain: chainSpecific.chain,
                params: [],
                abi: "erc20:decimals"
            });

            let decimalsOfLendingToken = decimalsOfLendingTokenRes['output'];

            console.log('decimalsOfLendingToken', decimalsOfLendingToken);

            // From the lending token, get balance held by our contract. 
            let balanceOfLendingTokenRes = await sdk.api.abi.call({
                target: underlyingTokenAddy,
                chain: chainSpecific.chain,
                params: [lendingTokenPoolAddy],
                abi: "erc20:balanceOf"
            });

            let balanceOfLendingToken = balanceOfLendingTokenRes['output'] / 10 ** decimalsOfLendingToken;

            console.log('balanceOfLendingToken', balanceOfLendingToken);

            // // Calc the USD-equivalent.
            let priceUSDRes = await getPrices(chainSpecific.chain, [underlyingTokenAddy]); 
            let priceUSD = priceUSDRes[underlyingTokenAddy];

            console.log('priceUSD', priceUSD);
    
            let tvlUSD = balanceOfLendingToken * priceUSD;
            console.log('tvlUSD', tvlUSD);

            lendingTokens.push({
                pool: lendingTokenPoolAddy,
                chain: chainSpecific.chain,
                project: 'fringe',
                symbol: underlyingTokenSymbol,
                tvlUsd: Number(tvlUSD),
                apyBase: Number(lenderAPY),
                underlyingTokens: [underlyingTokenAddy],
                poolMeta: "V1 markets"
            });
        };
    };

    console.log('in fn... lendingTokens', lendingTokens);
    return lendingTokens;
};

module.exports = {
  timetravel: false,
  apy: allLendingTokens(),
  url: 'https://app.fringe.fi/lend'
};

// console.log (allLendingTokens);

// let xxx = allLendingTokens();
// console.log ('lending tokens', xxx);

