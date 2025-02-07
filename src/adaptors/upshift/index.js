const lendingPoolABI = require('./lending-pool.json');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');
const axios = require('axios');


const config = {
    ethereum: ["0xB7858b66dFA38b9Cb74d00421316116A7851c273", "0x80E1048eDE66ec4c364b4F22C8768fc657FF6A42", "0x18a5a3D575F34e5eBa92ac99B0976dBe26f9F869", "0xEBac5e50003d4B17Be422ff9775043cD61002f7f", "0xd684AF965b1c17D628ee0d77cae94259c41260F4", "0x5Fde59415625401278c4d41C6beFCe3790eb357f"],
    avax: ["0x3408b22d8895753C9A3e14e4222E981d4E9A599E"],
    base: ["0x4e2D90f0307A93b54ACA31dc606F93FE6b9132d2"]
}
const rewardConfig = {
    "0x3408b22d8895753C9A3e14e4222E981d4E9A599E": "0xAeAc5f82B140c0f7309f7E9Ec43019062A5e5BE2",
}

const chainMapping = {
    ethereum: {
        chain: 'ethereum',
        chainId: '1',
        nativeToken: ethers.constants.AddressZero,
        decimals: 18,
        symbol: 'ETH',
    },
    avax: {
        chain: 'avax',
        chainId: '43114',
        nativeToken: ethers.constants.AddressZero,
        decimals: 18,
        symbol: 'AVAX',
    },
    base: {
        chain: 'base',
        chainId: '8453',
        nativeToken: ethers.constants.AddressZero,
        decimals: 18,
        symbol: 'ETH',
    }
}

const APR_MULTIPLIER = 31536000;
const projectName = 'upshift';

const getApy = async () => {
    const poolInfos = [];

    const ethereumPools = await Promise.all(
        config.ethereum.map(async (pool) => {
            return await getPoolInfo(pool, 'ethereum');
        }),
    );

    poolInfos.push(...ethereumPools);

    const avaxPools = await Promise.all(
        config.avax.map(async (pool) => {
            return await getPoolInfo(pool, 'avax');
        }),
    );

    poolInfos.push(...avaxPools);

    const basePools = await Promise.all(
        config.base.map(async (pool) => {
            return await getPoolInfo(pool, 'base');
        }),
    );

    poolInfos.push(...basePools);

    return poolInfos;
}

const getPoolActiveLoans = async (pool, chain) => {
    let loans = [];

    let loanCount = (await sdk.api.abi.call({
        target: pool,
        abi: lendingPoolABI.find(abi => abi.name === 'getTotalLoansDeployed'),
        chain: chain,
    }))?.output;

    const indexArray = [
        ...Array(Number(loanCount)).keys(),
    ];

    loans = await Promise.all(
        indexArray.map(async (i) => {
            const loansDeployed = (await sdk.api.abi.call({
                target: pool,
                params: i,
                abi: lendingPoolABI.find(abi => abi.name === 'loansDeployed'),
                chain: chain,
            }))?.output;
            return loansDeployed;
        }),
    );


    const states = await Promise.all(
        loans.map(async (loan) => {
            const state = (await sdk.api.abi.call({
                target: loan,
                abi: 'function loanState() view returns (uint8)',
                chain: chain,
            }))?.output;
            return state;
        }),
    );

    // filter loan if state is 4 (active)
    const activeLoans = loans.filter((loan, i) => states[i] === '4');
    return activeLoans;
};

