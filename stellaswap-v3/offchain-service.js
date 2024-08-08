const gql = require('graphql-request');
const BigNumber = require('bignumber.js');
const ethers = require('ethers');
const { request } = require('graphql-request');
const sdk = require('@defillama/sdk');

const RewarderRegistryABI = require('./abis/OffchainRewarderRegistry.json');
const RewarderABI = require('./abis/OffchainRewarder.json');
const BeefyVaultABI = require('./abis/BeefyCLMVault.json');
const BeefyStrategyABI = require('./abis/BeefyCLMStrategy.json');
const AlgebraPoolABI = require('./abis/pool.json');

const { pulsar, pulsarFarming, pulsarBlocks } = require('./clients');
const utils = require('./utils');

const REWARD_REGISTRY = '0x0e4cAEf48De8FEc07b7dfeae8D73848Aaa8be0cB';
const RPC_URL = 'https://api-moonbeam.dwellir.com/5e6927bb-9acb-466f-a45e-4df46b29b82b';

const OffchainService = {
    getEtherProvider() {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        return provider;
    },

    async getTokenInfoByAddress(tokenAddress) {
        return await utils.getTokenInfoByAddress(tokenAddress);
    },

    isActive(position) {
        const currentTick = +position.pool.tick;
        return (+position.tickLower.tickIdx <= currentTick) && (currentTick < +position.tickUpper.tickIdx);
    },

    isActiveStatic(currentTick, tickLower, tickUpper) {
        if (((tickLower) <= currentTick) && (currentTick < tickUpper)) {
            return true;
        }
        return false;
    },

    async getPoolsViaMulticall(length) {
        const balanceCalls = [];
        for (let index = 0; index < length; index += 1) {
            balanceCalls.push({
                target: REWARD_REGISTRY,
                params: [index]
            });
        }

        const results = await sdk.api.abi.multiCall({
            abi: RewarderRegistryABI.find(abi => abi.name === 'pools'),
            calls: balanceCalls,
            chain: 'moonbeam',
            permitFailure: true,
        });

        const mappedResults = results.output.map(result => ({
            pool: result.output[0],
            rewarder: result.output[1],
            isPaused: result.output[2],
        }));

        return mappedResults;
    },

    async getAllPools() {
        try {
            const rewarderRegistry = new ethers.Contract(REWARD_REGISTRY, RewarderRegistryABI, this.getEtherProvider());
            const registryPoolCount = await rewarderRegistry.getPoolCount();
            const poolsViaMC = await this.getPoolsViaMulticall(+registryPoolCount);
            return poolsViaMC;
        } catch (error) {
            console.log(error);
        }
        return [];
    },

    async getPositionManagersViaMulticall(length) {
        const balanceCalls = [];
        for (let index = 0; index < length; index += 1) {
            balanceCalls.push({
                target: REWARD_REGISTRY,
                params: [index]
            });
        }

        const results = await sdk.api.abi.multiCall({
            abi: RewarderRegistryABI.find(abi => abi.name === 'positionManagers'),
            calls: balanceCalls,
            chain: 'moonbeam',
            permitFailure: true,
        });

        const mappedResults = results.output.map(result => ({
            index: result.input.params[0],
            almKEY: result.output[0],
        }));

        return mappedResults;
    },

    async getAllPositionManagers() {
        try {
            const rewarderRegistry = new ethers.Contract(REWARD_REGISTRY, RewarderRegistryABI, this.getEtherProvider());
            const almCount = await rewarderRegistry.getPositionManagerCount();
            const almsViaMC = await this.getPositionManagersViaMulticall(+almCount);
            return almsViaMC;
        } catch (error) {
            console.log(error);
        }
        return [];
    },

    async getBeefyPosition(pool, vault) {
        const beefyVault = new ethers.Contract(vault, BeefyVaultABI, this.getEtherProvider());

        const strategyAddr = await beefyVault.strategy();
        const beefyStrategy = new ethers.Contract(strategyAddr, BeefyStrategyABI, this.getEtherProvider());

        const positionKeys = await beefyStrategy.getKeys();

        const positionMain = await beefyStrategy.positionMain();

        const positionAlt = await beefyStrategy.positionAlt();

        const algebraPool = new ethers.Contract(pool, AlgebraPoolABI, this.getEtherProvider());

        const poolGlobalState = await algebraPool.globalState();

        const positionMainStats = await algebraPool.positions(positionKeys.keyMain);

        const positionAltStats = await algebraPool.positions(positionKeys.keyAlt);

        const minimalPositions = [];
        let totalLiq = new BigNumber('0');

        if (this.isActiveStatic(poolGlobalState.tick, positionMain.tickLower, positionMain.tickUpper)) {
            totalLiq = totalLiq.plus(positionMainStats.liquidity);
            minimalPositions.push({
                id: '6669697089',
                liquidity: positionMainStats.liquidity,
                tickLower: {
                    __typename: 'Tick',
                    tickIdx: positionMain.tickLower.toString(),
                },
                tickUpper: {
                    __typename: 'Tick',
                    tickIdx: positionMain.tickUpper.toString(),
                },
                pool,
            });
        }

        if (this.isActiveStatic(poolGlobalState.tick, positionAlt.tickLower, positionAlt.tickUpper)) {
            totalLiq = totalLiq.plus(positionAltStats.liquidity);
            minimalPositions.push({
                id: '6669697088',
                liquidity: positionAltStats.liquidity,
                tickLower: {
                    __typename: 'Tick',
                    tickIdx: positionAlt.tickLower.toString(),
                },
                tickUpper: {
                    __typename: 'Tick',
                    tickIdx: positionAlt.tickUpper.toString(),
                },
                pool,
            });
        }

        if (totalLiq.gt(0)) {
            return minimalPositions;
        }

        return [];
    },
};

