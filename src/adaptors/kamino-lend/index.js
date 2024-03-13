const axios = require('axios');
const utils = require('../utils');

const getApy = async () => {
    const markets = ['7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'];
    const reserveApys = [];
    for (const market of markets) {
        const reserves = (await axios.get(`https://api.kamino.finance/kamino-market/${market}/reserves/metrics?env=mainnet-beta`)).data;

        reserveApys.push(
            ...reserves.map((r) => {
                return {
                    pool: r.reserve,
                    chain: 'Solana',
                    project: 'kamino-lend',
                    symbol: utils.formatSymbol(r.liquidityToken),
                    underlyingTokens: [r.liquidityTokenMint],
                    tvlUsd: Number(r.totalSupplyUsd - r.totalBorrowUsd),
                    url: `https://app.kamino.finance/lending/reserve/${r.reserve}`,
                    apyBase: Number(r.supplyApy) * 100,
                    totalSupplyUsd: Number(r.totalSupplyUsd),
                    totalBorrowUsd: Number(r.totalBorrowUsd),
                    apyBaseBorrow: Number(r.borrowApy) * 100,
                    ltv: Number(r.maxLtv),
                };
            })
        );
    }

    return reserveApys;
};

module.exports = {
    apy: getApy,
    url: 'https://app.kamino.finance/',
};
