const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const { LINE_CONTRACT_ADDRESS, CHAIN } = require("../config");

const LineAbi = require('../abi/lineAbi');
const equilibrePairAbi = require('../abi/equilibrePairAbi');
const { getData } = require('../../utils');
const fetchPrice = require('./fetchPrice');

module.exports = async function getPoolTokenPrice(tokenAddress, lineTokenPrice) {

    const tokens = await sdk.api.abi.call({
        target: tokenAddress,
        abi: equilibrePairAbi.find((m) => m.name === 'tokens'),
        chain: CHAIN,
    }).then((res) => res.output).catch(() => false);

    if (tokens) { // it's a quilibre pool
        const totalSupplyGetter = sdk.api.abi.call({
            target: tokenAddress,
            abi: equilibrePairAbi.find((m) => m.name === 'totalSupply'),
            chain: CHAIN,
        }).then(data => data.output)

        const reservesGetter = sdk.api.abi.call({
            target: tokenAddress,
            abi: equilibrePairAbi.find((m) => m.name === 'getReserves'),
            chain: CHAIN,
        }).then(data => data.output)

        const [totalSupply, reserves] = await Promise.all([totalSupplyGetter, reservesGetter]);

        const price0 = tokens[0] !== LINE_CONTRACT_ADDRESS ? await fetchPrice(tokens[0]) : lineTokenPrice;
        let lpPriceInUSD = "0";

        if (totalSupply) {
            lpPriceInUSD = BigNumber(reserves[0]).multipliedBy(2).multipliedBy(price0).dividedBy(totalSupply).toString();
        }

        return lpPriceInUSD;
    } else { // it's a token
        if (tokenAddress === LINE_CONTRACT_ADDRESS) {
            return String(lineTokenPrice);
        } else {
            return await fetchPrice(tokenAddress).then(price => String(price)).catch(() => 0);
        }
    }
}