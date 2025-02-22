const utils = require('../utils');

async function fetchPrice() {
    try {
        const response = await fetch('https://min-api.cryptocompare.com/data/generateAvg?fsym=ICP&tsym=USD&e=coinbase');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        return data.RAW.PRICE;
    } catch (error) {
        throw new Error('There was a problem with the fetch operation:');
    }
}

function parsePrometheusMetrics(data) {
    const lines = data.split('\n');
    let metrics = new Map();
    for (const line of lines) {
        if (line.startsWith('#')) {
            continue;
        } else {
            const [name, value, timestamp] = line.split(' ');
            metrics.set(name, value);
        }
    }
    return metrics;
}

async function fetchAndParseMetrics(url) {
    try {
        const response = await fetch(url, {
            method: 'GET',
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const rawData = await response.text();
        return parsePrometheusMetrics(rawData);
    } catch (error) {
        console.error('Error fetching metrics:', error);
        throw error;
    }
}

async function fetchData() {
    const URL = "https://tsbvt-pyaaa-aaaar-qafva-cai.raw.icp0.io/metrics";
    const res = await fetchAndParseMetrics(URL);
    const icp_price = await fetchPrice();
    const E8S = 100000000;

    const tvl = (((Number(res.get("neuron_6m_tracked_stake")) + Number(res.get("neuron_8y_stake"))) / E8S) * icp_price) || 0;

    const apy = Number(res.get("apy")) * 100 || 0;

    return [{
        pool: `waterneuron-icp`,
        chain: utils.formatChain('icp'),
        project: 'waterneuron',
        symbol: 'nICP',
        tvlUsd: tvl,
        apyBase: apy,
        underlyingTokens: ['nICP'],
    }];
}

module.exports = {
    timetravel: false,
    apy: fetchData,
    url: 'https://waterneuron.fi',
};
