const sdk = require('@defillama/sdk');
const {BigNumber, FixedFormat, FixedNumber} = require('@ethersproject/bignumber');
const utils = require('../utils');
const abi = require('./abi.json');
const voterProxy = '0xe96c48C5FddC0DC1Df5Cf21d68A3D8b3aba68046';
const masterWombat = '0x489833311676B566f888119c29bd997Dc6C95830';
const wombatBooster = '0x6FCA396A8a2b623b24A998A5808c0E144Aa0689a';
const quo = '0x08b450e4a48C04CDF6DB2bD4cf24057f7B9563fF';
const wom = '0xAD6742A35fB341A9Cc6ad674738Dd8da98b94Fb1';
const address0 = '0x' + '0'.repeat(40);
const chain = 'bsc';
const {main, side, i8n, qwom, wmx, bnbx, stk, bnb} = {
    main: 'MAIN POOL',
    side: 'SIDE POOL',
    i8n: 'INNOVATION POOL',
    qwom: 'qWOM POOL',
    wmx: 'wmxWOM POOL',
    bnbx: 'BNBx POOL',
    stk: 'stkBNB POOL',
    bnb: 'BNB POOL (Shut Down)'
};
const poolMetas = [
    main,
    main,
    bnb,
    bnb,
    bnb,
    bnb,
    main,
    main,
    side,
    side,
    wmx,
    wmx,
    i8n,
    i8n,
    i8n,
    bnbx,
    bnbx,
    qwom,
    qwom,
    stk,
    stk
];

Object.entries(abi).forEach(([contract, methods]) => {
    abi[`${contract}List`] = methods;
    abi[contract] = Object.fromEntries(methods.map(method => [method.name, method]));
});

const DefaultFixedFormat = FixedFormat.from({
    width: 256,
    decimals: 18,
    signed: true
});
BigNumber.fromDecimal = function(decimal, decimals = DefaultFixedFormat.decimals) {
    // replace comma added by prettify
    return BigNumber.from(FixedNumber.from(decimal.replace(/,/g, ''), {...DefaultFixedFormat, decimals})._hex);
};

// Returns a string "1" followed by decimal "0"s
function getMultiplier(decimals = 18) {
    return `1${decimals > 0 ? '0'.repeat(decimals) : ''}`;
}

BigNumber.prototype.toDecimal = function(option) {
    const {
        decimals = DefaultFixedFormat.decimals,
        precision,
        removeTrailingZero = true
    } = option ?? {};
    const fixedNumber = FixedNumber.fromValue(this, decimals, {...DefaultFixedFormat, decimals});
    const fixedStr = typeof precision === 'number' ? fixedNumber.round(precision).toString() : fixedNumber.toString();
    const [characteristic, originalMantissa = ''] = fixedStr.split('.');
    let mantissa = originalMantissa;
    const currentPrecision = mantissa.length;
    if (!removeTrailingZero && precision && currentPrecision < precision) {
        mantissa = mantissa.padEnd(precision, '0');
    }

    if (removeTrailingZero) {
        mantissa = mantissa.replace(/0+$/, '');
    }

    return mantissa ? characteristic + '.' + mantissa : characteristic;
};

BigNumber.prototype.changeDecimals = function(curDecimals, nextDecimals = 18) {
    const diff = nextDecimals - curDecimals;
    if (diff === 0) return this;

    const multiplier = getMultiplier(Math.abs(diff));

    return diff > 0 ? this.mul(multiplier) : this.div(multiplier);
};

