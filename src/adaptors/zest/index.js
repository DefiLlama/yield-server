const { callReadOnlyFunction, contractPrincipalCV } = require("@stacks/transactions");
const { StacksMainnet } = require("@stacks/network");

const AssetConfig = {
    stSTX: {
        assetAddress: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG',
        contractName: 'ststx-token',
        oracleContractName: 'ststx-oracle-v1-4',
        decimals: 6,
    },
    aeUSDC: {
        assetAddress: 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K',
        contractName: 'token-aeusdc',
        oracleContractName: 'aeusdc-oracle-v1-0',
        decimals: 6,
    },
    STX: {
        assetAddress: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N',
        contractName: 'wstx',
        oracleContractName: 'stx-oracle-v1-3',
        decimals: 6,
    },
    DIKO: {
        assetAddress: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR',
        contractName: 'arkadiko-token',
        oracleContractName: 'diko-oracle-v1-1',
        decimals: 6,
    },
}

async function getAddressBalances() {
    try {
        const response = await fetch(
            "https://api.hiro.so/extended/v1/address/SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-vault/balances",
            {
                method: "GET",
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Process the balances
        const processedBalances = {
            STX: Number(data.stx.balance) / Math.pow(10, 6) // STX has 6 decimals
        };

        // Process fungible tokens
        Object.entries(data.fungible_tokens).forEach(([fullTokenId, tokenData]) => {
            const [addressAndContract] = fullTokenId.split('::');
            const [address, contractName] = addressAndContract.split('.');

            const matchingAsset = Object.entries(AssetConfig).find(([_, config]) => 
                config.assetAddress === address && config.contractName === contractName
            );

            if (matchingAsset) {
                const [assetKey, config] = matchingAsset;
                processedBalances[assetKey] = Number(tokenData.balance) / Math.pow(10, config.decimals);
            }
        });

        return processedBalances;
    } catch (error) {
        console.error('Error fetching address balances:', error);
    }
}

async function getZestPools() {
  try {
    const contractAddress = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N';
    const network = new StacksMainnet();

    const chain = 'Stacks';

    const pools = [];

    const balances = await getAddressBalances();
    // Reserve data
    for (const [assetKey, asset] of Object.entries(AssetConfig)) {
        const {assetAddress, contractName, oracleContractName} = asset;

        let supplyApy = 0.0;
        let tvlUsd = 0.0;
        let price = 0.0;

        // Fetch yields
        try {
            const reserveData = await callReadOnlyFunction({
                contractAddress,
                contractName: 'pool-read-v1-3-2',
                functionName: 'get-reserve-data',
                network,
                functionArgs: [
                    contractPrincipalCV(assetAddress, contractName),
                ],
                senderAddress: contractAddress,
            });

            if (reserveData.data) {
                supplyApy = Number(reserveData.data['current-liquidity-rate'].value) / 1000000;
                borrowApy = Number(reserveData.data['current-variable-borrow-rate'].value) / 1000000;
                ltv = Number(reserveData.data['base-ltv-as-collateral'].value) / 100000000;
            }

        } catch (error) {
            console.log(`Error fetching yields: ${error}`);
        }

        try {
            const result = await callReadOnlyFunction({
                contractAddress,
                contractName: oracleContractName,
                functionName: 'get-price',
                network,
                functionArgs: [],
                senderAddress: contractAddress,
            });

            // Get price and calculate TVL using the balance
            price = Number(result.value) / 100000000;
            const assetBalance = balances[assetKey] || 0;
            tvlUsd = price * assetBalance;
            
        } catch (error) {
            console.log(`Error fetching TVL: ${error}`);
        }

        pools.push({
            pool: `${assetAddress}.${contractName}-${chain}`.toLowerCase(),
            chain: chain,
            project: 'zest',
            symbol: assetKey,
            tvlUsd: tvlUsd,
            apyBase: supplyApy,
            underlyingTokens: [`${assetAddress}.${contractName}`],
        });
    }
  return pools;
  } catch (e) {
    if (e instanceof Error) {
        if (!e.message.includes('UnwrapFailure')) {
            console.log(e);
        }
    }
    return [];
  }

}

module.exports = {
  timetravel: false,
  apy: getZestPools,
  url: 'https://app.zestprotocol.com/assets',
};