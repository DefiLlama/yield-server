const sdk = require('@defillama/sdk');
const axios = require('axios');

const teth = '0xd11c452fc99cf405034ee446803b6f6c1f6d5ed8';
const wsteth = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0';
const project = 'treehouse-protocol';
const symbol = 'teth';

const apy = async () => {

    const priceKey = `ethereum:${wsteth}`;
    const wstEthPrice = (
        await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
    ).data.coins[priceKey]?.price;

    const timestampNow = Math.floor(Date.now() / 1000);
    const timestampYesterday = timestampNow - 86400;

    const blockNow = (
        await axios.get(`https://coins.llama.fi/block/ethereum/${timestampNow}`)
    ).data.height;
    const blockYesterday = (
        await axios.get(
            `https://coins.llama.fi/block/ethereum/${timestampYesterday}`
        )
    ).data.height;

    const exchangeRateAbi = {
        inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
        name: 'convertToAssets',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    };
    const exchangeRateYesterday = await sdk.api.abi.call({
        target: teth,
        chain: 'ethereum',
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
        block: blockYesterday,
    });

    const exchangeRateToday = await sdk.api.abi.call({
        target: teth,
        chain: 'ethereum',
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
        block: blockNow,
    });
    const totalPooledBWsteth = await sdk.api.abi.call({
        target: teth,
        chain: 'ethereum',
        abi: 'uint256:totalAssets',
    });

    const apr =
        ((exchangeRateToday.output / 1e18 - exchangeRateYesterday.output / 1e18) /
            (exchangeRateYesterday.output / 1e18)) * 365 * 100;

    return [
        {
            pool: `${teth}`,
            chain: 'ethereum',
            project,
            symbol,
            underlyingTokens: [wsteth],
            apyBase: apr,
            tvlUsd: totalPooledBWsteth.output / 1e18 * wstEthPrice,
        },
    ];
};

module.exports = { apy, url: 'https://www.treehouse.finance/' };
