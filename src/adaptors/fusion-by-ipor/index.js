const axios = require('axios');
const sdk = require('@defillama/sdk');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ONE_ETHER = 10n ** 18n;
const SECONDS_IN_YEAR = 31556952n;

const GET_REWARDS_CLAIM_MANAGER_ADDRESS_ABI =
    'function getRewardsClaimManagerAddress() view returns (address)';
const TOTAL_ASSETS_ABI = 'function totalAssets() view returns (uint256)';
const GET_VESTING_DATA_ABI = {
    type: 'function',
    name: 'getVestingData',
    inputs: [],
    stateMutability: 'view',
    outputs: [{
        type: 'tuple',
        components: [
            { name: 'vestingTime', type: 'uint32' },
            { name: 'updateBalanceTimestamp', type: 'uint32' },
            { name: 'transferredTokens', type: 'uint128' },
            { name: 'lastUpdateBalance', type: 'uint128' },
        ],
    }],
};

async function getVestingRewardsApy(vaultAddress, chain) {
    try {
        const rcm = (await sdk.api.abi.call({
            target: vaultAddress,
            chain,
            abi: GET_REWARDS_CLAIM_MANAGER_ADDRESS_ABI,
        })).output;

        if (!rcm || rcm.toLowerCase() === ZERO_ADDRESS) return 0;

        const [vestingDataRes, totalAssetsRes] = await Promise.all([
            sdk.api.abi.call({ target: rcm, chain, abi: GET_VESTING_DATA_ABI }),
            sdk.api.abi.call({ target: vaultAddress, chain, abi: TOTAL_ASSETS_ABI }),
        ]);

        const vestingTime = BigInt(vestingDataRes.output.vestingTime);
        const lastUpdateBalance = BigInt(vestingDataRes.output.lastUpdateBalance);
        const totalAssets = BigInt(totalAssetsRes.output);

        if (vestingTime === 0n || lastUpdateBalance === 0n || totalAssets === 0n) {
            return 0;
        }

        const apy_18 =
            (lastUpdateBalance * ONE_ETHER * SECONDS_IN_YEAR * 100n) /
            (totalAssets * vestingTime);

        return Number(apy_18) / 1e18;
    } catch (e) {
        return 0;
    }
}

const IPOR_GITHUB_ADDRESSES_URL = "https://raw.githubusercontent.com/IPOR-Labs/ipor-abi/refs/heads/main/mainnet/addresses.json";
const FUSION_API_URL = 'https://api.ipor.io/fusion/vaults';

const VESTING_APY_VAULTS = {
    ethereum: ["0xb9e806e8f2d94c015ffefa90cd24ecce18f1663c"],
    arbitrum: [],
    base: ["0x5900c3b72458f12967dc1bef35b92d271f5cdbc1", "0x17d0f109ee895bad0b68aa104aa72bd0b003ad8e", "0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8"],
    unichain: [],
    tac: [],
    ink: [],
    plasma: [],
    avax: [],
    katana: [],
};
const CHAIN_CONFIG = {
    ethereum: {
        chainId: 1
    },
    arbitrum: {
        chainId: 42161
    },
    base: {
        chainId: 8453
    },
    unichain: {
        chainId: 130
    },
    tac: {
        chainId: 239
    },
    ink: {
        chainId: 57073
    },
    plasma: {
        chainId: 9745
    },
    avax: {
        chainId: 43114
    },
    katana: {
        chainId: 747474
    }
};

async function getChainData(chain) {
    const allVaultsRes = await axios.get(FUSION_API_URL);
    const chainVaults = allVaultsRes.data.vaults.filter(
        vault => vault.chainId === CHAIN_CONFIG[chain].chainId
    );

    return chainVaults;
}

async function getPublicVaults() {
    const response = await axios.get(IPOR_GITHUB_ADDRESSES_URL);
    const publicVaults = typeof response.data === 'string'
        ? JSON.parse(response.data)
        : response.data;
    const chainVaults = new Map();

    Object.entries(publicVaults).forEach(([chainName, { vaults }]) => {
        const lowerCaseVaults = (vaults || []).map(vault => vault.PlasmaVault.toLowerCase());
        chainVaults.set(chainName, lowerCaseVaults);
    });

    return chainVaults;
}

async function buildPool(vault) {
    const tvlUsd = Number(vault.tvl);
    const apyBase = Number(vault.apy);
    const chainConfig = Object.entries(CHAIN_CONFIG).find(
        ([_, config]) => config.chainId === vault.chainId
    );

    const chain = chainConfig[0];
    const iporChainName = chain === "avax" ? 'avalanche' : chain;
    const chainData = chainConfig[1];
    const url = `https://app.ipor.io/fusion/${iporChainName}/${vault.address.toLowerCase()}`;

    return {
        pool: vault.address,
        chain,
        project: 'fusion-by-ipor',
        symbol: `${vault.asset}`,
        tvlUsd,
        apyBase,
        apyReward : 0,
        underlyingTokens: [vault.assetAddress],
        poolMeta: `${vault.name}`,
        url
    };
}

const apy = async() => {
    const publicVaults = await getPublicVaults();
    const chainsData = await Promise.all(
        Object.entries(CHAIN_CONFIG).map(async([chain, config]) => ({
            chain,
            config,
            data: await getChainData(chain)
        }))
    );

    const pools = await Promise.all(
        chainsData.flatMap(({ chain, data }) =>
            data
            .filter(vault => publicVaults.get(chain)?.includes(vault.address.toLowerCase()))
            .map(vault => buildPool(vault))
        )
    );

    const poolsWithMerkl = await addMerklRewardApy(pools, 'ipor');

    return Promise.all(poolsWithMerkl.map(async (pool) => {
        const allowedVaults = VESTING_APY_VAULTS[pool.chain] || [];
        if (!allowedVaults.includes(pool.pool.toLowerCase())) return pool;

        const vestingApy = await getVestingRewardsApy(pool.pool, pool.chain);
        if (vestingApy <= 0) return pool;
        const rewardTokens = [
            ...new Set([...(pool.rewardTokens || []), ...pool.underlyingTokens]),
        ];
        return {
            ...pool,
            apyReward: (pool.apyReward || 0) + vestingApy,
            rewardTokens,
        };
    }));
};

module.exports = {
    timetravel: false,
    apy: apy
};
