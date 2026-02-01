const sdk = require('@defillama/sdk');
const axios = require('axios');

const WRAPPED_ORIGIN_SONIC = '0x9F0dF7799f6FDAd409300080cfF680f5A23df4b1';
const ORIGIN_SONIC = '0xb1e25689d55734fd3fffc939c4c3eb52dff8a794';
const SONIC = '0x0000000000000000000000000000000000000000';
const project = 'origin-sonic';
const symbol = 'OS';
const exchangeRateAbi = 'function convertToAssets(uint256 shares) view returns (uint256 assets)';

const apy = async () => {
    const tvl = (await sdk.api.erc20.totalSupply({ target: ORIGIN_SONIC, chain: 'sonic' })).output / 1e18;

    const priceKey = `sonic:${SONIC}`;
    const sonicPrice = (
        await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
    ).data.coins[priceKey]?.price;

    const timestampNow = Math.floor(Date.now() / 1000);
    const timestampYesterday = timestampNow - 86400;

    const blockNow = (
        await axios.get(`https://coins.llama.fi/block/sonic/${timestampNow}`)
    ).data.height;

    const blockYesterday = (
        await axios.get(
            `https://coins.llama.fi/block/sonic/${timestampYesterday}`
        )
    ).data.height;

    const exchangeRateYesterday = await sdk.api.abi.call({
        target: WRAPPED_ORIGIN_SONIC,
        chain: 'sonic',
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
        block: blockYesterday,
    });

    const exchangeRateToday = await sdk.api.abi.call({
        target: WRAPPED_ORIGIN_SONIC,
        chain: 'sonic',
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
        block: blockNow,
    });

    const apr =
        ((exchangeRateToday.output - exchangeRateYesterday.output) /
            exchangeRateYesterday.output) * 365 * 100;

    return [
        {
            pool: `${ORIGIN_SONIC}`,
            chain: 'sonic',
            project,
            symbol,
            underlyingTokens: [SONIC],
            apyBase: apr,
            tvlUsd: (tvl * sonicPrice),
        },
    ];
};

module.exports = { apy, url: 'https://www.originprotocol.com/os' };
