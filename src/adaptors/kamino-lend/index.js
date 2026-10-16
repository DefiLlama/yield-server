const axios = require('axios');

const BASE_URL = 'https://api.kamino.finance';
const APP_URL = 'https://kamino.com';
const RESOURCES_URL = 'https://cdn.kamino.com/resources.json';
const CONFIG_OFFSET = 4856;
const LIQUIDITY_OFFSET = 128;

const get = (path) => axios.get(`${BASE_URL}${path}`).then((res) => res.data);

const readU64 = (buffer, offset) => buffer.readBigUInt64LE(offset);
const toUsd = (amount, decimals, price) =>
    (Number(amount) / 10 ** decimals) * price;

// Offsets come from Kamino's generated Reserve account layout.
const decodeReserveData = (data) => {
    const buffer = Buffer.from(data, 'base64');
    return {
        availableAmount: readU64(buffer, LIQUIDITY_OFFSET + 96),
        decimals: Number(readU64(buffer, LIQUIDITY_OFFSET + 144)),
        status: buffer.readUInt8(CONFIG_OFFSET),
        borrowLimit: readU64(buffer, CONFIG_OFFSET + 168),
        symbol: buffer
            .subarray(CONFIG_OFFSET + 176, CONFIG_OFFSET + 208)
            .toString()
            .replace(/\0+$/, ''),
        debtWithdrawalCap: {
            capacity: buffer.readBigInt64LE(CONFIG_OFFSET + 592),
            current: buffer.readBigInt64LE(CONFIG_OFFSET + 600),
            lastIntervalStartTimestamp: Number(readU64(buffer, CONFIG_OFFSET + 608)),
            interval: Number(readU64(buffer, CONFIG_OFFSET + 616)),
        },
        utilizationLimitBlockBorrowingAbovePct: buffer.readUInt8(
            CONFIG_OFFSET + 645
        ),
    };
};

const getDebtWithdrawalCap = (cap, decimals, price) => {
    if (cap.capacity <= 0n) return Infinity;

    const elapsed = Math.floor(Date.now() / 1000) - cap.lastIntervalStartTimestamp;
    const current = elapsed >= cap.interval ? 0n : cap.current;
    return toUsd(cap.capacity - current, decimals, price);
};

const getAvailableBorrowUsd = (reserve, reserveData) => {
    if (reserveData.borrowLimit === 0n) return 0;

    const totalSupply = Number(reserve.totalSupply);
    const totalBorrow = Number(reserve.totalBorrow);
    const totalSupplyUsd = Number(reserve.totalSupplyUsd);
    const totalBorrowUsd = Number(reserve.totalBorrowUsd);
    const price =
        totalSupply > 0
            ? totalSupplyUsd / totalSupply
            : totalBorrow > 0
            ? totalBorrowUsd / totalBorrow
            : 0;
    const availableLiquidityUsd = toUsd(
        reserveData.availableAmount,
        reserveData.decimals,
        price
    );
    const borrowCapUsd =
        toUsd(reserveData.borrowLimit, reserveData.decimals, price) -
        totalBorrowUsd;
    const debtWithdrawalCapUsd = getDebtWithdrawalCap(
        reserveData.debtWithdrawalCap,
        reserveData.decimals,
        price
    );
    const utilizationLimit =
        reserveData.utilizationLimitBlockBorrowingAbovePct / 100;
    const utilizationCapUsd =
        utilizationLimit > 0 && totalSupply > 0
            ? (utilizationLimit - totalBorrow / totalSupply) * totalSupplyUsd
            : Infinity;

    return Math.max(
        Math.min(
            availableLiquidityUsd,
            borrowCapUsd,
            debtWithdrawalCapUsd,
            utilizationCapUsd
        ),
        0
    );
};

const activeRewards = (rewards = []) => rewards.filter((r) => Number(r.apy) > 0);
const sumRewardApy = (rewards) =>
    rewards.length
        ? rewards.reduce((sum, r) => sum + Number(r.apy), 0) * 100
        : undefined;
const uniqueRewardTokens = (rewards) =>
    rewards.length ? [...new Set(rewards.map((r) => r.rewardToken))] : undefined;

const slugify = (name) =>
    name.toLowerCase().replace(/[^a-z0-9-\s]/g, '').replace(/ /g, '-');

