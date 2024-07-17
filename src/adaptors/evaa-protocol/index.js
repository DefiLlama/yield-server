const utils = require('../utils');

const { TonClient } = require("@ton/ton");
const { sha256_sync } = require("@ton/crypto");
const { getPrices, JETTON_MASTER_ADDRESSES, Evaa, parseMasterData, calculatePresentValue } = require("@evaafi/sdk")


function bufferToBigInt(buffer, start = 0, end = buffer.length) {
    const bufferAsHexString = buffer.subarray(start, end).toString("hex");
    return BigInt(`0x${bufferAsHexString}`);
}

const assets = {
    TON: { assetId: bufferToBigInt(sha256_sync("TON")), token: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c' },
    jUSDT: { assetId: bufferToBigInt(sha256_sync("jUSDT")), token: 'EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA' },
    USDT: { assetId: bufferToBigInt(sha256_sync("USDT")), token: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' },
    jUSDC: { assetId: bufferToBigInt(sha256_sync("jUSDC")), token: 'EQB-MPwrd1G6WKNkLz_VnV6WqBDd142KMQv-g1O-8QUA3728' },
    stTON: { assetId: bufferToBigInt(sha256_sync("stTON")), token: 'EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k' },
    tsTON: { assetId: bufferToBigInt(sha256_sync("tsTON")), token: 'EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav' },
};

// ignore pools with TVL below the threshold
const MIN_TVL_USD = 100000;

const priceScaleFactor = BigInt(1e9);


const getApy = async () => {
    console.log("Requesting prices")
    let prices = await getPrices();
    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC"
    });
    const evaa = client.open(
        new Evaa({
            testnet: false,
        })
    );

    const data = await client.getContractState(evaa.address).then((result) => {
        if (!result.data) {
            throw new Error("Master data not found");
        }

        try {
            return parseMasterData(result.data.toString("base64"), false);
        } catch (e) {
            console.log(e);
        }
    });
    return Object.entries(assets).map(([tokenSymbol, asset]) => {
        const { assetId, token } = asset;
        console.log("Process symbol", tokenSymbol, asset, assetId, token)
        const priceData = prices.dict.get(assetId);
        const assetConfig = data.assetsConfig.get(assetId);
        const assetData = data.assetsData.get(assetId);

        const price = Number(priceData) / Number(priceScaleFactor);

        if (assetConfig && assetData && price) {
            const scaleFactor = 10 ** Number(assetConfig.decimals);

            const totalSupplyUsd =
                (Number(
                    calculatePresentValue(assetData.sRate, assetData.totalSupply)
                ) *
                    price) /
                scaleFactor;

            const totalBorrowUsd =
                (Number(
                    calculatePresentValue(assetData.bRate, assetData.totalBorrow)
                ) *
                    price) /
                scaleFactor;

            console.log(tokenSymbol, "totalSupplyInUsd", totalSupplyUsd);
            console.log(tokenSymbol, "totalBorrowInUsd", totalBorrowUsd);
            supplyApy = (1 + (Number(assetData.supplyInterest) / 1e12) * 24 * 3600) ** 365 - 1;
            borrowApy = (1 + (Number(assetData.borrowInterest) / 1e12) * 24 * 3600) ** 365 - 1;
            console.log(tokenSymbol, "supplyApy", supplyApy * 100);
            console.log(tokenSymbol, "borrowApy", borrowApy * 100);

            return {
                pool: `evaa-${assetId}-ton`.toLowerCase(),
                chain: 'Ton',
                project: 'evaa-protocol',
                symbol: tokenSymbol,
                tvlUsd: totalSupplyUsd - totalBorrowUsd,
                apyBase: supplyApy * 100,
                underlyingTokens: [token],
                url: `https://app.evaa.finance/token/${tokenSymbol}`,
                totalSupplyUsd: totalSupplyUsd,
                totalBorrowUsd: totalBorrowUsd,
                apyBaseBorrow: borrowApy * 100
            };
        } else {
            return undefined;
        }
    }).filter((pool) => pool !== undefined)
        .filter((pool) => pool.tvlUsd > MIN_TVL_USD);
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://evaa.finance/',
};
