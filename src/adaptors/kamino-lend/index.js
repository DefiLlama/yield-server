const axios = require('axios');
const utils = require('../utils');

const BASE_URL = 'https://api.kamino.finance';
const CONFIG_OFFSET = 4856;
const LIQUIDITY_OFFSET = 128;

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
    if (!reserveData || reserveData.borrowLimit === 0n) return 0;

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

const getApy = async () => {
    const markets = (await axios.get(`${BASE_URL}/v2/kamino-market`)).data;
    const marketParams = markets
        .map((market) => `markets=${market.lendingMarket}`)
        .join('&');
    const reserveData = (
        await axios.get(`${BASE_URL}/kamino-market/reserves/account-data?${marketParams}`)
    ).data;
    const reserveDataByMarket = new Map(
        reserveData.flatMap(({ market, reserves }) =>
            reserves.map((reserve) => [
                `${market}-${reserve.pubkey}`,
                decodeReserveData(reserve.data),
            ])
        )
    );

    const reserveApys = await Promise.all(
        markets.map(async (market) => {
            const reserves = (await axios.get(`${BASE_URL}/kamino-market/${market.lendingMarket}/reserves/metrics?env=mainnet-beta`)).data;

            return reserves.map((r) => {
                const reserveData = reserveDataByMarket.get(
                    `${market.lendingMarket}-${r.reserve}`
                );
                return {
                    pool: r.reserve,
                    chain: 'Solana',
                    project: 'kamino-lend',
                    symbol: r.liquidityToken,
                    poolMeta: market.name,
                    underlyingTokens: [r.liquidityTokenMint],
                    tvlUsd: Number(r.totalSupplyUsd - r.totalBorrowUsd),
                    url: `https://kamino.com/borrow/reserve/${market.lendingMarket}/${r.reserve}`,
                    apyBase: Number(r.supplyApy) * 100,
                    totalSupplyUsd: Number(r.totalSupplyUsd),
                    totalBorrowUsd: Number(r.totalBorrowUsd),
                    availableBorrowUsd: getAvailableBorrowUsd(r, reserveData),
                    apyBaseBorrow: Number(r.borrowApy) * 100,
                    borrowToken: r.liquidityTokenMint,
                    ltv: Number(r.maxLtv),
                    borrowable:
                        reserveData?.status === 0 && reserveData.borrowLimit > 0n,
                    routeGroupKey: market.lendingMarket,
                };
            });
        })
    );

    return reserveApys.flat();
};

module.exports = {
  protocolId: '3770',
    apy: getApy,
    url: 'https://app.kamino.finance/',
};
