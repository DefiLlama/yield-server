const sdk = require('@defillama/sdk3');
const utils = require('../utils');

const {
    getMuxLpApr,
    getGlpApr,
    getVlpApr,
    getLodestarApr,
    getLodestarTokenPriceInUSD,
    getPendleApr,
} = require('./strategy-adapter');

async function getApr(poolAddress, underlyingTokenAddress, strategy) {
    let apr = 0;
    switch (strategy) {
        case 'GLPStrategy':
            apr = await getGlpApr();
            break;
        case 'MuxStrategy':
            apr = await getMuxLpApr();
            break;
        case 'VelaStrategy':
            apr = await getVlpApr();
            break;
        case 'LodestarStrategy':
            apr = await getLodestarApr(underlyingTokenAddress);
            break;
        case 'PendleStrategy':
            apr = await getPendleApr(underlyingTokenAddress);
            break;
        default:
            apr = 0;
    }

    console.log({strategy, apr})

    const harvestCountPerDay = 3;
    const apyBase = utils.aprToApy(apr, harvestCountPerDay * 365);

    return apyBase;
}

async function getTvl(poolAddress, underlyingTokenAddress, strategy) {
    let underlyingTokenPrice = 0;

    if (strategy == 'LodestarStrategy') {
        underlyingTokenPrice = await getLodestarTokenPriceInUSD(
            underlyingTokenAddress
        );
    } else {
        underlyingTokenPrice = (
            await utils.getPrices([underlyingTokenAddress], 'arbitrum')
        ).pricesByAddress[underlyingTokenAddress.toLowerCase()];
    }

    const [{ output: assetBalance }, { output: assetDecimals }] =
        await Promise.all([
            sdk.api.abi.call({
                target: poolAddress,
                abi: 'uint256:assetBalance',
                chain: 'arbitrum',
            }),
            sdk.api.abi.call({
                target: underlyingTokenAddress,
                abi: 'erc20:decimals',
                chain: 'arbitrum',
            }),
        ]);

    const tvlUsd = (assetBalance / 10 ** assetDecimals) * underlyingTokenPrice;

    return tvlUsd;
}

module.exports = { getTvl, getApr };
