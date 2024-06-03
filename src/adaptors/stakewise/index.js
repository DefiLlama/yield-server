const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const BigNumber = require('bignumber.js');
const axios = require('axios');
const utils = require("../utils");

const secondsInYear = 31536000
const secondsInWeek = 7 * 60 * 60 * 24
const maxPercent = 10000 // 100.00 %
const wad = 1e18

const osTokenAddress = '0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38';
const osTokenCtrlAddress = '0x2A261e60FB14586B474C208b1B7AC6D0f5000306';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const topic = '0x575b153fd68e97b63239f63ca929196a4e398b8157c14ddb6bfc54dad71071cb'
const chain = 'ethereum'
const osTokenCtrlInterface = new ethers.utils.Interface(['event AvgRewardPerSecondUpdated(uint256 avgRewardPerSecond)']);

const getApy = async () => {
    const currentBlock = (await sdk.api.util.getLatestBlock(chain));
    const toBlock = currentBlock.number
    const timestampWeekAgo = currentBlock.timestamp - secondsInWeek
    const [fromBlock] = await utils.getBlocksByTime([timestampWeekAgo], chain)

    const logs = (await sdk.api.util.getLogs({
        target: osTokenCtrlAddress,
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        topics: [topic],
        chain
    })).output

    // get last 14 events (1-week average)
    const lastWeekLogs = logs.slice(-14)
    const osEthRewardPerSecondSum = lastWeekLogs.map((log) => {
        const value = osTokenCtrlInterface.parseLog(log);
        return new BigNumber(value.args.avgRewardPerSecond._hex);
    }).reduce((a, b) => a.plus(b), new BigNumber('0'));

    // calculate APY
    const apyBN = osEthRewardPerSecondSum
        .times(new BigNumber(secondsInYear.toString()))
        .times(new BigNumber(maxPercent.toString()))
        .dividedBy(new BigNumber(lastWeekLogs.length.toString()))
        .dividedBy(new BigNumber(wad.toString()))
    const tvl = (await sdk.api.erc20.totalSupply({target: osTokenAddress})).output / 1e18;

    // fetch ETH price
    const priceKey = `${chain}:${weth}`;
    const ethPrice = (
        await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
    ).data.coins[priceKey]?.price;

    return [{
        pool: osTokenAddress,
        chain,
        project: 'stakewise',
        symbol: 'osETH',
        tvlUsd: (tvl) * ethPrice,
        apy: Number(apyBN) / 100,
        underlyingTokens: [weth],
    },];
};

module.exports = {
    timetravel: false, apy: getApy, url: 'https://app.stakewise.io/',
};
