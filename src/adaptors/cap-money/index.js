const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { capConfig, capABI } = require('./lib/configs');
const { interpretAsDecimal } = require('./lib/utils');


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
    const cUSDPrice = interpretAsDecimal(cUSDPriceRes.output[0], infra.oracle.priceDecimals);
    const tvlUsd = cUSDPrice.mul(stcUSDInfos.tvl);

    const stcUSDPool = {
        pool: stcUSDInfos.pool,
        chain: utils.formatChain(chain),
        project: 'cap-money',
        symbol: utils.formatSymbol(stcUSD.id),
        tvlUsd: tvlUsd.toNumber(),
        apy: stcUSDInfos.apyBase,
    };

    return [stcUSDPool];
};

module.exports = {
    apy: poolsFunction,
    url: 'https://cap.app',
};