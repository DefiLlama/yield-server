const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getTotalSupply } = require('../utils');

const USCC = {
    ethereum: '0x14d60e7fdc0d71d8611742720e4c50e7a974020c',
    plume_mainnet: '0x4c21b7577c8fe8b0b0669165ee7c8f67fa1454cf',
    solana: 'BTRR3sj1Bn2ZjuemgbeQ6SCtf84iXS81CS7UDTSxUCaK',
};
const USCC_ORACLE = '0xAfFd8F5578E8590665de561bdE9E7BAdb99300d9';
const project = 'superstate-uscc';
const symbol = 'USCC';

const apy = async () => {
    let tvlEth =
        (await sdk.api.erc20.totalSupply({ target: USCC['ethereum'], chain: 'ethereum' }));
    let tvlPlume =
        (await sdk.api.erc20.totalSupply({ target: USCC['plume_mainnet'], chain: 'plume_mainnet' }));
    const tvlSol = await getTotalSupply(USCC['solana']);
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
        target: USCC_ORACLE,
        chain: 'ethereum',
        abi: 'uint256:latestAnswer',
        block: block7daysAgo,
    });

    let exchangeRate30daysAgo = await sdk.api.abi.call({
        target: USCC_ORACLE,
        chain: 'ethereum',
        abi: 'uint256:latestAnswer',
        block: block30daysAgo,
    });

    let exchangeRateToday = await sdk.api.abi.call({
        target: USCC_ORACLE,
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
            pool: `${USCC['ethereum']}`,
            chain: 'ethereum',
            project,
            symbol,
            apyBase: apr30d,
            apyBase7d: apr7d,
            tvlUsd: tvlEth * exchangeRateToday,
            underlyingTokens: [USCC['ethereum']],
        },
        {
            pool: `${USCC['plume_mainnet']}`,
            chain: 'plume_mainnet',
            project,
            symbol,
            apyBase: apr30d,
            apyBase7d: apr7d,
            tvlUsd: tvlPlume * exchangeRateToday,
            underlyingTokens: [USCC['plume_mainnet']],
        },
        {
            pool: `${USCC['solana']}`,
            chain: 'solana',
            project,
            symbol,
            apyBase: apr30d,
            apyBase7d: apr7d,
            tvlUsd: tvlSol * exchangeRateToday,
            underlyingTokens: [USCC['solana']],
        },
    ];
};

module.exports = { apy, url: 'https://superstate.com/uscc' };
