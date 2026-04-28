const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const project = 'treehouse-protocol';
const ONE = '1000000000000000000';

const convertToAssetsAbi = {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
};

const getJson = (url) => utils.withRetry(() => axios.get(url)).then((r) => r.data);

const getBlock = async (chain, ts) => {
    const d = await getJson(`https://coins.llama.fi/block/${chain}/${ts}`);
    if (typeof d?.height !== 'number') {
        throw new Error(
            `treehouse-protocol: invalid block response for ${chain} @ ${ts}: ${JSON.stringify(d)}`
        );
    }
    return d.height;
};

const getPrice = async (chain, token) => {
    const key = `${chain}:${token}`;
    const d = await getJson(`https://coins.llama.fi/prices/current/${key}`);
    const price = d?.coins?.[key]?.price;
    if (typeof price !== 'number') {
        throw new Error(`treehouse-protocol: missing price for ${chain}:${token}`);
    }
    return price;
};

const rateAt = (target, chain, block) =>
    sdk.api.abi.call({
        target,
        chain,
        abi: convertToAssetsAbi,
        params: [ONE],
        block,
    });

// utils.withRetry only retries 429/5xx; RPC errors don't carry an HTTP status.
const retryAny = async (fn, { retries = 2, delayMs = 500 } = {}) => {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === retries) throw e;
            await new Promise((r) => setTimeout(r, delayMs * 2 ** i));
        }
    }
};

const safe = async (fn, label) => {
    try {
        return await fn();
    } catch (err) {
        console.error(`treehouse-protocol: ${label} failed:`, err?.message || err);
        return null;
    }
};

// Underlying staking APR added on top of the vault's convertToAssets delta,
// since tETH/tAVAX are denominated in wstETH/sAVAX respectively.
const lidoApr = async () => {
    const [last, sma] = await Promise.all([
        getJson('https://eth-api.lido.fi/v1/protocol/steth/apr/last'),
        getJson('https://eth-api.lido.fi/v1/protocol/steth/apr/sma'),
    ]);
    return { apr1d: last.data.apr, apr7d: sma.data.smaApr };
};

const benqiApr = async () => {
    const data = await getJson('https://api.benqi.fi/liquidstaking/apr');
    const apr = Number(data.apr) * 100;
    return { apr1d: apr, apr7d: apr };
};

const POOLS = [
    {
        symbol: 'tETH',
        chain: 'ethereum',
        vault: '0xd11c452fc99cf405034ee446803b6f6c1f6d5ed8',
        underlying: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', // wstETH
        underlyingApr: lidoApr,
    },
    {
        symbol: 'tAVAX',
        chain: 'avax',
        vault: '0x14A84F1a61cCd7D1BE596A6cc11FE33A36Bc1646',
        underlying: '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE', // sAVAX
        underlyingApr: benqiApr,
    },
];

const getPool = async ({ symbol, chain, vault, underlying, underlyingApr }) => {
    const tsNow = Math.floor(Date.now() / 1000);

    const [price, blockNow, blockYesterday, extra] = await Promise.all([
        getPrice(chain, underlying),
        getBlock(chain, tsNow),
        getBlock(chain, tsNow - 86400),
        underlyingApr(),
    ]);

    const [rateNow, rateYesterday, totalAssets] = await Promise.all([
        retryAny(() => rateAt(vault, chain, blockNow)),
        retryAny(() => rateAt(vault, chain, blockYesterday)),
        retryAny(() =>
            sdk.api.abi.call({ target: vault, chain, abi: 'uint256:totalAssets' })
        ),
    ]);

    // 7d lookup (block + archive-state rate) regularly flakes across Llama RPC
    // providers (pruned state / CU limits); isolate so a failure nulls
    // apyBase7d instead of dropping the whole pool.
    const block7dAgo = await safe(
        () => getBlock(chain, tsNow - 86400 * 7),
        `${symbol} 7d block`
    );
    const rate7dAgo = block7dAgo
        ? await safe(
              () => retryAny(() => rateAt(vault, chain, block7dAgo)),
              `${symbol} 7d rate`
          )
        : null;

    const n = (x) => x.output / 1e18;
    const vaultApr1d =
        ((n(rateNow) - n(rateYesterday)) / n(rateYesterday)) * 365 * 100;
    const vaultApr7d = rate7dAgo
        ? ((n(rateNow) - n(rate7dAgo)) / n(rate7dAgo)) * (365 / 7) * 100
        : null;

    return {
        pool: vault,
        chain,
        project,
        symbol,
        underlyingTokens: [underlying],
        apyBase: vaultApr1d + extra.apr1d,
        apyBase7d: vaultApr7d !== null ? vaultApr7d + extra.apr7d : null,
        ...(n(rateNow) > 0 && { pricePerShare: n(rateNow) }),
        tvlUsd: n(totalAssets) * price,
    };
};

const apy = async () => {
    const results = await Promise.allSettled(POOLS.map(getPool));
    for (const r of results) {
        if (r.status === 'rejected') {
            console.error(
                'treehouse-protocol: pool fetch failed:',
                r.reason?.message || r.reason
            );
        }
    }
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    // If every pool failed, throw so the handler records status=error in
    // adapter_stats instead of silently recording status=success with 0 rows.
    if (fulfilled.length === 0) {
        const reasons = results
            .map((r) => r.reason?.message || String(r.reason))
            .join('; ');
        throw new Error(`treehouse-protocol: all pool fetches failed: ${reasons}`);
    }
    return fulfilled.map((r) => r.value);
};

module.exports = {
    timetravel: false,
    apy,
    url: 'https://www.treehouse.finance/',
};
