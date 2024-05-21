const utils = require('../utils');
const axios = require('axios');
const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://api.avax.network/ext/bc/C/rpc');
const GGAVAX_CONTRACT = '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3';

const totalAssetsAbi = [{
    "inputs": [],
    "name": "totalAssets",
    "outputs": [{
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
    }],
    "stateMutability": "view",
    "type": "function"
}];

async function fetchTotalAssets() {
    try {
        const contract = new ethers.Contract(GGAVAX_CONTRACT, totalAssetsAbi, provider);
        const totalAssets = await contract.totalAssets();
        return ethers.formatUnits(totalAssets, 18);
        
    } catch (error) {
        console.error('Error in fetching total assets:', error);
    }
}



const avaxPrice = async () => {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd');
        return response.data['avalanche-2'].usd;
         
    } catch (error) {
        console.error('Error fetching price data', error);
        return null;
    }
};




const fetchData = async () => {
    const apiUrl = 'https://api.gogopool.com/metrics';
    const avaxUSD = await avaxPrice();
    const avaxLstSide = await fetchTotalAssets();
    
    const data = await utils.getData(apiUrl);


    const tvlUsd = parseFloat(avaxLstSide) * avaxUSD;

    
    return {
        apyBase: Number(data.ggavax_apy),
        tvlUsd: tvlUsd
    };
};

const topLvl = async () => {
    const { apyBase, tvlUsd } = await fetchData();
    return {
        pool: 'ggAVAX',
        chain: 'Avalanche',
        project: 'gogopool',
        symbol: 'GGP',
        tvlUsd: tvlUsd,
        apyBase: apyBase,
        apyReward: 0,
        rewardTokens: [],
        underlyingTokens: ['wavax']
    };
};

const main = async () => {
    return [await topLvl()];
};

main().then(data => {
    console.log("Data:", JSON.stringify(data, null, 2));  // Pretty print the data
}).catch(error => {
    console.error("Error occurred:", error);
});


module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://www.gogopool.com',
};