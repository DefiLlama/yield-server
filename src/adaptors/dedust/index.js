const utils = require('../utils');

const MIN_TVL_USD = 10000;
const API_URL = 'https://mainnet.api.dedust.io/v4/api/get_pools';
const PAGE_SIZE = 100;

const formatAddress = (addr) => {
    if (addr == 'native') {
        return '0x0000000000000000000000000000000000000000';
    } else if (addr.startsWith('jetton:')) {
        return addr.slice(7);
    } else {
        return addr;
    }
}

const fetchPoolRows = async () => {
    const allRows = [];
    const assetsMetadata = {};
    let offset = 0;
    while (true) {
        const page = await utils.getData(API_URL, {
            limit: PAGE_SIZE,
            offset,
            sort_by: 'tvl',
            sort_direction: 'desc',
        });
        const rows = page.pool_rows || [];
        Object.assign(assetsMetadata, page.assets_metadata || {});
        allRows.push(...rows);
        const minRowTvl = rows.length
            ? Number(rows[rows.length - 1].tvl_usd)
            : 0;
        if (rows.length < PAGE_SIZE || minRowTvl < MIN_TVL_USD) break;
        offset += PAGE_SIZE;
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
            if (!p.dex || !p.dex.startsWith('dedust')) continue;
            const tvl = Number(p.tvl_usd);
            if (!(tvl >= MIN_TVL_USD)) continue;

            const leftAddr = p.assets[0];
            const rightAddr = p.assets[1];
            const left = assetInfo[leftAddr];
            const right = assetInfo[rightAddr];
            if (!left || !right) continue;

            let symbol;
            if (left.symbol == 'USDT') {
                symbol = `${right.symbol}-${left.symbol}`;
            } else if (right.symbol == 'USDT') {
                symbol = `${left.symbol}-${right.symbol}`;
            } else if (left.symbol == 'TON') {
                symbol = `${right.symbol}-${left.symbol}`;
            } else {
                symbol = `${left.symbol}-${right.symbol}`;
            }

            const aprFees = Number(p.apr_fees) || 0;
            const apyBase = (Math.pow(1 + aprFees / 100 / 365, 365) - 1) * 100;
            const apyReward = Number(p.apr_rewards) || 0;
            const rewardAssets = (p.reward_assets || []).map(formatAddress);

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
    timetravel: false,
    apy: getApy,
    url: 'https://dedust.io/',
};
