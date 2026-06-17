const utils = require('../utils');
const { Address } = require('@ton/core');

const MIN_TVL_USD = 10000;
const API_URL = 'https://mainnet.api.dedust.io/v4/api/get_pools';
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const NATIVE_TON = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

const formatAddress = (addr) => {
    if (addr === 'native') {
        return NATIVE_TON;
    }
    const raw = addr.startsWith('jetton:') ? addr.slice(7) : addr;
    try {
        return Address.parse(raw).toString();
    } catch {
        return raw;
    }
}

const fetchPoolRows = async () => {
    const allRows = [];
    const assetsMetadata = {};
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
        const res = await utils.getData(API_URL, {
            limit: PAGE_SIZE,
            offset,
            sort_by: 'tvl',
            sort_direction: 'desc',
        });
        const rows = res.pool_rows || [];
        Object.assign(assetsMetadata, res.assets_metadata || {});
        allRows.push(...rows);
        const minRowTvl = rows.length
            ? Number(rows[rows.length - 1].tvl_usd)
            : 0;
        if (rows.length < PAGE_SIZE || minRowTvl < MIN_TVL_USD) break;
        offset += PAGE_SIZE;
        if (page === MAX_PAGES - 1) {
            console.warn(`dedust: hit MAX_PAGES (${MAX_PAGES}); stopping pagination at offset ${offset}`);
        }
    }
    return { rows: allRows, assetsMetadata };
}

const getApy = async () => {
    const { rows, assetsMetadata } = await fetchPoolRows();

    const assetInfo = {};
    for (const [key, meta] of Object.entries(assetsMetadata)) {
        assetInfo[key] = {
            decimals: meta.decimals,
            price: Number(meta.usd_price || 0),
            symbol: meta.ticker || meta.name || key,
        };
    }

    const pools = [];
    for (const row of rows) {
        for (const p of row.pools || []) {
            if (typeof p.dex !== 'string' || !p.dex.startsWith('dedust')) continue;
            const tvl = Number(p.tvl_usd);
            if (!(tvl >= MIN_TVL_USD)) continue;

            if (!Array.isArray(p.assets) || p.assets.length < 2) continue;
            const leftAddr = p.assets[0];
            const rightAddr = p.assets[1];
            if (typeof leftAddr !== 'string' || typeof rightAddr !== 'string') continue;
            const left = assetInfo[leftAddr];
            const right = assetInfo[rightAddr];
            if (!left || !right) continue;

            const leftSym = left.symbol === 'TON' ? 'GRAM' : left.symbol;
            const rightSym = right.symbol === 'TON' ? 'GRAM' : right.symbol;
            let symbol;
            if (leftSym == 'USDT') {
                symbol = `${rightSym}-${leftSym}`;
            } else if (rightSym == 'USDT') {
                symbol = `${leftSym}-${rightSym}`;
            } else if (leftSym == 'GRAM') {
                symbol = `${rightSym}-${leftSym}`;
            } else {
                symbol = `${leftSym}-${rightSym}`;
            }

            const aprFees = Number(p.apr_fees) || 0;
            const apyBase = (Math.pow(1 + aprFees / 100 / 365, 365) - 1) * 100;
            const apyReward = Number(p.apr_rewards) || 0;
            const rewardAssets = Array.isArray(p.reward_assets)
                ? p.reward_assets.filter((a) => typeof a === 'string').map(formatAddress)
                : [];

            pools.push({
                pool: `${p.address}-ton`.toLowerCase(),
                chain: 'Ton',
                project: 'dedust',
                symbol,
                tvlUsd: tvl,
                apyBase,
                apyReward: apyReward || undefined,
                rewardTokens: rewardAssets.length ? rewardAssets : undefined,
                underlyingTokens: [formatAddress(leftAddr), formatAddress(rightAddr)],
                url: `https://dedust.io/pools/${p.address}`,
            });
        }
    }
    return pools;
};

module.exports = {
  protocolId: '2617',
    timetravel: false,
    apy: getApy,
    url: 'https://dedust.io/',
};
