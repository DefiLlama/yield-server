const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const lensAbi = require('./lens.abi.json');
const factoryAbi = require('./factory.abi.json');
const axios = require('axios');
const { url } = require('inspector');

const chains = {
    ethereum: {
        factory: '0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e',
        vaultLens: '0xA8695d44EC128136F8Afcd796D6ba3Db3cdA8914',
        fromBlock: 20529225,
    },
    bob: {
        factory: '0x046a9837A61d6b6263f54F4E27EE072bA4bdC7e4',
        vaultLens: '0xb20343277ad78150D21CC8820fF012efDDa71531',
        fromBlock: 12266832,
    },
}

const getApys = async () => {
    const result = [];

    const factoryIFace = new ethers.utils.Interface(factoryAbi);
    const lensIFace = new ethers.utils.Interface(lensAbi);

    for (const [chain, config] of Object.entries(chains)) {
        const currentBlock = await sdk.api.util.getLatestBlock(chain);
        const toBlock = currentBlock.number;
    
        // Fetch all pools from factory events
        const poolDeployEvents = await sdk.api.util.getLogs({
            fromBlock: config.fromBlock,
            toBlock: toBlock,
            target: config.factory,
            chain: chain,
            topic: "",
            keys: [],
            topics: [factoryIFace.getEventTopic('ProxyCreated')],
            entireLog: true,
        });

        const vaultAddresses = poolDeployEvents.output.map((event) => {
            const decoded = factoryIFace.decodeEventLog("ProxyCreated", event.data, event.topics);
            return decoded["proxy"];
        });

        // TODO loop over all vaults to get their info
        for(const vault of vaultAddresses) {
            const vaultInfo = await sdk.api.abi.call({
                target: config.vaultLens,
                params: [vault],
                abi: lensAbi.find((m) => m.name === 'getVaultInfoFull'),
                chain,
            });

            // Only pools with an interest rate
            if(vaultInfo.output.irmInfo.interestRateInfo[0] && vaultInfo.output.irmInfo.interestRateInfo[0].supplyAPY > 0) {

                const price = (
                    await axios.get(`https://coins.llama.fi/prices/current/${chain}:${vaultInfo.output.asset}`)
                ).data.coins[`${chain}:${vaultInfo.output.asset}`].price;

                const totalSupplied = vaultInfo.output.totalAssets;
                const totalBorrowed = vaultInfo.output.totalBorrowed;

                const totalSuppliedUSD = ethers.utils.formatUnits(totalSupplied, vaultInfo.output.assetDecimals) * price;
                const totalBorrowedUSD = ethers.utils.formatUnits(totalBorrowed, vaultInfo.output.assetDecimals) * price;

                result.push({
                    pool: vault,
                    chain,
                    project: "euler-v2",
                    symbol: vaultInfo.output.vaultSymbol,
                    tvlUsd: totalSuppliedUSD - totalBorrowedUSD,
                    totalSupplyUsd: totalSuppliedUSD,
                    totalBorrowUsd: totalBorrowedUSD,
                    apyBase: Number(ethers.utils.formatUnits(vaultInfo.output.irmInfo.interestRateInfo[0].supplyAPY, 25)),
                    apyBaseBorrow: Number(ethers.utils.formatUnits(vaultInfo.output.irmInfo.interestRateInfo[0].borrowAPY, 25)),
                    underlyingTokens: [vaultInfo.output.asset],
                    url: `https://app.euler.finance/vault/${vault}?network=${chain}`,
                })
            }
        }
    }
    return result;
}



module.exports = {
    timetravel: false,
    apy: getApys,
}