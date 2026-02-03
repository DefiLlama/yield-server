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
    const timestamp7dAgo = timestampNow - 86400 * 7;

    const [blockNow, blockYesterday, block7dAgo] = await Promise.all([
        axios.get(`https://coins.llama.fi/block/ethereum/${timestampNow}`),
        axios.get(`https://coins.llama.fi/block/ethereum/${timestampYesterday}`),
        axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7dAgo}`),
    ]).then(responses => responses.map(r => r.data.height));

    const exchangeRateAbi = {
        inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
        name: 'convertToAssets',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    };
    const [exchangeRateYesterday, exchangeRateToday, exchangeRate7dAgo] = await Promise.all([
        sdk.api.abi.call({
            target: teth,
            chain: 'ethereum',
            abi: exchangeRateAbi,
            params: ['1000000000000000000'],
            block: blockYesterday,
        }),
        sdk.api.abi.call({
            target: teth,
            chain: 'ethereum',
            abi: exchangeRateAbi,
            params: ['1000000000000000000'],
            block: blockNow,
        }),
        sdk.api.abi.call({
            target: teth,
            chain: 'ethereum',
            abi: exchangeRateAbi,
            params: ['1000000000000000000'],
            block: block7dAgo,
        }),
    ]);
    const totalPooledBWsteth = await sdk.api.abi.call({
        target: teth,
        chain: 'ethereum',
        abi: 'uint256:totalAssets',
    });

    const tethApr =
        ((exchangeRateToday.output / 1e18 - exchangeRateYesterday.output / 1e18) /
            (exchangeRateYesterday.output / 1e18)) * 365 * 100;

    const tethApr7d =
        ((exchangeRateToday.output / 1e18 - exchangeRate7dAgo.output / 1e18) /
            (exchangeRate7dAgo.output / 1e18)) * (365 / 7) * 100;

    // tETH is denominated in wstETH, so the total yield includes wstETH staking APY
    const [lidoAprLast, lidoAprSma] = await Promise.all([
        axios.get('https://eth-api.lido.fi/v1/protocol/steth/apr/last'),
        axios.get('https://eth-api.lido.fi/v1/protocol/steth/apr/sma'),
    ]).then(responses => [
        responses[0].data.data.apr,
        responses[1].data.data.smaApr,
    ]);

    const apr = tethApr + lidoAprLast;
    const apr7d = tethApr7d + lidoAprSma;

    return [
        {
            pool: `${teth}`,
            chain: 'ethereum',
            project,
            symbol,
            underlyingTokens: [wsteth],
            apyBase: apr,
            apyBase7d: apr7d,
            tvlUsd: totalPooledBWsteth.output / 1e18 * wstEthPrice,
        },
    ];
};

module.exports = { apy, url: 'https://www.treehouse.finance/' };
