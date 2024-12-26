const utils = require('../utils');

const fetch = require('node-fetch')
const { TonClient } = require("@ton/ton");
const { Address, Cell, Slice, Dictionary, beginCell } = require("@ton/core");
const crypto = require("crypto");
const NFT_ID = '0xfb9874544d76ca49c5db9cc3e5121e4c018bc8a2fb2bfe8f2a38c5b9963492f5';

function sha256Hash(input) {
    const hash = crypto.createHash("sha256");
    hash.update(input);
    const hashBuffer = hash.digest();
    const hashHex = hashBuffer.toString("hex");
    return BigInt("0x" + hashHex);
}



function bufferToBigInt(buffer, start = 0, end = buffer.length) {
    console.log(buffer)
    const bufferAsHexString = buffer.subarray(start, end).toString("hex");
    return BigInt(`0x${bufferAsHexString}`);
}

const assets = {
    TON: { assetId: sha256Hash("TON"), token: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c' },
    jUSDT: { assetId: sha256Hash("jUSDT"), token: 'EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA' },
    USDT: { assetId: sha256Hash("USDT"), token: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' },
    jUSDC: { assetId: sha256Hash("jUSDC"), token: 'EQB-MPwrd1G6WKNkLz_VnV6WqBDd142KMQv-g1O-8QUA3728' },
    stTON: { assetId: sha256Hash("stTON"), token: 'EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k' },
    tsTON: { assetId: sha256Hash("tsTON"), token: 'EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav' },
};


const MASTER_CONSTANTS = {
    FACTOR_SCALE: BigInt(1e12),
    ASSET_COEFFICIENT_SCALE: 10000n,
    ASSET_PRICE_SCALE: BigInt(1e8),
    ASSET_RESERVE_FACTOR_SCALE: 10000n,
    ASSET_LIQUIDATION_RESERVE_FACTOR_SCALE: 10000n,
    ASSET_ORIGINATION_FEE_SCALE: BigInt(1e9)
};

const MAINNET_ASSETS_ID = {};

for (const key in assets) {
    MAINNET_ASSETS_ID[key] = assets[key].assetId
}


class MyCell extends Cell {
    toString() {
        return this.hashBigInt().toString();
    }

    hashBigInt() {
        return BigInt('0x' + this.hash().toString('hex'));
    }
}

function mulFactor(decimal, a, b) {
    return (a * b) / decimal;
}

function mulDiv(x, y, z) {
    return (x * y) / z;
}

function createAssetData() {
    return {
        serialize: (src, buidler) => {
            buidler.storeUint(src.sRate, 64);
            buidler.storeUint(src.bRate, 64);
            buidler.storeUint(src.totalSupply, 64);
            buidler.storeUint(src.totalBorrow, 64);
            buidler.storeUint(src.lastAccural, 32);
            buidler.storeUint(src.balance, 64);
        },
        parse: (src) => {
            const sRate = BigInt(src.loadInt(64));
            const bRate = BigInt(src.loadInt(64));
            const totalSupply = BigInt(src.loadInt(64));
            const totalBorrow = BigInt(src.loadInt(64));
            const lastAccural = BigInt(src.loadInt(32));
            const balance = BigInt(src.loadInt(64));
            return { sRate, bRate, totalSupply, totalBorrow, lastAccural, balance };
        },
    };
}


function createAssetConfig() {
    return {
        serialize: (src, builder) => {
            builder.storeUint(src.oracle, 256);
            builder.storeUint(src.decimals, 8);
            const refBuild = beginCell();
            refBuild.storeUint(src.collateralFactor, 16);
            refBuild.storeUint(src.liquidationThreshold, 16);
            refBuild.storeUint(src.liquidationBonus, 16);
            refBuild.storeUint(src.baseBorrowRate, 64);
            refBuild.storeUint(src.borrowRateSlopeLow, 64);
            refBuild.storeUint(src.borrowRateSlopeHigh, 64);
            refBuild.storeUint(src.supplyRateSlopeLow, 64);
            refBuild.storeUint(src.supplyRateSlopeHigh, 64);
            refBuild.storeUint(src.targetUtilization, 64);
            refBuild.storeUint(src.originationFee, 64);
            refBuild.storeUint(src.dust, 64);
            refBuild.storeUint(src.maxTotalSupply, 64);
            refBuild.storeUint(src.reserveFactor, 16);
            refBuild.storeUint(src.liquidationReserveFactor, 16);
            builder.storeRef(refBuild.endCell());
        },
        parse: (src) => {
            const oracle = src.loadUintBig(256);
            const decimals = BigInt(src.loadUint(8));
            const ref = src.loadRef().beginParse();
            const collateralFactor = ref.loadUintBig(16);
            const liquidationThreshold = ref.loadUintBig(16);
            const liquidationBonus = ref.loadUintBig(16);
            const baseBorrowRate = ref.loadUintBig(64);
            const borrowRateSlopeLow = ref.loadUintBig(64);
            const borrowRateSlopeHigh = ref.loadUintBig(64);
            const supplyRateSlopeLow = ref.loadUintBig(64);
            const supplyRateSlopeHigh = ref.loadUintBig(64);
            const targetUtilization = ref.loadUintBig(64);
            const originationFee = ref.loadUintBig(64);
            const dust = ref.loadUintBig(64);
            const maxTotalSupply = ref.loadUintBig(64);
            const reserveFactor = ref.loadUintBig(16);
            const liquidationReserveFactor = ref.loadUintBig(16);

            return {
                oracle,
                decimals,
                collateralFactor,
                liquidationThreshold,
                liquidationBonus,
                baseBorrowRate,
                borrowRateSlopeLow,
                borrowRateSlopeHigh,
                supplyRateSlopeLow,
                supplyRateSlopeHigh,
                targetUtilization,
                originationFee,
                dust,
                maxTotalSupply,
                reserveFactor,
                liquidationReserveFactor,
            };
        },
    };
}

function loadMaybeMyRef(slice) {
    const cell = slice.loadMaybeRef();
    if (cell === null) {
        return null;
    }
    return new MyCell({
        exotic: cell.isExotic,
        bits: cell.bits,
        refs: cell.refs,
    });
}

function loadMyRef(slice) {
    const cell = slice.loadRef();
    return new MyCell({
        exotic: cell.isExotic,
        bits: cell.bits,
        refs: cell.refs,
    });
}

function parseMasterData(masterDataBOC) {
    const ASSETS_ID = MAINNET_ASSETS_ID;
    const masterSlice = Cell.fromBase64(masterDataBOC).beginParse();
    masterSlice.loadRef(); // meta
    masterSlice.loadRef() // upgradeConfigRef

    const masterConfigSlice = masterSlice.loadRef().beginParse();

    const assetsConfigDict = masterConfigSlice.loadDict(Dictionary.Keys.BigUint(256), createAssetConfig());
    const assetsDataDict = masterSlice.loadDict(Dictionary.Keys.BigUint(256), createAssetData());
    const assetsExtendedData = Dictionary.empty();
    const assetsReserves = Dictionary.empty();
    const apy = {
        supply: Dictionary.empty(),
        borrow: Dictionary.empty(),
    };

    for (const [tokenSymbol, assetID] of Object.entries(ASSETS_ID)) {
        const assetData = calculateAssetData(assetsConfigDict, assetsDataDict, assetID);
        assetsExtendedData.set(assetID, assetData);
    }

    for (const [_, assetID] of Object.entries(ASSETS_ID)) {
        const assetData = assetsExtendedData.get(assetID);
        const totalSupply = calculatePresentValue(assetData.sRate, assetData.totalSupply);
        const totalBorrow = calculatePresentValue(assetData.bRate, assetData.totalBorrow);
        assetsReserves.set(assetID, assetData.balance - totalSupply + totalBorrow);

        apy.supply.set(assetID, (1 + (Number(assetData.supplyInterest) / 1e12) * 24 * 3600) ** 365 - 1);
        apy.borrow.set(assetID, (1 + (Number(assetData.borrowInterest) / 1e12) * 24 * 3600) ** 365 - 1);
    }

    return {
        assetsConfig: assetsConfigDict,
        assetsData: assetsExtendedData,
        assetsReserves: assetsReserves,
        apy: apy,
    };
}

function calculateAssetData(
    assetsConfigDict,
    assetsDataDict,
    assetId,
) {
    const config = assetsConfigDict.get(assetId);
    const data = assetsDataDict.get(assetId);

    if (!data || !config) {
        throw new Error('Asset Data or Config is not accessible');
    }

    const { sRate, bRate, supplyInterest, borrowInterest, now } = calculateCurrentRates(config, data);
    data.sRate = sRate || 0n;
    data.bRate = bRate || 0n;
    data.lastAccural = now;

    const supplyApy = (1 + (Number(supplyInterest) / 1e12) * 24 * 3600) ** 365 - 1;
    const borrowApy = (1 + (Number(borrowInterest) / 1e12) * 24 * 3600) ** 365 - 1;

    return {
        ...data,
        ...{ supplyInterest, borrowInterest },
        ...{ supplyApy, borrowApy },
    };
}

function calculateAssetInterest(assetConfig, assetData) {
    const totalSupply = calculatePresentValue(assetData.sRate, assetData.totalSupply);
    const totalBorrow = calculatePresentValue(assetData.bRate, assetData.totalBorrow);
    let utilization = 0n;
    let supplyInterest = 0n;
    let borrowInterest = 0n;

    if (totalSupply !== 0n) {
        utilization = (totalBorrow * MASTER_CONSTANTS.FACTOR_SCALE) / totalSupply;
    }

    if (utilization <= assetConfig.targetUtilization) {
        borrowInterest =
            assetConfig.baseBorrowRate +
            mulFactor(MASTER_CONSTANTS.FACTOR_SCALE, assetConfig.borrowRateSlopeLow, utilization);
    } else {
        borrowInterest =
            assetConfig.baseBorrowRate +
            mulFactor(MASTER_CONSTANTS.FACTOR_SCALE, assetConfig.borrowRateSlopeLow, assetConfig.targetUtilization) +
            mulFactor(
                MASTER_CONSTANTS.FACTOR_SCALE,
                assetConfig.borrowRateSlopeHigh,
                utilization - assetConfig.targetUtilization,
            );
    }

    supplyInterest = mulDiv(
        mulDiv(borrowInterest, utilization, MASTER_CONSTANTS.FACTOR_SCALE),
        MASTER_CONSTANTS.ASSET_RESERVE_FACTOR_SCALE - assetConfig.reserveFactor,
        MASTER_CONSTANTS.ASSET_RESERVE_FACTOR_SCALE,
    );

    return {
        supplyInterest,
        borrowInterest,
    };
}

function calculateCurrentRates(assetConfig, assetData) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const timeElapsed = now - assetData.lastAccural;
    const { supplyInterest, borrowInterest } = calculateAssetInterest(assetConfig, assetData);

    if (timeElapsed > 0) {
        const updatedSRate =
            assetData.sRate + mulFactor(MASTER_CONSTANTS.FACTOR_SCALE, assetData.sRate, supplyInterest * timeElapsed);
        const updatedBRate =
            assetData.bRate + mulFactor(MASTER_CONSTANTS.FACTOR_SCALE, assetData.bRate, borrowInterest * timeElapsed);
        return {
            sRate: updatedSRate,
            bRate: updatedBRate,
            supplyInterest,
            borrowInterest,
            now,
        };
    }

    return {
        sRate: assetData.sRate,
        bRate: assetData.bRate,
        supplyInterest,
        borrowInterest,
        now,
    };
}

async function getPrices(endpoint = "api.stardust-mainnet.iotaledger.net") {
    try {
        let result = await fetch(`https://${endpoint}/api/indexer/v1/outputs/nft/${NFT_ID}`, {
            headers: { accept: 'application/json' },
        });
        let outputId = await result.json();

        result = await fetch(`https://${endpoint}/api/core/v2/outputs/${outputId.items[0]}`, {
            headers: { accept: 'application/json' },
        });

        let resData = await result.json();

        const data = JSON.parse(
            decodeURIComponent(resData.output.features[0].data.replace('0x', '').replace(/[0-9a-f]{2}/g, '%$&')),
        );

        const pricesCell = Cell.fromBoc(Buffer.from(data['packedPrices'], 'hex'))[0];
        const signature = Buffer.from(data['signature'], 'hex');

        return {
            dict: pricesCell.beginParse().loadDictDirect(Dictionary.Keys.BigUint(256), Dictionary.Values.BigUint(64)),
            dataCell: beginCell().storeRef(pricesCell).storeBuffer(signature).endCell(),
        };
    } catch (error) {
        console.error(error);
        return undefined;
    }
}


// ignore pools with TVL below the threshold
const MIN_TVL_USD = 100000;

const priceScaleFactor = BigInt(1e9);

function calculatePresentValue(index, principalValue) {
    return (principalValue * index) / MASTER_CONSTANTS.FACTOR_SCALE;
}


const getApy = async () => {
    console.log("Requesting prices")
    let prices = await getPrices();
    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC"
    });

    const data = await client.getContractState(Address.parse('EQC8rUZqR_pWV1BylWUlPNBzyiTYVoBEmQkMIQDZXICfnuRr')).then((result) => {
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
                apyBaseBorrow: borrowApy * 100,
                ltv: Number(assetConfig.collateralFactor) / 10000
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
