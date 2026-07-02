const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiData } = require('../utils');

const WRAPPED_ORIGIN_SONIC = '0x9F0dF7799f6FDAd409300080cfF680f5A23df4b1';
const ORIGIN_SONIC = '0xb1e25689d55734fd3fffc939c4c3eb52dff8a794';
const SONIC = '0x0000000000000000000000000000000000000000';
const project = 'origin-sonic';
const symbol = 'OS';
const exchangeRateAbi = 'function convertToAssets(uint256 shares) view returns (uint256 assets)';

const apy = async () => {
    const tvl = (await sdk.api.erc20.totalSupply({ target: ORIGIN_SONIC, chain: 'sonic' })).output / 1e18;

    const priceKey = `sonic:${SONIC}`;
    const sonicPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

    const timestampNow = Math.floor(Date.now() / 1000);
    const timestampYesterday = timestampNow - 86400;

    const blockNow = (await getPriceApiData(`/block/sonic/${timestampNow}`)).height;

    const blockYesterday = (await getPriceApiData(`/block/sonic/${timestampYesterday}`)).height;

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
            ...(Number(exchangeRateToday.output) / 1e18 > 0 && { pricePerShare: Number(exchangeRateToday.output) / 1e18 }),
            tvlUsd: (tvl * sonicPrice),
        },
    ];
};

module.exports = { protocolId: '5688', apy, url: 'https://www.originprotocol.com/os' };