const getVaultPools = async (symbolByMint, reserveStats) => {
    const [vaults, statsByVault, config] = await Promise.all([
        get('/kvaults/vaults'),
        get('/kvaults/vaults/batch/stats'),
        axios
            .get(RESOURCES_URL)
            .then((res) => res.data['mainnet-beta'] ?? {})
            .catch((err) => {
                console.error(`kamino-lend: vault display config failed: ${err.message}`);
                return {};
            }),
    ]);
    const { vaults: lendConfig = {}, privateCreditVaults: institutionalConfig = {} } = config;

    return vaults.flatMap(({ address, state }) => {
        const stats = statsByVault[address];
        const symbol = symbolByMint.get(state.tokenMint);
        if (!stats || !symbol) return [];

        const institutional = institutionalConfig[address];
        const listed = institutional ?? lendConfig[address];
        const farmApy = Number(stats.apy.farmIncentives);
        const reservesApy = Number(stats.apy.reservesIncentives);
        const rewardTokens = uniqueRewardTokens([
            ...(farmApy > 0 ? activeRewards(stats.farmRewards) : []),
            ...(reservesApy > 0
                ? stats.allocations
                      .filter((a) => Number(a.actualPct) > 0)
                      .flatMap((a) => activeRewards(reserveStats[a.reserve]?.supplyRewardApys))
                : []),
        ]);

        return {
            pool: address,
            chain: 'Solana',
            project: 'kamino-lend',
            symbol,
            poolMeta: listed?.name ?? state.name,
            underlyingTokens: [state.tokenMint],
            token: state.sharesMint,
            tvlUsd: Number(stats.holdings.investedUsd) + Number(stats.holdings.availableUsd),
            apyBase: Number(stats.apy.base.net) * 100,
            apyReward: rewardTokens ? (farmApy + reservesApy) * 100 : undefined,
            rewardTokens,
            url: `${APP_URL}/earn/${institutional ? 'institutional' : 'lend'}/${
                listed ? slugify(listed.name) : address
            }`,
        };
    });
};

const getApy = async () => {
    const markets = await get('/v2/kamino-market');
    const marketIds = markets.map((m) => m.lendingMarket);
    const marketNames = new Map(markets.map((m) => [m.lendingMarket, m.name]));
    const [accounts, reserveStats] = await Promise.all([
        get(`/kamino-market/reserves/account-data?${marketIds.map((id) => `markets=${id}`).join('&')}`),
        get(`/reserves/batch/stats?market=${marketIds.join(',')}`),
    ]);

    const reservePools = accounts.flatMap(({ market, reserves }) =>
        reserves.flatMap(({ pubkey, data }) => {
            const r = reserveStats[pubkey];
            if (!r) return [];

            const reserveData = decodeReserveData(data);
            const supplyRewards = activeRewards(r.supplyRewardApys);
            const borrowRewards = activeRewards(r.borrowRewardApys);
            return {
                pool: pubkey,
                chain: 'Solana',
                project: 'kamino-lend',
                symbol: reserveData.symbol,
                poolMeta: marketNames.get(market),
                underlyingTokens: [r.token],
                tvlUsd: Number(r.totalSupplyUsd) - Number(r.totalBorrowUsd),
                url: `${APP_URL}/borrow/reserve/${market}/${pubkey}`,
                apyBase: Number(r.supplyApy.current) * 100,
                apyReward: sumRewardApy(supplyRewards),
                rewardTokens: uniqueRewardTokens([...supplyRewards, ...borrowRewards]),
                totalSupplyUsd: Number(r.totalSupplyUsd),
                totalBorrowUsd: Number(r.totalBorrowUsd),
                availableBorrowUsd: getAvailableBorrowUsd(r, reserveData),
                apyBaseBorrow: Number(r.borrowApy.current) * 100,
                apyRewardBorrow: sumRewardApy(borrowRewards),
                borrowToken: r.token,
                ltv: Number(r.maxLTV),
                borrowable: reserveData.status === 0 && reserveData.borrowLimit > 0n,
                routeGroupKey: market,
            };
        })
    );

    const symbolByMint = new Map(
        reservePools.map((p) => [p.underlyingTokens[0], p.symbol])
    );
    const vaultPools = await getVaultPools(symbolByMint, reserveStats).catch((err) => {
        console.error(`kamino-lend: vaults failed: ${err.code || err.message}`);
        return [];
    });

    return [...reservePools, ...vaultPools];
};

module.exports = {
    protocolId: '3770',
    apy: getApy,
    url: 'https://app.kamino.finance/',
};
