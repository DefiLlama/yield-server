import * as utils from '../utils';

declare const require: any;
const axios = require('axios');

const ORCA_API_BASE_URL = 'https://api.orca.so/v2/solana/pools';

interface PublicWhirlpoolStatsWindow {
    fees?: string | null;
    rewards?: string | null;
    volume?: string | null;
}

interface PublicWhirlpoolStats {
    '24h'?: PublicWhirlpoolStatsWindow;
    '7d'?: PublicWhirlpoolStatsWindow;
    [period: string]: PublicWhirlpoolStatsWindow | undefined;
}

interface PublicToken {
    address: string;
    symbol?: string | null;
}

interface WhirlpoolReward {
    mint: string;
    active: boolean;
    emissionsPerSecond: string; // BigDecimal serialized as decimal string
}

interface PublicWhirlpool {
    address: string;
    tvlUsdc: string | number | null;
    stats?: PublicWhirlpoolStats;
    tokenA: PublicToken;
    tokenB: PublicToken;
    rewards?: WhirlpoolReward[];
}

interface CursorMeta {
    previous?: string | null;
    next?: string | null;
}

interface OrcaPoolsResponse {
    data: PublicWhirlpool[];
    meta?: {
        cursor?: CursorMeta | null;
    } | null;
}

const toNumber = (value: string | number | null | undefined): number =>
    value == null ? NaN : Number(value);

const ratioOrNaN = (num: number, denom: number): number =>
    Number.isFinite(num) && Number.isFinite(denom) && denom > 0 ? num / denom : NaN;

async function fetchAllPools(): Promise<PublicWhirlpool[]> {
    const pools: PublicWhirlpool[] = [];
    let next: string | undefined;

    for (; ;) {
        const params = next
            ? { next }
            : {
                sortBy: 'tvl',
                sortDirection: 'desc',
                minTvl: 10000,
                size: 1000,
                stats: '24h,7d',
            };

        const response = await axios.get(ORCA_API_BASE_URL, { params });
        const { data, meta } = (response.data || {}) as OrcaPoolsResponse;

        if (!Array.isArray(data) || data.length === 0) break;

        pools.push(...data);

        const cursor = meta?.cursor?.next ?? null;
        if (!cursor) break;
        next = cursor;
    }

    return pools;
}

const getApy = async () => {
    const pools = await fetchAllPools();

    const mapped = pools.map((p) => {
        const tvlUsd = toNumber(p.tvlUsdc);

        const stats = p.stats;
        const stats24h = stats?.['24h'];
        const stats7d = stats?.['7d'];

        const fees24h = toNumber(stats24h?.fees);
        const rewards24h = toNumber(stats24h?.rewards);
        const fees7d = toNumber(stats7d?.fees);

        const volumeUsd1d = toNumber(stats24h?.volume);
        const volumeUsd7d = toNumber(stats7d?.volume);

        // Only compute APY when both numerator and denominator are finite and denom > 0.
        // Otherwise APY becomes NaN and the pool will be filtered out by keepFinite.
        const apyBase = ratioOrNaN(fees24h, tvlUsd) * 365 * 100;
        const apyReward = ratioOrNaN(rewards24h, tvlUsd) * 365 * 100;
        const apyBase7d = ratioOrNaN(fees7d, tvlUsd) * (365 / 7) * 100;

        const rewardTokens =
            p.rewards
                ?.filter((r) => {
                    if (!r || !r.active || !r.mint) return false;
                    const emissions = toNumber(r.emissionsPerSecond);
                    return Number.isFinite(emissions) && emissions > 0;
                })
                .map((r) => r.mint) ?? [];

        const symbolA = p.tokenA.symbol ?? '';
        const symbolB = p.tokenB.symbol ?? '';

        return {
            pool: p.address,
            chain: 'Solana',
            project: 'orca-dex',
            symbol: utils.formatSymbol(`${symbolA}-${symbolB}`),
            underlyingTokens: [p.tokenA.address, p.tokenB.address],
            rewardTokens,
            tvlUsd,
            apyBase,
            apyReward,
            apyBase7d,
            volumeUsd1d,
            volumeUsd7d,
            url: `https://www.orca.so/pools/${p.address}`,
        };
    });

    return mapped.filter((p) => utils.keepFinite(p));
};

export const apy = getApy;
