const Web3 = require('web3');
const axios = require('axios');

const abiProtocol = require('./abis/protocolContractABI.json')
const abiLendingPools = require('./abis/lendingPoolsABI.json');

const rpcUrls = {
    arbitrum: "https://arb1.arbitrum.io/rpc",
    optimism: "https://mainnet.optimism.io",
    polygon:  "https://rpc-mainnet.maticvigil.com",
    ethereum: "https://rpc.payload.de",
    // ethereum: "https://rpc.builder0x69.io",
    // ethereum: "https://endpoints.omniatech.io/v1/eth/mainnet/public",
    // ethereum: "https://eth.llamarpc.com",    
    era:      "https://mainnet.era.zksync.io"
};

// Fringe's primary contract addy for each chain. 
// The primary contract tells us the list of lending pool contracts.
const primaryContractAddys = [
    {
        "chain":"optimism",
        "chainSpecificProtocolContractAddy": "0x088F23ac0c07A3Ce008FB88c4bacFF06FECC6158",
        "blocksPerDay": 43200
    },
    {
        "chain":"arbitrum",
        "chainSpecificProtocolContractAddy": "0x5855F919E89c5cb5e0052Cb09addEFF62EB9339A",
        "blocksPerDay": 336000
    },
    {
        "chain":"polygon",
        "chainSpecificProtocolContractAddy": "0x286475366f736fcEeB0480d7233ef169AE614Fe4",
        "blocksPerDay": 39950
    },
    {
        "chain":"ethereum",
        "chainSpecificProtocolContractAddy": "0x70467416507B75543C18093096BA4612a9261DB8",
        "blocksPerDay": 7200
    },
    {
        "chain":"era",
        "chainSpecificProtocolContractAddy": "0x8f1d37769a56340542Fb399Cb1cA49d46Aa9fec8",
        "blocksPerDay": 84000
    }
];

const getWeb3 = (chain) => {
    return new Web3(rpcUrls[chain]);
};

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

const callContractMethod = async (web3, contractAddress, abi, method, params = []) => {
    const contract = new web3.eth.Contract(abi, contractAddress);
    return contract.methods[method](...params).call();
};

const getAPY = async (ratePerBlock, blocksPerDay) => {
    return (((ratePerBlock / 1e18) * blocksPerDay + 1) ** 365 - 1) * 100;
};

// Notes: lending tokens = our interest-bearing fTokens.

// Get the list of lending tokens listed by Fringe, chain by chain.
const allLendingTokens = async () => {
    let lendingTokens = [];

    for (const { chain, chainSpecificProtocolContractAddy, blocksPerDay } of primaryContractAddys) {
        const web3 = getWeb3(chain);

        const lendingTokensCount = await callContractMethod(web3, chainSpecificProtocolContractAddy, abiProtocol, 'lendingTokensLength');
        let underlyingTokenAddy = ""
        for (let i = 0; i < lendingTokensCount; i++) {
            const underlyingTokenAddy = (await callContractMethod(web3, chainSpecificProtocolContractAddy, abiProtocol, 'lendingTokens', [i])).toLowerCase();
            const lendingTokenPoolAddy = (await callContractMethod(web3, chainSpecificProtocolContractAddy, abiProtocol, 'lendingTokenInfo', [underlyingTokenAddy])).bLendingToken.toLowerCase();
            // Handle MKR symbol - it's a special case because the token has non-standard symbol content.
            if (underlyingTokenAddy.toLowerCase() === "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2") {
                underlyingTokenSymbol = "MKR";
            } else {
                underlyingTokenSymbol = await callContractMethod(web3, underlyingTokenAddy, [{"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"}], 'symbol');
            }
            const supplyRatePerBlock = await callContractMethod(web3, lendingTokenPoolAddy, abiLendingPools, 'supplyRatePerBlock');
            const borrowRatePerBlock = await callContractMethod(web3, lendingTokenPoolAddy, abiLendingPools, 'borrowRatePerBlock');

            const lenderAPY = await getAPY(supplyRatePerBlock, blocksPerDay);
            const borrowAPY = await getAPY(borrowRatePerBlock, blocksPerDay);

            //////////// Calc TVL in USD for the lending token.

            // From the lending token, get decimals. 
            
            const decimalsOfLendingToken = await callContractMethod(web3, underlyingTokenAddy, [{"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"}], 'decimals');
            // From the lending token, get balance owned by our contract. 
            const balanceOfLendingToken = await callContractMethod(web3, underlyingTokenAddy, [{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}], 'balanceOf', [lendingTokenPoolAddy]);

            // Get conversion factor to USD.
            let priceUSDRes = await getPrices(chain, [underlyingTokenAddy]); 
            let priceUSD = priceUSDRes[underlyingTokenAddy];
            
            // Calc the USD-equivalent.   
            let balanceOwnedUSD = balanceOfLendingToken * priceUSD;
            
            // Get total borrow of this lending token
            const totalBorrow = await callContractMethod(web3, lendingTokenPoolAddy, abiLendingPools, 'totalBorrows');
            
            // Calc the USD-equivalent.
            let totalBorrowUSD = totalBorrow * priceUSD;
    
            let totalSupplyUSD = balanceOwnedUSD + totalBorrowUSD; 

            // Push it good.
            lendingTokens.push({
                pool: lendingTokenPoolAddy,
                chain: chain, 
                project: 'fringe',
                symbol: underlyingTokenSymbol,
                tvlUsd: Number(balanceOwnedUSD),
                apyBase: Number(lenderAPY),
                apyBaseBorrow: Number(borrowAPY),
                totalSupplyUsd: Number(totalSupplyUSD),
                underlyingTokens: [underlyingTokenAddy],
                poolMeta: "Fringe V2 markets",
                totalBorrowUsd: Number(totalBorrowUSD)
            });
        }
    }

    return lendingTokens;

};

module.exports = {
  timetravel: false,
  apy: allLendingTokens,
  url: 'https://app.fringe.fi/lend'
};



