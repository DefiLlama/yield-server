const utils = require('../utils');

function getChianString(chainId) {
switch (chainId){
    case 1:
        return 'ethereum';
    case 137:
        return 'polygon';
    case 56:
        return 'bsc';
    case 42161:
        return 'arbitrum';
    case 43114:
        return 'avalanche';
    case 324:
        return 'zkSync Era';
    }
}

const main = async () => {
    let poolList = [];
    const data = await utils.getData("https://test.crowdswap.org/api/v1/opportunity/getOpportunities");

    for(const item of Object.entries(data)){
        if(Number(item[1].apy) > 0 && Number(item[1].tvl) > 10000 && item[1].opportunityType === 'crowd'){
        let pool = {
            pool: item[1].stakingLPContractAddress,
            chain: getChianString(item[1].chainId),
            project: 'crowdswap',
            symbol: item[1].asset,
            tvlUsd: Number(item[1].tvl),
            apy: Number(item[1].apy),
          };
        
        poolList.push(pool);
    }
    }

    return poolList;
  };

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://app.crowdswap.org/opportunity'
  };