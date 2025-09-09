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
    const timestampYesterday = timestampNow - 86400;

    const blockNow = (
        await axios.get(`https://coins.llama.fi/block/ethereum/${timestampNow}`)
    ).data.height;

    const blockYesterday = (
        await axios.get(`https://coins.llama.fi/block/ethereum/${timestampYesterday}`)
    ).data.height;

    let exchangeRateYesterday = await sdk.api.abi.call({
        target: USCC_ORACLE,
        chain: 'ethereum',
        abi: 'uint256:latestAnswer',
        block: blockYesterday,
    });

    let exchangeRateToday = await sdk.api.abi.call({
        target: USCC_ORACLE,
        chain: 'ethereum',
        abi: 'uint256:latestAnswer',
        block: blockNow,
    });

    exchangeRateToday = exchangeRateToday.output / 1e6;
    exchangeRateYesterday = exchangeRateYesterday.output / 1e6;

    const apr = ((exchangeRateToday - exchangeRateYesterday) / exchangeRateYesterday) *
        365 * 100;

    return [
        {
            pool: `${USCC['ethereum']}`,
            chain: 'ethereum',
            project,
            symbol,
            apyBase: apr,
            tvlUsd: tvlEth * exchangeRateToday,
        },
        {
            pool: `${USCC['plume_mainnet']}`,
            chain: 'plume_mainnet',
            project,
            symbol,
            apyBase: apr,
            tvlUsd: tvlPlume * exchangeRateToday,
        },
        {
            pool: `${USCC['solana']}`,
            chain: 'solana',
            project,
            symbol,
            apyBase: apr,
            tvlUsd: tvlSol * exchangeRateToday,
        },
    ];
};

module.exports = { apy, url: 'https://superstate.com/uscc' };
