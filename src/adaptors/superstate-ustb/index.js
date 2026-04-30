const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { getTotalSupply } = utils;

const USTB = {
    ethereum: '0x43415eB6ff9DB7E26A15b704e7A3eDCe97d31C4e',
    plume_mainnet: '0xE4fA682f94610cCd170680cc3B045d77D9E528a8',
    solana: 'CCz3SGVziFeLYk2xfEstkiqJfYkjaSWb2GCABYsVcjo2',
};
const USTB_ORACLE = '0x289B5036cd942e619E1Ee48670F98d214E745AAC';
const project = 'superstate-ustb';
const symbol = 'USTB';

const apy = async () => {
    let tvlEth =
        (await sdk.api.erc20.totalSupply({ target: USTB['ethereum'], chain: 'ethereum' }));
    let tvlPlume =
        (await sdk.api.erc20.totalSupply({ target: USTB['plume_mainnet'], chain: 'plume_mainnet' }));
    const tvlSol = await getTotalSupply(USTB['solana']);
    tvlEth = tvlEth.output / 1e6;
    tvlPlume = tvlPlume.output / 1e6;

    const timestampNow = Math.floor(Date.now() / 1000);
    const timestamp7daysAgo = timestampNow - 86400 * 7;
    const timestamp30daysAgo = timestampNow - 86400 * 30;

    const blockNow = (
        await axios.get(`https://coins.llama.fi/block/ethereum/${timestampNow}`)
    ).data.height;

    const block7daysAgo = (
        await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7daysAgo}`)
    ).data.height;

    const block30daysAgo = (
        await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp30daysAgo}`)
    ).data.height;

    let exchangeRate7daysAgo = await sdk.api.abi.call({
        target: USTB_ORACLE,
        chain: 'ethereum',
        abi: 'uint256:latestAnswer',
        block: block7daysAgo,
    });

    let exchangeRate30daysAgo = await sdk.api.abi.call({
        target: USTB_ORACLE,
        chain: 'ethereum',
        abi: 'uint256:latestAnswer',
        block: block30daysAgo,
    });

    let exchangeRateToday = await sdk.api.abi.call({
        target: USTB_ORACLE,
        chain: 'ethereum',
        abi: 'uint256:latestAnswer',
        block: blockNow,
    });

    exchangeRateToday = exchangeRateToday.output / 1e6;
    exchangeRate7daysAgo = exchangeRate7daysAgo.output / 1e6;
    exchangeRate30daysAgo = exchangeRate30daysAgo.output / 1e6;

    const apr7d = ((exchangeRateToday - exchangeRate7daysAgo) / exchangeRate7daysAgo) *
        (365 / 7) * 100;
    const apr30d = ((exchangeRateToday - exchangeRate30daysAgo) / exchangeRate30daysAgo) *
        (365 / 30) * 100;

    return [
        {
            pool: `${USTB['ethereum']}`,
            chain: utils.formatChain('ethereum'),
            project,
            symbol,
            apyBase: apr30d,
            apyBase7d: apr7d,
            ...(exchangeRateToday > 0 && { pricePerShare: exchangeRateToday }),
            tvlUsd: tvlEth * exchangeRateToday,
            underlyingTokens: [USTB['ethereum']],
        },
        {
            pool: `${USTB['plume_mainnet']}`,
            chain: utils.formatChain('plume_mainnet'),
            project,
            symbol,
            apyBase: apr30d,
            apyBase7d: apr7d,
            ...(exchangeRateToday > 0 && { pricePerShare: exchangeRateToday }),
            tvlUsd: tvlPlume * exchangeRateToday,
            underlyingTokens: [USTB['plume_mainnet']],
        },
        {
            pool: `${USTB['solana']}`,
            chain: utils.formatChain('solana'),
            project,
            symbol,
            apyBase: apr30d,
            apyBase7d: apr7d,
            ...(exchangeRateToday > 0 && { pricePerShare: exchangeRateToday }),
            tvlUsd: tvlSol * exchangeRateToday,
            underlyingTokens: [USTB['solana']],
        },
    ];
};

module.exports = { apy, url: 'https://superstate.com/ustb' };
