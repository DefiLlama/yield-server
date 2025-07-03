const axios = require('axios');
const {aprToApy} = require("../utils");

const SOL_RPC = 'https://api.mainnet-beta.solana.com';
const STAKE_POOL = 'CFgrWjb9DYKVqf7QyQfmwjboDDkXpFHQ6292rnYxrjsa';
const SUSDU = '9iq5Q33RSiz1WcupHAQKbHBZkpn92UxBG2HfPWAZhMCa';
const DISTRIBUTE_ACCOUNT = "AmAcmYeJgxdHfoMSb3zwWFFPwWivADiyMozHwg5WyTtW"
const DISTRIBUTOR_DISCRIMINATOR = 'FytrVezWcPWVBkq6Bc5T9y';

async function getStakePoolSize() {
    const res = await axios.post(SOL_RPC, {
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
    const res = await axios.post(SOL_RPC, {
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [
            DISTRIBUTE_ACCOUNT,
            {
                "limit": 50,
                "commitment": "finalized"
            }
        ]
    });
    return res.data.result
}

async function getTransaction(sig) {
    const res = await axios.post(SOL_RPC, {
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

async function getRewardDistribution() {
    const signatures = await getSignatures()

    for (const sig of signatures) {
        const signature = sig.signature
        const tx = await getTransaction(signature)

        const message = tx.transaction.message;
        const instructions = message.instructions;

        for (const inst of instructions) {
            if (inst.data === DISTRIBUTOR_DISCRIMINATOR) {
                const amount = tx.meta.innerInstructions[0].instructions[0].parsed.info.tokenAmount.amount
                const decimal = tx.meta.innerInstructions[0].instructions[0].parsed.info.tokenAmount.decimals
                return amount / Math.pow(10, decimal)
            }
        }
    }
}

async function apy() {
    const tvlUsd = await getStakePoolSize()

    const reward = await getRewardDistribution()

    //rewards are now beeing streamed every 8hours, which we scale up to a year
    const aprBase = ((reward * 3 * 365) / tvlUsd) * 100;

    const apyBase = aprToApy(aprBase, 52);
    return [
        {
            pool: SUSDU,
            symbol: 'sUSDu',
            project: 'unitas',
            chain: 'Solana',
            tvlUsd,
            apyBase,
        },
    ];
}

module.exports = {
    apy,
    url: "https://app.unitas.so/dashboard/apy",
};
