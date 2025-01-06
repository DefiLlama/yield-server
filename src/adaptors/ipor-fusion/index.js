const superagent = require('superagent');

const FUSION_API_URL = 'https://api.ipor.io/fusion/vaults';
const CHAIN_CONFIG = {
    ethereum: {
        chainId: 1,
        iporToken: '0x1e4746dc744503b53b4a082cb3607b169a289090'
    },
    arbitrum: {
        chainId: 42161,
        iporToken: '0x34229b3f16fbcdfa8d8d9d17c0852f9496f4c7bb'
    },
    base: {
        chainId: 8453,
        iporToken: '0xbd4e5C2f8dE5065993d29A9794E2B7cEfc41437A'
    }
};

async function getChainData(chain) {
    const allVaultsRes = await superagent.get(FUSION_API_URL);
    const chainVaults = allVaultsRes.body.vaults.filter(
        vault => vault.chainId === CHAIN_CONFIG[chain].chainId
    );

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
    const chainsData = await Promise.all(
        Object.entries(CHAIN_CONFIG).map(async([chain, config]) => ({
            chain,
            config,
            data: await getChainData(chain)
        }))
    );

    const pools = await Promise.all(
        chainsData.flatMap(({ data }) =>
            data
            .filter(vault => !vault.name.toLowerCase().includes('pilot')) // filter out pilot vaults
            .map(vault => buildPool(vault))
        )
    );

    return pools;
};

module.exports = {
    timetravel: false,
    apy: apy
};