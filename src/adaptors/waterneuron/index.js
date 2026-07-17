const utils = require('../utils');

const E8S = 100000000;
const ICP_PRICE_KEY = 'coingecko:internet-computer';
const SIX_MONTH_NEURON_APY = 0.0251;
const EIGHT_YEAR_NEURON_APY = 0.0794;
const DEFAULT_DAO_SHARE = 0.1;

async function fetchPrice() {
    const { pricesByAddress } = await utils.getPrices([ICP_PRICE_KEY]);
    const price = pricesByAddress['internet-computer'];

    if (!Number.isFinite(price) || price <= 0) {
        throw new Error('Unable to fetch ICP price');
    }

    return price;
}

function parsePrometheusMetrics(data) {
    const lines = data.split('\n');
    let metrics = new Map();
    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const [name, value] = trimmed.split(/\s+/);
        if (name && value !== undefined) {
            metrics.set(name, value);
        }
    }
    return metrics;
}

function getNumberMetric(metrics, name) {
    const value = Number(metrics.get(name));
    if (!Number.isFinite(value)) {
        throw new Error(`Missing WaterNeuron metric: ${name}`);
    }
    return value;
}

function getHolderApy(metrics) {
    const sixMonthStake =
        getNumberMetric(metrics, 'neuron_6m_tracked_stake') / E8S;
    const eightYearStake = getNumberMetric(metrics, 'neuron_8y_stake') / E8S;

    if (sixMonthStake <= 0) {
        return 0;
    }

    const daoShareMetric = Number(metrics.get('dao_share_8y'));
    const daoShare = Number.isFinite(daoShareMetric)
        ? daoShareMetric / 100
        : DEFAULT_DAO_SHARE;
    const grossRewards =
        SIX_MONTH_NEURON_APY * sixMonthStake +
        EIGHT_YEAR_NEURON_APY * eightYearStake;

    return ((1 - daoShare) * grossRewards * 100) / sixMonthStake;
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

    const tvl =
        (((getNumberMetric(res, "neuron_6m_tracked_stake") +
            getNumberMetric(res, "neuron_8y_stake")) /
            E8S) *
            icp_price) ||
        0;
    const apy = getHolderApy(res);

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
  protocolId: '4921',
    timetravel: false,
    apy: fetchData,
    url: 'https://waterneuron.fi',
};
