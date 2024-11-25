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
            symbol: utils.formatSymbol('APETH'),
            tvlUsd: tvl,
            apy: apy.data.apy,
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

    const ethPrice = (
        await axios.get('https://coins.llama.fi/prices/current/coingecko:ethereum')
    ).data.coins['coingecko:ethereum'].price;

    let tvl = BigInt(supply.output) * BigInt(multiplier.output) / BigInt(1e18) / BigInt(1e18);

    return Number(tvl) * ethPrice;
}

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://aquapatina.eth/',
};