const getPoolInfo = async (pool, chain) => {

    const symbol = (await sdk.api.abi.call({
        target: pool,
        abi: lendingPoolABI.find(abi => abi.name === 'symbol'),
        chain: chain,
    }))?.output;

    const underlying_token = (await sdk.api.abi.call({
        target: pool,
        abi: lendingPoolABI.find(abi => abi.name === 'asset'),
        chain: chain,
    }))?.output;

    const totalSupply = (await sdk.api.abi.call({
        target: pool,
        abi: lendingPoolABI.find(abi => abi.name === 'totalSupply'),
        chain: chain,
    }))?.output;

    const totalAsset = (await sdk.api.abi.call({
        target: pool,
        abi: lendingPoolABI.find(abi => abi.name === 'totalAssets'),
        chain: chain,
    }))?.output;

    const pool_decimals = (await sdk.api.abi.call({
        target: pool,
        abi: 'erc20:decimals',
        chain: chain,
    }))?.output;

    const underlyingDecimals = (await sdk.api.abi.call({
        target: underlying_token,
        abi: 'erc20:decimals',
        chain: chain,
    }))?.output;


    const priceKey = `${utils.formatChain(chain)}:${underlying_token}`;
    const underlyingPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;

    const tvlUsd = Number(ethers.utils.formatUnits(totalAsset, underlyingDecimals)) * underlyingPrice;

    let aggregateApr = BigInt(0);

    const loans = await getPoolActiveLoans(pool, chain);

    const newLoans = (
        await Promise.all(
            loans?.map(async (loanAddress) => {
                const [_loanApr, _principalAmt, _collateral, _principalRepaid] =
                    await Promise.all([
                        sdk.api.abi.call({
                            target: loanAddress,
                            abi: 'function currentApr() view returns (uint256)',
                            chain
                        }),
                        sdk.api.abi.call({
                            target: loanAddress,
                            abi: 'function principalAmount() view returns (uint256)',
                            chain
                        }),
                        sdk.api.abi.call({
                            target: loanAddress,
                            abi: 'function collateralToken() view returns (address)',
                            chain
                        }),
                        sdk.api.abi.call({
                            target: loanAddress,
                            abi: 'function principalRepaid() view returns (uint256)',
                            chain
                        }),
                        sdk.api.abi.call({
                            target: loanAddress,
                            abi: 'function principalToken() view returns (address)',
                            chain
                        }),
                    ]);

                let _principalDecimals = 18;
                if (_collateral.output !== ethers.constants.AddressZero) {
                    const collateralDecimals = await sdk.api.abi.call({
                        target: _collateral.output,
                        abi: 'function decimals() view returns (uint8)',
                        chain
                    });
                    _principalDecimals = collateralDecimals.output;
                }
                // handle aprs
                aggregateApr += _loanApr.output || BigInt(0);


                const loanApr = Number(_loanApr.output || 0) / 100;

                const allocation =
                    Number(ethers.utils.formatUnits(_principalAmt.output, _principalDecimals)) /
                    Number(ethers.utils.formatUnits(totalSupply, _principalDecimals));

                const newLoanObj = {
                    address: loanAddress,
                    apr: loanApr,
                    allocation,
                };

                return newLoanObj;
            }),
        )
    ).filter((l) => l !== undefined);

    const weightedAverage = newLoans.reduce(
        (acc, { apr, allocation }) => acc + apr * allocation,
        0,
    );

    if (rewardConfig[pool]) {
        const rewardDistributor = rewardConfig[pool];

        const rewardToken = [chainMapping[chain].nativeToken];

        const totalStaked = await sdk.api.abi.call({
            target: rewardDistributor,
            abi: 'function totalStaked() view returns (uint256)',
            chain
        });
        const rewardsPerSecond = await sdk.api.abi.call({
            target: rewardDistributor,
            abi: 'function rewardsPerSecond() view returns (uint256)',
            chain
        });

        const priceKey = `${utils.formatChain(chain)}:${rewardToken[0]}`;
        const rewardTokenPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;

        const rewardAPR =
            ((Number(ethers.utils.formatUnits(rewardsPerSecond.output, chainMapping[chain].decimals)) *
                APR_MULTIPLIER *
                rewardTokenPrice) /
                (ethers.utils.formatUnits(totalStaked.output, pool_decimals) * Number(1))) *
            100;

        return {
            pool: `${pool}-${utils.formatChain(chain)}`,
            chain: utils.formatChain(chain),
            project: projectName,
            symbol: symbol,
            tvlUsd: tvlUsd,
            apyBase: weightedAverage,
            apyReward: rewardAPR,
            rewardTokens: rewardToken,
            underlyingTokens: [underlying_token],
        }
    }

    return {
        pool: `${pool}-${utils.formatChain(chain)}`,
        chain: utils.formatChain(chain),
        project: projectName,
        symbol: symbol,
        tvlUsd: tvlUsd,
        apyBase: weightedAverage,
        underlyingTokens: [underlying_token],
    }
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://www.upshift.finance/'
};