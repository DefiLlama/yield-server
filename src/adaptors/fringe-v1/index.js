const sdk = require('@defillama/sdk');
const axios = require('axios');

const abiProtocol = require('./abis/protocolContractABI.json')
const abiLendingPools = require('./abis/lendingPoolsABI.json');

// Fringe's primary contract addy for each chain. 
// The primary contract tells us the list of lending pool contracts.
const primaryContractAddys = [
    {
        "chain":"ethereum",
        "chainSpecificProtocolContractAddy": "0x46558DA82Be1ae1955DE6d6146F8D2c1FE2f9C5E",
        "blocksPerDay": 7200
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
      
        return pricesObj;
    
    } catch (error) {
        console.log(error)
    }
};

const getLenderAPY = async (chain, lendingTokenPoolAddy, blocksPerDay) => {
    // Calc lender APY for this lending token.
    // Lender APY for lending = (((supplyRatePerBlock / 1e18) * BLOCK_PER_DAY + 1)^DAY_PER_YEAR - 1) * 100
    
    let supplyRatePerBlockRes = await sdk.api.abi.call({
        target: lendingTokenPoolAddy,
        chain: chain,
        abi: abiLendingPools.find((e) => e.name === 'supplyRatePerBlock')
    });

    let supplyRatePerBlock = supplyRatePerBlockRes['output'];

    return (((supplyRatePerBlock / 1e18) * blocksPerDay + 1) ** 365 - 1) * 100;
};

const getBorrowAPY = async (chain, lendingTokenPoolAddy, blocksPerDay) => {
    // Calc borrow APY for this lending token.
    // Borrow APY for lending = (((borrowRatePerBlock / 1e18) * BLOCK_PER_DAY + 1)^DAY_PER_YEAR - 1) * 100
    
    
    let borrowRatePerBlockRes = await sdk.api.abi.call({
        target: lendingTokenPoolAddy,
        chain: chain,
        abi: abiLendingPools.find((e) => e.name === 'borrowRatePerBlock')
    });

    let borrowRatePerBlock = borrowRatePerBlockRes['output'];

    return (((borrowRatePerBlock / 1e18) * blocksPerDay + 1) ** 365 - 1) * 100;
};

// Notes: lending tokens = our interest-bearing fTokens.

// Get the list of lending tokens listed by Fringe, chain by chain.
const allLendingTokens = async () => {
    
    let lendingTokens = [];

    for (let i = 0; i < primaryContractAddys.length; i++) {
        
        const chainSpecific = primaryContractAddys[i];
        
        // Get count of lending tokens for this chain.
        let lendingTokensCountRes = await sdk.api.abi.call({
            target: chainSpecific.chainSpecificProtocolContractAddy,
            chain: chainSpecific.chain,
            abi: abiProtocol.find((e) => e.name === 'lendingTokensLength')
        });
        let lendingTokensCount = lendingTokensCountRes['output'];

        // Add lending tokens for this chain to our full list. 
        for (let i = 0; i < lendingTokensCount; i++) {
            
            // e.g. USDC addy
            let underlyingTokenAddyRes = await sdk.api.abi.call({
                target: chainSpecific.chainSpecificProtocolContractAddy,
                chain: chainSpecific.chain,
                params: [i],
                abi: abiProtocol.find((e) => e.name === 'lendingTokens')
            });

            let underlyingTokenAddy = underlyingTokenAddyRes['output'].toLowerCase();

            // fToken addy. e.g. fUSDC addy 
            let lendingTokenPoolAddyRes = await sdk.api.abi.call({
                target: chainSpecific.chainSpecificProtocolContractAddy,
                chain: chainSpecific.chain,
                params: [underlyingTokenAddy],
                abi: abiProtocol.find((e) => e.name === 'lendingTokenInfo')
            });

            let lendingTokenPoolAddy = lendingTokenPoolAddyRes['output']['bLendingToken'].toLowerCase();

            // e.g. USDC
            let underlyingTokenSymbolRes = await sdk.api.abi.call({
                target: underlyingTokenAddy,
                chain: chainSpecific.chain,
                params: [],
                abi: "erc20:symbol"
            });

            let underlyingTokenSymbol = underlyingTokenSymbolRes['output'];

            // Get lend APY and borrow APY for this lending token.
            let lenderAPY = await getLenderAPY(chainSpecific.chain, lendingTokenPoolAddy, chainSpecific.blocksPerDay);
            let borrowAPY = await getBorrowAPY(chainSpecific.chain, lendingTokenPoolAddy, chainSpecific.blocksPerDay);

            //////////// Calc TVL in USD for the lending token.
            // From the lending token, get decimals. 
            let decimalsOfLendingTokenRes = await sdk.api.abi.call({
                target: underlyingTokenAddy,
                chain: chainSpecific.chain,
                params: [],
                abi: "erc20:decimals"
            });

            let decimalsOfLendingToken = decimalsOfLendingTokenRes['output'];
            
            // From the lending token, get balance owned by our contract. 
            let balanceOfLendingTokenRes = await sdk.api.abi.call({
                target: underlyingTokenAddy,
                chain: chainSpecific.chain,
                params: [lendingTokenPoolAddy],
                abi: "erc20:balanceOf"
            });

            let balanceOfLendingToken = balanceOfLendingTokenRes['output'] / 10 ** decimalsOfLendingToken;

            // Get conversion factor to USD.
            let priceUSDRes = await getPrices(chainSpecific.chain, [underlyingTokenAddy]); 
            let priceUSD = priceUSDRes[underlyingTokenAddy];
            
            // Calc the USD-equivalent.   
            let balanceOwnedUSD = balanceOfLendingToken * priceUSD;

            // Get total borrow of this lending token
            let totalBorrowRes = await sdk.api.abi.call({
                target: lendingTokenPoolAddy,
                chain: chainSpecific.chain,
                abi: abiLendingPools.find((e) => e.name === 'totalBorrows')
            });
        
            let totalBorrow = totalBorrowRes['output'] / 10 ** decimalsOfLendingToken;
            
            // Calc the USD-equivalent.
            let totalBorrowUSD = totalBorrow * priceUSD;
    
            let totalSupplyUSD = balanceOwnedUSD + totalBorrowUSD; 

            // Push it good.
            lendingTokens.push({
                pool: lendingTokenPoolAddy,
                chain: chainSpecific.chain,
                project: 'fringe-v1',
                symbol: underlyingTokenSymbol,
                tvlUsd: Number(balanceOwnedUSD),
                apyBase: Number(lenderAPY),
                apyBaseBorrow: Number(borrowAPY),
                totalSupplyUsd: Number(totalSupplyUSD),
                underlyingTokens: [underlyingTokenAddy],
                poolMeta: "V1 markets",
                totalBorrowUsd: Number(totalBorrowUSD)
            });
        }
    }

    // console.log('allLendingTokens\n', lendingTokens);  // works all ok.
    return lendingTokens;

};

module.exports = {
  timetravel: false,
  apy: allLendingTokens,
  url: 'https://app.fringe.fi/lend'
};