let poolsAPRObj = {};

const updatePoolsApr = async () => {
    const poolsJson = await utils.getCurrentPoolsInfo();
    const poolsTick = {};
    const poolsCurrentTvl = {};
    const poolsFees = {};

    for (const pool of poolsJson) {
        poolsTick[pool.id] = (+pool.tick);
        poolsCurrentTvl[pool.id] = 0;
        if (poolsFees[pool.id] === undefined) {
            poolsFees[pool.id] = (+pool.feesToken0);
        } else {
            poolsFees[pool.id] += (+pool.feesToken0);
        }
        poolsFees[pool.id] += pool.feesToken1 * (+pool.token0Price);

        const positionsJson = await utils.getPositionsOfPool(pool.id);
        for (const position of positionsJson) {
            const currentTick = poolsTick[position.pool.id];
            if (((+position.tickLower.tickIdx) < currentTick) && (currentTick < (+position.tickUpper.tickIdx))) {
                let { amount0, amount1 } = utils.getAmounts(
                    (+position.liquidity),
                    (+position.tickLower.tickIdx),
                    (+position.tickUpper.tickIdx),
                    currentTick,
                );
                amount0 /= (10 ** (+position.token0.decimals));
                amount1 /= (10 ** (+position.token1.decimals));
                poolsCurrentTvl[position.pool.id] += amount0;
                poolsCurrentTvl[position.pool.id] += amount1 * (+position.pool.token0Price);
            }
        }
    }

    const poolsAPR = {};
    for (const pool of poolsJson) {
        if (poolsCurrentTvl[pool.id] !== 0) {
            poolsAPR[pool.id] = (((poolsFees[pool.id] * 365).toFixed(2) / (poolsCurrentTvl[pool.id])) * 100);
        } else {
            poolsAPR[pool.id] = 0;
        }
    }
    poolsAPR.updatedAt = (Date.now() / 1000).toFixed(0);
    poolsAPRObj = poolsAPR;
    return poolsAPRObj;
};

