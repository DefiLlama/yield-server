const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { capConfig, capABI } = require('./lib/configs');


const poolsFunction = async () => {
    const chain = 'ethereum';
    const infra = capConfig[chain].infra;
    const cUSD = capConfig[chain].tokens.cUSD;
    const stcUSD = capConfig[chain].tokens.stcUSD;

    const stcUSDInfos = await utils.getERC4626Info(stcUSD.address, chain);
    const cUSDPriceRes = await sdk.api.abi.call({
        abi: capABI.Oracle.getPrice,
        target: infra.oracle.address,
        chain,
        params: [cUSD.address],
    });

    const cUSDPrice = BigInt(cUSDPriceRes.output[0]);
    const tvlCUSD = BigInt(stcUSDInfos.tvl);
    const tvlUsd = cUSDPrice * tvlCUSD / BigInt(10) ** BigInt(cUSD.decimals);
    const tvlUsdNum = Number(tvlUsd) / 10 ** infra.oracle.priceDecimals;

    const stcUSDPool = {
        pool: stcUSDInfos.pool,
        chain: utils.formatChain(chain),
        project: 'cap',
        symbol: utils.formatSymbol(stcUSD.id),
        tvlUsd: tvlUsdNum,
        apy: stcUSDInfos.apyBase,
    };

    return [stcUSDPool];
};

module.exports = {
    apy: poolsFunction,
    url: 'https://cap.app',
};