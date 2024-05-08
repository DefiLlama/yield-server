const utils = require('../utils');
const axios = require('axios');
const { getPrices } = require('../utils');

const avaxPrice = async() => {
    try{
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd');
        return response.data['avalanche-2'];
    }catch(error){
        console.error('Error fetching price data', error);
        return null;
    }
}


const fetchData = async () => {
    const apiUrl = 'https://api.gogopool.com/metrics';
    const avaxUSD = await avaxPrice();

    const data = await utils.getData(apiUrl);


    if (!data.total_assets || !avaxUSD.usd) {
        console.error('Missing data for total_assets or AVAX USD price');
        return { apyBase: 0, tvlUsd: 0 };
    }

    const tvlUsd = data.total_assets * avaxUSD.usd;
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
        underlyingTokens: ['wavax'],
    };
}


const main = async() => {
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