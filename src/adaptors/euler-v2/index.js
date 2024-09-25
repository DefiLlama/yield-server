const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const lensAbi = require('./lens.abi.json');
const factoryAbi = require('./factory.abi.json');
const axios = require('axios');
const { url } = require('inspector');

const EULER_FACTORY = "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e";
const VAULT_LENS = "0x352e64E70bd1d2Fa46bDc2331D8220202c3f2c3B";
const EULER_DEPLOY_BLOCK = 20529225;


const getApys = async () => {
    const factoryIFace = new ethers.utils.Interface(factoryAbi);
    const lensIFace = new ethers.utils.Interface(lensAbi);
    const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
    const toBlock = currentBlock.number;
   
    // Fetch all pools from factory events
    const poolDeployEvents = await sdk.api.util.getLogs({
        fromBlock: EULER_DEPLOY_BLOCK,
        toBlock: toBlock,
        target: EULER_FACTORY,
        chain: "ethereum",
        topic: "",
        keys: [],
        topics: [factoryIFace.getEventTopic('ProxyCreated')],
        entireLog: true,

    });

    const vaultAddresses = poolDeployEvents.output.map((event) => {
        const decoded = factoryIFace.decodeEventLog("ProxyCreated", event.data, event.topics);
        return decoded["proxy"];
    });

    
    const result = [];
    // TODO loop over all vaults to get their info
    for(const vault of vaultAddresses) {
        const vaultInfo = await sdk.api.abi.call({
            target: VAULT_LENS,
            params: [vault],
            abi: lensAbi.find((m) => m.name === 'getVaultInfoFull'),
            chain: "ethereum",
        });

        // Only pools with an interest rate
        if(vaultInfo.output.irmInfo.interestRateInfo[0] && vaultInfo.output.irmInfo.interestRateInfo[0].supplyAPY > 0) {

            const price = (
                await axios.get(`https://coins.llama.fi/prices/current/ethereum:${vaultInfo.output.asset}`)
            ).data.coins[`ethereum:${vaultInfo.output.asset}`].price;

            const totalSupplied = vaultInfo.output.totalAssets;
            const totalBorrowed = vaultInfo.output.totalBorrowed;

            const totalSuppliedUSD = ethers.utils.formatUnits(totalSupplied, vaultInfo.output.assetDecimals) * price;
            const totalBorrowedUSD = ethers.utils.formatUnits(totalBorrowed, vaultInfo.output.assetDecimals) * price;

            result.push({
                pool: vault,
                chain: "ethereum",
                project: "euler-v2",
                symbol: vaultInfo.output.vaultSymbol,
                tvlUsd: totalSuppliedUSD - totalBorrowedUSD,
                totalSupplyUsd: totalSuppliedUSD,
                totalBorrowUsd: totalBorrowedUSD,
                apyBase: Number(ethers.utils.formatUnits(vaultInfo.output.irmInfo.interestRateInfo[0].supplyAPY, 25)),
                apyBaseBorrow: Number(ethers.utils.formatUnits(vaultInfo.output.irmInfo.interestRateInfo[0].borrowAPY, 25)),
                underlyingTokens: [vaultInfo.output.asset],
                url: `https://app.euler.finance/vault/${vault}`,
            })
        }
    }
    return result;
}



module.exports = {
    timetravel: false,
    apy: getApys,
}