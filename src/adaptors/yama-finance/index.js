const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abiLockup = require('./abiLockup');

const main = async () => {
    const latestBlock = await sdk.api.util.getLatestBlock('arbitrum');

    const INTERVALS_IN_YEAR = 365;
    const BLOCKS_IN_INTERVAL = Math.round((31_536_000 / INTERVALS_IN_YEAR) * 4);

    const oldBlockHeight = latestBlock.number - BLOCKS_IN_INTERVAL;

    const valueOld = (
        await sdk.api.abi.call({
            target: '0x3296EE4Fa62D0D78B1999617886E969a22653383',
            abi: abiLockup.find((m) => m.name === 'value'),
            chain: 'arbitrum',
            block: oldBlockHeight
        })
    ).output / (10 ** 18);

    const totalSupply = (
        await sdk.api.abi.call({
            target: '0x3296EE4Fa62D0D78B1999617886E969a22653383',
            abi: abiLockup.find((m) => m.name === 'totalSupply'),
            chain: 'arbitrum'
        })
    ).output / (10 ** 18);

    const value = (
        await sdk.api.abi.call({
            target: '0x3296EE4Fa62D0D78B1999617886E969a22653383',
            abi: abiLockup.find((m) => m.name === 'value'),
            chain: 'arbitrum'
        })
    ).output / (10 ** 18);

    const apy = (((value / valueOld) ** INTERVALS_IN_YEAR) - 1) * 100;

    return [{
        pool: '0x3296EE4Fa62D0D78B1999617886E969a22653383-arbitrum',
        chain: utils.formatChain('arbitrum'),
        project: 'yama-finance',
        symbol: utils.formatSymbol('USDT'),
        tvlUsd: totalSupply * value,
        apy: apy,
        underlyingTokens: ['0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'],
        poolMeta: 'USDT PSM LP'
    }]
};

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://yama.finance/app/lend',
}