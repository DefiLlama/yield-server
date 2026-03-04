const sdk = require('@defillama/sdk');
const axios = require('axios');

const teth = '0xd11c452fc99cf405034ee446803b6f6c1f6d5ed8';
const wsteth = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0';
const tavax = '0x14A84F1a61cCd7D1BE596A6cc11FE33A36Bc1646';
const savax = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE';
const wavax = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';
const project = 'treehouse-protocol';

const exchangeRateAbi = {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
};

const getTethPool = async () => {
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

    return {
        pool: `${teth}`,
        chain: 'ethereum',
        project,
        symbol: 'tETH',
        underlyingTokens: [wsteth],
        apyBase: apr,
        apyBase7d: apr7d,
        tvlUsd: totalPooledBWsteth.output / 1e18 * wstEthPrice,
    };
};

const getTavaxPool = async () => {
    const priceKey = `avax:${savax}`;
    const savaxPrice = (
        await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
    ).data.coins[priceKey]?.price;

    const timestampNow = Math.floor(Date.now() / 1000);
    const timestampYesterday = timestampNow - 86400;
    const timestamp7dAgo = timestampNow - 86400 * 7;

    const [blockNow, blockYesterday, block7dAgo] = await Promise.all([
        axios.get(`https://coins.llama.fi/block/avax/${timestampNow}`),
        axios.get(`https://coins.llama.fi/block/avax/${timestampYesterday}`),
        axios.get(`https://coins.llama.fi/block/avax/${timestamp7dAgo}`),
    ]).then(responses => responses.map(r => r.data.height));

    const [exchangeRateYesterday, exchangeRateToday, exchangeRate7dAgo, totalAssets] = await Promise.all([
        sdk.api.abi.call({
            target: tavax,
            chain: 'avax',
            abi: exchangeRateAbi,
            params: ['1000000000000000000'],
            block: blockYesterday,
        }),
        sdk.api.abi.call({
            target: tavax,
            chain: 'avax',
            abi: exchangeRateAbi,
            params: ['1000000000000000000'],
            block: blockNow,
        }),
        sdk.api.abi.call({
            target: tavax,
            chain: 'avax',
            abi: exchangeRateAbi,
            params: ['1000000000000000000'],
            block: block7dAgo,
        }),
        sdk.api.abi.call({
            target: tavax,
            chain: 'avax',
            abi: 'uint256:totalAssets',
        }),
    ]);

    const tavaxApr =
        ((exchangeRateToday.output / 1e18 - exchangeRateYesterday.output / 1e18) /
            (exchangeRateYesterday.output / 1e18)) * 365 * 100;

    const tavaxApr7d =
        ((exchangeRateToday.output / 1e18 - exchangeRate7dAgo.output / 1e18) /
            (exchangeRate7dAgo.output / 1e18)) * (365 / 7) * 100;

    // tAVAX is denominated in sAVAX, so the total yield includes Benqi staking APR
    const benqiAprResponse = await axios.get('https://api.benqi.fi/liquidstaking/apr');
    const benqiApr = Number(benqiAprResponse.data.apr) * 100;

    const apr = tavaxApr + benqiApr;
    const apr7d = tavaxApr7d + benqiApr;

    return {
        pool: `${tavax}`,
        chain: 'avax',
        project,
        symbol: 'tAVAX',
        underlyingTokens: [savax],
        apyBase: apr,
        apyBase7d: apr7d,
        tvlUsd: totalAssets.output / 1e18 * savaxPrice,
    };
};

const apy = async () => {
    const [tethPool, tavaxPool] = await Promise.all([
        getTethPool(),
        getTavaxPool(),
    ]);

    return [tethPool, tavaxPool];
};

module.exports = { apy, url: 'https://www.treehouse.finance/' };
