const vaults = require('./vaults');
const { getTvl, getApr } = require('./shared');
const { BoostRewardVaultHelper, ScaleRewardVaultHelper } = require('./rewards');

async function getSingleYieldVaultAPY() {
    const stakedPoolAddresses = vaults
        .map((vault) => vault.stakedPoolAddress)
        .filter((pool) => pool);
    const scaleHelper = new ScaleRewardVaultHelper(
        '0xAC0f45D2305a165ced8E73e4eE4542A108d43e54',
        '0x6dd963c510c2d2f09d5eddb48ede45fed063eb36',
        stakedPoolAddresses
    );
    const boostHelper = new BoostRewardVaultHelper(
        '0x5E9a35b1AC21B314149E44f3959F3B6fB3db5924',
        stakedPoolAddresses
    );

    await Promise.all([scaleHelper.initialize(), boostHelper.initialize()]);

    const poolData = await Promise.all(
        vaults.map(async (vault) => {
            const project = 'factor-v2';
            const chain = 'arbitrum';
            const pool = `${vault.poolAddress}-${chain}`.toLowerCase();
            const url = `https://app.factor.fi/vault/${vault.poolAddress}`;
            const symbol = vault.symbol;

            const [tvlUsd, apyBase] = await Promise.all([
                getTvl(
                    vault.poolAddress,
                    vault.underlyingToken,
                    vault.strategy
                ),
                getApr(
                    vault.poolAddress,
                    vault.underlyingToken,
                    vault.strategy
                ),
            ]);

            if (!vault.stakedPoolAddress) {
                const data = {
                    pool,
                    chain,
                    project,
                    symbol,
                    tvlUsd,
                    apyBase,
                    apyReward: 0,
                    rewardTokens: [],
                    underlyingTokens: [vault.underlyingToken],
                    url,
                };

                return data;
            }

            const { apyReward: apyBoost, rewardTokens: boostRewardTokens } =
                boostHelper.getApyReward(vault.stakedPoolAddress, tvlUsd);
            const { apyReward: apyVote, rewardTokens: scaleRewardTokens } =
                scaleHelper.getApyReward(vault.stakedPoolAddress, tvlUsd);

            const apyReward = apyBoost + apyVote;
            const rewardTokens = [
                ...new Set([...scaleRewardTokens, ...boostRewardTokens]),
            ];

            const data = {
                pool,
                chain,
                project,
                symbol,
                tvlUsd,
                apyBase,
                apyReward,
                rewardTokens,
                underlyingTokens: [vault.underlyingToken],
                url,
            };

            return data;
        })
    );

    return poolData;
}

module.exports = {
    timetravel: false,
    apy: getSingleYieldVaultAPY,
};
