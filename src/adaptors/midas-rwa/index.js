const utils = require('../utils');

const poolsFunction = async () => {
    const dataTvl = await utils.getData('https://api.llama.fi/protocol/midas-rwa');
    const dataApy = await utils.getData('https://api-prod.midas.app/api/data/kpi');

    const { mBasisAPY, mTbillAPY, mBtcAPY } = dataApy;

    const chains = {
        Ethereum: {
            mtbill: {
                address: "0xdd629e5241cbc5919847783e6c96b2de4754e438",
                apy: mTbillAPY,
                url: "https://midas.app/mtbill"
            },
            mbasis: {
                address: "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656",
                apy: mBasisAPY,
                url: "https://midas.app/mbasis"
            },
            mBTC: {
                address: "0x007115416AB6c266329a03B09a8aa39aC2eF7d9d",
                apy: mBtcAPY,
                url: "https://midas.app/mbtc"
            }
        },
        Base: {
            mtbill: {
                address: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
                apy: mTbillAPY,
                url: "https://midas.app/mtbill"
            },
            mbasis: {
                address: "0x1C2757c1FeF1038428b5bEF062495ce94BBe92b2",
                apy: mBasisAPY,
                url: "https://midas.app/mbasis"
            }
        },
        Sapphire: {
            mtbill: {
                address: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
                apy: mTbillAPY,
                url: "https://midas.app/mtbill"
            }
        }
    };

    const pools = [];

    for (const [chainName, tokens] of Object.entries(chains)) {
        for (const [tokenName, tokenData] of Object.entries(tokens)) {

            const symbol = tokenName.toUpperCase();
            const tokenInUsd = dataTvl.chainTvls?.[chainName]?.tokensInUsd;
            const tokenInUsdValue = tokenInUsd[tokenInUsd.length - 1].tokens[symbol] || 0;

            pools.push({
                pool: `${tokenData.address}-${chainName.toLowerCase()}`,
                chain: chainName,
                project: 'midas-rwa',
                symbol: utils.formatSymbol(tokenName),
                tvlUsd: Number(tokenInUsdValue),
                apyBase: tokenData.apy * 100 || 0,
                url: tokenData.url
            });
        }
    }

    return pools;
};

module.exports = {
    timetravel: false,
    apy: poolsFunction
};