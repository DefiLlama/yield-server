const utils = require('../utils');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');


const APETH = '0xAaAaAAaBC6CBc3A1FD3a0fe0FDec43251C6562F5';
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'


const poolsFunction = async () => {
    const apy = await utils.getData('https://wallet.aquapatina.com/api/apy_current');

    tvl = await tvl();


    return [
        {
        pool: APETH,
        chain: utils.formatChain('ethereum'),
        project: 'aqua patina',
        symbol: utils.formatSymbol('APETH'),
        tvlUsd: tvl,
        apy: apy,
        },
    ];
};

async function tvl() {
    const supply = await sdk.api.abi.call({ 
        target: apETH, 
        abi: abi['totalSupply'],
        chain: 'ethereum'
    });
    const multiplier = await sdk.api.abi.call({ 
        target: apETH, 
        abi: abi['ethPerAPEth'],
        chain: 'ethereum'
    });

    let balance = supply * multiplier / 1e18;

    return {
        balance
    }
}

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://aquapatina.eth/',
  };