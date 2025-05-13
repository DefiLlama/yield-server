const superagent = require('superagent');

const IPOR_GITHUB_ADDRESSES_URL = "https://raw.githubusercontent.com/IPOR-Labs/ipor-abi/refs/heads/main/mainnet/addresses.json";
const FUSION_API_URL = 'https://api.ipor.io/fusion/vaults';
const CHAIN_CONFIG = {
    ethereum: {
        chainId: 1
    },
    arbitrum: {
        chainId: 42161
    },
    base: {
        chainId: 8453
    }
};

async function getChainData(chain) {
    const allVaultsRes = await superagent.get(FUSION_API_URL);
    const chainVaults = allVaultsRes.body.vaults.filter(
        vault => vault.chainId === CHAIN_CONFIG[chain].chainId
    );

    return chainVaults;
}

async function getPublicVaults() {
    const response = await superagent.get(IPOR_GITHUB_ADDRESSES_URL);
    const publicVaults = JSON.parse(response.text);
    const chainVaults = new Map();

    Object.entries(publicVaults).forEach(([chainName, { vaults }]) => {
        const lowerCaseVaults = vaults.map(vault => vault.PlasmaVault.toLowerCase());
        chainVaults.set(chainName, lowerCaseVaults);
    });

    return chainVaults;
}

async function buildPool(vault) {
    const tvlUsd = Number(vault.tvl);
    const apyBase = Number(vault.apr);
    const chainConfig = Object.entries(CHAIN_CONFIG).find(
        ([_, config]) => config.chainId === vault.chainId
    );
    const chain = chainConfig[0];
    const chainData = chainConfig[1];
    const url = `https://app.ipor.io/fusion/${chain}/${vault.address.toLowerCase()}`;

    return {
        pool: vault.address,
        chain,
        project: 'ipor-fusion',
        symbol: `${vault.asset}`,
        tvlUsd,
        apyBase,
        apyReward: 0,
        rewardTokens: [],
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
            .filter(vault => !vault.name.toLowerCase().includes('pilot')) // filter out pilot vaults
            .filter(vault => publicVaults.get(chain).includes(vault.address.toLowerCase()))
            .map(vault => buildPool(vault))
        )
    );

    return pools;
};

module.exports = {
    timetravel: false,
    apy: apy
};
