const utils = require('../utils');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');
const axios = require('axios');

const APETH = '0xAaAaAAaBC6CBc3A1FD3a0fe0FDec43251C6562F5';
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'


const getApy = async () => {
    const apy = await utils.getData('https://wallet.aquapatina.com/api/apy_current');

    tvl = await tvlUsd();

    return [
        {
            pool: APETH,
            chain: utils.formatChain('ethereum'),
            project: 'aqua-patina',
            symbol: 'APETH',
            tvlUsd: tvl,
            apy: apy.data.apy,
            underlyingTokens: [ETH],
        },
    ];
};

async function tvlUsd() {

    const supply = await sdk.api.abi.call({
        target: APETH,
        abi: abi['totalSupply'],
        chain: 'ethereum'
    });

    const multiplier = await sdk.api.abi.call({
        target: APETH,
        abi: abi['ethPerAPEth'],
        chain: 'ethereum'
    });

    const ethPrice = (await utils.getPriceApiData('/prices/current/coingecko:ethereum')).coins['coingecko:ethereum'].price;

    let tvl = BigInt(supply.output) * BigInt(multiplier.output) / BigInt(1e18) / BigInt(1e18);

    return Number(tvl) * ethPrice;
}

module.exports = {
  protocolId: '5267',
    timetravel: false,
    apy: getApy,
    url: 'https://aquapatina.eth/',
};