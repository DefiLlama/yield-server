const axios = require('axios');
const {aprToApy} = require("../utils");
const sdk = require("@defillama/sdk");
const utils = require("../utils");

const project = 'unitas';
const symbol = 'sUSDu';
const STAKE_POOL = 'CFgrWjb9DYKVqf7QyQfmwjboDDkXpFHQ6292rnYxrjsa';
const DISTRIBUTE_ACCOUNT = "AmAcmYeJgxdHfoMSb3zwWFFPwWivADiyMozHwg5WyTtW"
const DISTRIBUTOR_DISCRIMINATOR = "FytrVezW"

const EVENTS = {
    RewardsReceived: 'event RewardsReceived(uint256 indexed amount, uint256 newVestingUSDuAmount)',
};

const config = {
    solana: {
        rpc_url: 'https://api.mainnet-beta.solana.com',
        susdu: '9iq5Q33RSiz1WcupHAQKbHBZkpn92UxBG2HfPWAZhMCa',
        usdu: '9ckR7pPPvyPadACDTzLwK2ZAEeUJ3qGSnzPs8bVaHrSy',
    },
    bsc: {
        rpc_url: 'https://bsc-dataseed.binance.org/',
        susdu: '0x385C279445581a186a4182a5503094eBb652EC71',
        usdu: '0xeA953eA6634d55dAC6697C436B1e81A679Db5882',
    }
};

async function getStakePoolSize() {
    const res = await axios.post(config.solana.rpc_url, {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountBalance",
        params: [
            STAKE_POOL,
        ]
    });

    const amount = res.data.result.value.amount;
    const decimal = res.data.result.value.decimals;

    return Number(amount) / Math.pow(10, decimal);
}

async function getSignatures() {
    const res = await axios.post(config.solana.rpc_url, {
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [
            DISTRIBUTE_ACCOUNT,
            {
                "limit": 20,
                "commitment": "finalized"
            }
        ]
    });
    return res.data.result
}

async function getTransaction(sig) {
    const res = await axios.post(config.solana.rpc_url, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
            sig,
            {
                encoding: 'jsonParsed',
                commitment: 'finalized'
            }
        ]
    });

    return res.data.result;
}

function createRateLimiter(interval) {
    let queue = Promise.resolve();

    return function (fn) {
        queue = queue.then(() => new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    const result = await fn();
                    resolve(result);
                } catch (e) {
                    resolve(null);
                }
            }, interval);
        }));
        return queue;
    };
}

function matchDis(data) {
    for (let i = 0; i < DISTRIBUTOR_DISCRIMINATOR.length; i++) {
        if (data[i] !== DISTRIBUTOR_DISCRIMINATOR[i]) return false;
    }
    return true
}

async function getRewardDistribution() {
    const rateLimit = createRateLimiter(5000);

    const signatures = await rateLimit(() => getSignatures())

    for (const sig of signatures) {
        const signature = sig.signature
        const tx = await rateLimit(() => getTransaction(signature));
        if (!tx) continue;

        const message = tx.transaction.message;
        const instructions = message.instructions;

        for (const inst of instructions) {
            if (matchDis(inst.data)) {
                const amount = tx.meta.innerInstructions[0].instructions[0].parsed.info.tokenAmount.amount
                const decimal = tx.meta.innerInstructions[0].instructions[0].parsed.info.tokenAmount.decimals
                return amount / Math.pow(10, decimal)
            }
        }
    }
}

async function apySol() {
    const tvlUsd = await getStakePoolSize()

    const reward = await getRewardDistribution()

    //rewards are now beeing streamed every 8hours, which we scale up to a year
    const aprBase = ((reward * 3 * 365) / tvlUsd) * 100;

    const apyBase = aprToApy(aprBase, 52);

    return [tvlUsd, apyBase]
}

async function getLogs() {
    const currentBlock = await sdk.api.util.getLatestBlock('bsc');

    const toBlock = currentBlock.number;

    //deployment block of susdu
    const fromBlock = 69059010

    const logs = [];
    for (let i = toBlock; i > fromBlock; i -= 10000) {
        const start = i - 10000;
        const lg = await sdk.getEventLogs({
            target: config.bsc.susdu,
            eventAbi: EVENTS.RewardsReceived,
            fromBlock: start,
            toBlock: i,
            chain: 'bsc',
        })
        logs.push(...lg)

        if (lg.length !== 0) {
            break;
        }
    }

    logs.sort((a, b) => b.blockNumber - a.blockNumber);

    return logs;
}

async function apyBsc() {
    const tvlUsd =
        (await sdk.api.erc20.totalSupply({target: config.bsc.usdu, chain: 'bsc'})).output /
        1e18;

    const logs = await getLogs()

    if (!logs.length) {
        throw new Error('No RewardsReceived events found on BSC');
    }

    const rewardsReceived = Number(logs[0].args.amount) / 1e18;

    const aprBase = ((rewardsReceived * 3 * 365) / tvlUsd) * 100;
    // weekly compoounding
    const apyBase = utils.aprToApy(aprBase, 52);

    return [tvlUsd, apyBase]
}

async function apy() {
    const [solRes, bscRes] = await Promise.allSettled([apySol(), apyBsc()]);

    return [
        solRes.status === 'fulfilled' && {
            pool: config.solana.susdu,
            chain: 'Solana',
            project,
            symbol,
            tvlUsd: solRes.value[0],
            apyBase: solRes.value[1],
            underlyingTokens: [config.solana.usdu],
        },
        bscRes.status === 'fulfilled' && {
            pool: config.bsc.susdu,
            chain: 'bsc',
            project,
            symbol,
            tvlUsd: bscRes.value[0],
            apyBase: bscRes.value[1],
            underlyingTokens: [config.bsc.usdu],
        }
    ].filter(Boolean);
}

module.exports = {
    apy,
    url: "https://unitas.so/",
};
