const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const lensAbi = require('./lens.abi.json');

// interface Pool {
//     pool: string;
//     chain: string;
//     project: string;
//     symbol: string;
//     tvlUsd: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
//     apyBase?: number;
//     apyReward?: number;
//     rewardTokens?: Array<string>;
//     underlyingTokens?: Array<string>;
//     poolMeta?: string;
//     url?: string;
//     // optional lending protocol specific fields:
//     apyBaseBorrow?: number;
//     apyRewardBorrow?: number;
//     totalSupplyUsd?: number;
//     totalBorrowUsd?: number;
//     ltv?: number; // btw [0, 1]
//   }


const EULER_FACTORY = "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e";
const VAULT_LENS = "0x352e64E70bd1d2Fa46bDc2331D8220202c3f2c3B";
const EULER_DEPLOY_BLOCK = 20529225;


const getApys = async () => {
    const factoryIFace = new ethers.utils.Interface([
        'event ProxyCreated(address indexed proxy, bool upgradeable, address implementation, bytes trailingData);',
    ]);

    // Fetch all pools from factory events
    const poolDeployEvents = await sdk.api.util.getLogs({
        fromBlock: EULER_DEPLOY_BLOCK,
        toBlock: "latest",
        target: EULER_FACTORY,
        chain: "ethereum",
        topics: [factoryIFace.getEventTopic('ProxyCreated')]
    });

    const vaultAddresses = poolDeployEvents.map((pool) => pool.args.proxy);
        
    // TODO loop over all vaults to get their info


    return [];
}


module.exports = {
    timetravel: false,
    apy: getApys,
}