async function apy() {
    const poolLength = await sdk.api.abi.call({
        abi: abi.wombatBooster.poolLength,
        target: wombatBooster,
        params: [],
        chain
    }).then(l => parseInt(l.output.toString()));

    const poolInfos = await sdk.api.abi.multiCall({
        abi: abi.wombatBooster.poolInfo,
        calls: Array.from(Array(poolLength).keys()).map((pid) => ({
            target: wombatBooster,
            params: [pid]
        })),
        chain,
    });

    const masterWombatPoolInfos = await sdk.api.abi.multiCall({
        abi: abi.masterWombat.poolInfoV3,
        calls: poolInfos.output.map((pool) => ({
            target: masterWombat,
            params: [pool.output.masterWombatPid]
        })),
        chain,
    });

    const voterProxyUserInfos = await sdk.api.abi.multiCall({
        abi: abi.masterWombat.userInfo,
        calls: poolInfos.output.map((pool) => ({
            target: masterWombat,
            params: [pool.output.masterWombatPid, voterProxy]
        })),
        chain,
    });

    const masterWombatBalances = await sdk.api.abi.multiCall({
        abi: 'erc20:balanceOf',
        calls: poolInfos.output.map((pool) => ({
            target: pool.output.lptoken,
            params: [masterWombat]
        })),
        chain,
    });

    const lpTokenTargets = poolInfos.output.map((pool) => ({
        target: pool.output.lptoken,
        params: []
    }));

    const lpSymbols = await sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        calls: lpTokenTargets,
        chain,
    });

    const lpPools = await sdk.api.abi.multiCall({
        abi: abi.lpToken.pool,
        calls: lpTokenTargets,
        chain,
    });

    const underlyingTokens = await sdk.api.abi.multiCall({
        abi: abi.lpToken.underlyingToken,
        calls: lpTokenTargets,
        chain,
    });

    const voterProxyUnderlyingAmounts = await sdk.api.abi.multiCall({
        abi: abi.pool.quotePotentialWithdraw,
        calls: lpPools.output.map((pool, index) => {
            return {
                target: pool.output,
                params: [
                    underlyingTokens.output[index].output,
                    voterProxyUserInfos.output[index].output.amount
                ],
            };
        }),
        chain,
    });

    const masterWombatUnderlyingAmounts = await sdk.api.abi.multiCall({
        abi: abi.pool.quotePotentialWithdraw,
        calls: lpPools.output.map((pool, index) => {
            return {
                target: pool.output,
                params: [
                    underlyingTokens.output[index].output,
                    masterWombatBalances.output[index].output
                ],
            };
        }),
        chain,
    });

    const quoCallParams = {
        target: quo,
        params: [],
        chain
    };
    const [
        quoFactor,
        quoFactorDenominator,
        quoMaxSupply,
        quoTotalSupply,

        masterWombatBasePartition,
        masterWombatBoostedPartition
    ] = await Promise.all([
        sdk.api.abi.call({
            abi: abi.quo.factor,
            ...quoCallParams
        }),
        sdk.api.abi.call({
            abi: abi.quo.FACTOR_DENOMINATOR,
            ...quoCallParams
        }),
        sdk.api.abi.call({
            abi: abi.quo.maxSupply,
            ...quoCallParams
        }),
        sdk.api.abi.call({
            abi: 'erc20:totalSupply',
            ...quoCallParams
        }),

        sdk.api.abi.call({
            ...quoCallParams,
            abi: abi.masterWombat.basePartition,
            target: masterWombat
        }),
        sdk.api.abi.call({
            ...quoCallParams,
            abi: abi.masterWombat.boostedPartition,
            target: masterWombat
        }),
    ]);

    const rewarderInfos = await Promise.all(masterWombatPoolInfos.output.map(async ({output: {rewarder}}) => {
        if (rewarder === address0) return null;

        const rewardLength = await sdk.api.abi.call({
            abi: abi.masterWombatRewarder.rewardLength,
            target: rewarder,
            params: [],
            chain
        });

        return sdk.api.abi.multiCall({
            abi: abi.masterWombatRewarder.rewardInfo,
            chain,
            calls: Array(+rewardLength.output).fill().map((empty, idx) => ({
                target: rewarder,
                params: [idx],
            }))
        });
    }));

    const {pricesByAddress, pricesBySymbol} = await utils.getPrices(Array.from(new Set([
        ...underlyingTokens.output.map(({output}) => output),
        ...rewarderInfos.flatMap(poolRewardInfos => !poolRewardInfos ? [] : poolRewardInfos.output.map(({rewardToken}) => rewardToken)),
        wom,
        quo
    ])), chain);
    // console.log(pricesBySymbol, pricesByAddress);

    const yearSeconds = 365 * 24 * 60 * 60;
    const multiplier18 = getMultiplier();
    const getTokenPrice = tokenAddress => BigNumber.fromDecimal(pricesByAddress[tokenAddress.toLowerCase()]?.toString() || '0');
    const calculateApr = ({
        rewardRate,
        rewardToken,
        tvlToken,
        tvlBalance
    }) => {
        const tvlTokenPrice = getTokenPrice(tvlToken);
        if (tvlTokenPrice.isZero()) return BigNumber.from(0);

        return BigNumber.from(rewardRate)
            .mul(yearSeconds)
            .mul(getTokenPrice(rewardToken))
            .div(BigNumber.from(tvlBalance))
            .mul(multiplier18)
            .div(tvlTokenPrice)
            .mul(100);
    };

    return voterProxyUnderlyingAmounts.output.flatMap((voterProxyUnderlyingAmount, i) => {
        const underlyingTokenAddress = underlyingTokens.output[i].output;
        if (voterProxyUserInfos.output[i].output.amount === '0' || !voterProxyUnderlyingAmount.output) return [];
        if (underlyingTokens.output[i].output.toLowerCase() === '0xE85aFCcDaFBE7F2B096f268e31ccE3da8dA2990A'.toLowerCase()) return []; // disable aBNBc (ankr bnb)

        let quollBalanceAmount = 0;
        let apr = BigNumber.from(0);
        const rewardTokens = new Set();
        if (voterProxyUnderlyingAmount.output) {
            // quoll tvl
            const quollBalance = voterProxyUnderlyingAmount.output.amount;
            quollBalanceAmount = +BigNumber.from(quollBalance).mul(getTokenPrice(underlyingTokenAddress)).div(multiplier18).toDecimal();

            const {rewardRate, sumOfFactors} = masterWombatPoolInfos.output[i].output;
            const basePartition = BigNumber.from(masterWombatBasePartition.output);
            const boostedPartition = BigNumber.from(masterWombatBoostedPartition.output);
            const totalPartition = basePartition.add(boostedPartition);
            // base and bonus wom rewardRate
            let baseWomRewardRate = BigNumber.from(rewardRate).mul(basePartition).div(totalPartition);

            // boosted wom rewardRate
            const {factor} = voterProxyUserInfos.output[i].output;
            const boostedWomRewardRate = BigNumber.from(rewardRate).mul(boostedPartition).div(totalPartition).mul(factor).div(sumOfFactors);

            // bonus rewardRates
            let poolRewardInfos = [];
            if (rewarderInfos[i]) {
                poolRewardInfos = rewarderInfos[i].output.flatMap(rewardInfo => {
                    const {output: {rewardToken, tokenPerSec}} = rewardInfo;
                    if (rewardToken.toLowerCase() === wom.toLowerCase()) {
                        baseWomRewardRate = baseWomRewardRate.add(tokenPerSec);

                        return [];
                    }

                    return rewardInfo;
                });
            }

            if (!BigNumber.from(rewardRate).isZero()) {
                rewardTokens.add(wom);
                rewardTokens.add(quo);
            }

            // quo rewardRate ref: https://docs.quoll.finance/understanding-quoll/token/tokenomics
            const cliffCount = BigNumber.from(1e3);
            const currentCliff = BigNumber.from(quoTotalSupply.output).mul(cliffCount).div(quoMaxSupply.output).add(quoTotalSupply.output !== quoMaxSupply.output ? 1 : 0); // add 1 for Math.ceil
            const quoRewardRateMultipler = BigNumber.from(multiplier18).mul(quoFactor.output).div(quoFactorDenominator.output).mul(cliffCount.sub(currentCliff)).div(cliffCount);
            const baseQuoRewardRate = baseWomRewardRate.mul(quoRewardRateMultipler).div(multiplier18);
            const boostedQuoRewardRate = boostedWomRewardRate.mul(quoRewardRateMultipler).div(multiplier18);

            const masterWombatUnderlyingAmount = masterWombatUnderlyingAmounts.output[i].output.amount;
            apr = apr
                .add(calculateApr({
                    rewardRate: baseWomRewardRate.mul(8).div(10),
                    rewardToken: wom,
                    tvlToken: underlyingTokenAddress,
                    tvlBalance: masterWombatUnderlyingAmount
                }))
                .add(calculateApr({
                    rewardRate: baseQuoRewardRate,
                    rewardToken: quo,
                    tvlToken: underlyingTokenAddress,
                    tvlBalance: masterWombatUnderlyingAmount
                }));


            poolRewardInfos.forEach(({output: {tokenPerSec, rewardToken}}) => {
                apr = apr.add(calculateApr({
                    rewardRate: tokenPerSec,
                    rewardToken,
                    tvlToken: underlyingTokenAddress,
                    tvlBalance: masterWombatUnderlyingAmount
                }))
                rewardTokens.add(rewardToken);
            });
        }


        return {
            pool: `${lpTokenTargets[i].target}-${chain}`.toLowerCase(),
            chain: utils.formatChain(chain),
            project: 'quoll',
            symbol: lpSymbols.output[i].output,
            tvlUsd: quollBalanceAmount,
            apy: +apr.toDecimal(),
            underlyingTokens: [underlyingTokenAddress],
            rewardTokens: Array.from(rewardTokens),
            poolMeta: poolMetas[i]
        };
    });
}

module.exports = {
    timetravel: false,
    apy,
    url: 'https://quoll.finance/deposit'
};