const updateFarmsRewardsApr = async () => {
    const pools = await OffchainService.getAllPools();
    const alms = await OffchainService.getAllPositionManagers();

    const farmingObj = {
        pools: {},
        updatedAt: 0,
    };

    for (const pool of pools) {
        try {
            if (pool.isPaused) {
                console.log('Ignoring Pool', pool.pool, 'its paused');
                continue; // ignoring paused pools.
            }
            const rewarder = new ethers.Contract(pool.rewarder, RewarderABI, OffchainService.getEtherProvider());
            const activeRewards = await rewarder.getActiveRewards();
            if (activeRewards.length <= 0) {
                continue;
            }
            let positions = await utils.getPositionsOfPool(pool.pool.toLowerCase());
            positions = positions.filter((p) => OffchainService.isActive(p));

            if (alms.length > 0) {
                for (const alm of alms) {
                    const rewarderRegistry = new ethers.Contract(REWARD_REGISTRY, RewarderRegistryABI, OffchainService.getEtherProvider());
                    const vault = await rewarderRegistry.getPoolPMVaultByAddress(pool.pool, alm.index);
                    if (vault.toLowerCase() !== ethers.constants.AddressZero.toLowerCase()) {
                        if (alm.almKEY === 'BEEFY') {
                            const beefyPositions = await OffchainService.getBeefyPosition(pool.pool, vault);
                            positions = [...positions, ...beefyPositions];
                        }
                    }
                }
            }
            let totalNativeAmount = 0.0;
            for (const position of positions) {
                const { amount0, amount1 } = utils.getAmounts(
                    (+position.liquidity),
                    (+position.tickLower.tickIdx),
                    (+position.tickUpper.tickIdx),
                    (+position.pool.tick),
                );

                totalNativeAmount += (amount0 * (+position.pool.token0.derivedMatic)) / 10 ** (+position.pool.token0.decimals);

                totalNativeAmount += (amount1 * (+position.pool.token1.derivedMatic)) / 10 ** (+position.pool.token1.decimals);
            }

            let totalNativeReward = new BigNumber('0');

            const tokenRewardsMap = {};
            for (const rewardToken of activeRewards) {
                const tokenInfo = (await OffchainService.getTokenInfoByAddress(rewardToken.token.toLowerCase()))[0];
                const tokenRPS = new BigNumber(rewardToken.rewardPerSec.toString());
                const tokenGLMRPrice = new BigNumber((tokenInfo.derivedMatic));
                const tokenDecimals = new BigNumber(10 ** (+tokenInfo.decimals));
                const glmrPerSecond = tokenRPS.times(tokenGLMRPrice).dividedBy(tokenDecimals);
                totalNativeReward = totalNativeReward.plus(glmrPerSecond);
                tokenRewardsMap[rewardToken.token.toLowerCase()] = {
                    ...tokenInfo,
                    tokenRPS: tokenRPS.toString(),
                    glmrPerSecond: glmrPerSecond.toString(),
                    apr: glmrPerSecond.dividedBy(new BigNumber(totalNativeAmount)).times(86400 * 365 * 100)
                };
            }

            let apr = 0;
            if (totalNativeAmount > 0) {
                apr = totalNativeReward.dividedBy(new BigNumber(totalNativeAmount)).times(86400 * 365 * 100);
            }

            farmingObj.pools[pool.pool.toLowerCase()] = {
                apr,
                totalNativeAmount,
                totalNativeReward,
                tokenRewards: tokenRewardsMap,
            };
        } catch (error) {
            console.log(error);
        }
    }

    farmingObj.updatedAt = (Date.now() / 1000).toFixed(0);
    farmingAPRObjGlobal = farmingObj;

    return farmingAPRObjGlobal;

};

module.exports = {
    updatePoolsApr,
    updateFarmsRewardsApr,
};
