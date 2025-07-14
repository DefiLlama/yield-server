const axios = require('axios');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');

const VAULTS = {
  Ethereum: {
    alias: 'eth',
    chain: 'ethereum',
    chainId: 1,
    addresses: [
      '0x984408C88a9B042BF3e2ddf921Cd1fAFB4b735D1',
      '0xDEB8a9C0546A01b7e5CeE8e44Fd0C8D8B96a1f6e',
      '0xdC4d99aB6c69943b4E17431357AbC5b54B4C2F56',
    ],
  },
  Arbitrum: {
    alias: 'arb',
    chain: 'arbitrum',
    chainId: 42161,
    addresses: [
      '0xc94b752839a22D2C44E99e298671dd4B2aDd11b3',
      '0x8c5161f287Cbc9Afa48bC8972eE8CC0a755fcAdC',
    ],
  },
  Binance: {
    alias: 'bnb',
    chain: 'bsc',
    chainId: 56,
    addresses: [
      '0x86c958CAc8aeE37dE62715691c0D597c710Eca51',
      '0x89653E6523fB73284353252b41AE580E6f96dFad',
    ],
  },
};

async function getMerklOpportunities() {
  const res = await axios.get(
    new URL('https://api.merkl.xyz/v4/opportunities?name=termmax')
  );
  return res.data.filter((o) => o.status === 'LIVE');
}

async function apy() {
  const opportunities = await getMerklOpportunities();

  const pools = [];
  const promises = [];
  for (const [chain, vaultData] of Object.entries(VAULTS)) {
    const task = async () => {
      const calls = vaultData.addresses.map((address) => ({
        target: address,
      }));
      const [apr, asset, decimals, names, totalAssets] = await Promise.all([
        sdk.api.abi.multiCall({
          calls,
          abi: {
            name: 'apr',
            type: 'function',
            inputs: [],
            outputs: [{ type: 'uint256' }],
          },
          chain: vaultData.chain,
        }),
        sdk.api.abi.multiCall({
          calls,
          abi: {
            name: 'asset',
            type: 'function',
            inputs: [],
            outputs: [{ type: 'address' }],
          },
          chain: vaultData.chain,
        }),
        sdk.api.abi.multiCall({
          calls,
          abi: {
            name: 'decimals',
            type: 'function',
            inputs: [],
            outputs: [{ type: 'uint8' }],
          },
          chain: vaultData.chain,
        }),
        sdk.api.abi.multiCall({
          calls,
          abi: {
            name: 'name',
            type: 'function',
            inputs: [],
            outputs: [{ type: 'string' }],
          },
          chain: vaultData.chain,
        }),
        sdk.api.abi.multiCall({
          calls,
          abi: {
            name: 'totalAssets',
            type: 'function',
            inputs: [],
            outputs: [{ type: 'uint256' }],
          },
          chain: vaultData.chain,
        }),
      ]);
      const assetNames = await sdk.api.abi.multiCall({
        calls: asset.output.map((o) => ({ target: o.output })),
        abi: {
          name: 'symbol',
          type: 'function',
          inputs: [],
          outputs: [{ type: 'string' }],
        },
        chain: vaultData.chain,
      });

      const assetAddresses = new Set(asset.output.map((o) => o.output));
      const priceMap = new Map();
      {
        const promises = [];
        for (const assetAddress of assetAddresses) {
          const url = new URL(
            `https://coins.llama.fi/prices/current/${vaultData.chain}:${assetAddress}`
          );
          promises.push(
            axios.get(url).then((response) => {
              const priceKey = `${vaultData.chain}:${assetAddress}`;
              priceMap.set(
                assetAddress,
                response.data.coins[priceKey]?.price || 0
              );
            })
          );
        }
        await Promise.all(promises);
      }

      for (let i = 0; i < vaultData.addresses.length; i++) {
        const address = vaultData.addresses[i];
        const assetAddress = asset.output[i].output;

        const readableApr = new BigNumber(apr.output[i].output)
          .div(new BigNumber(10).pow(6)) // actual decimals for APR is 8
          .toNumber();
        const tvlUsd = new BigNumber(totalAssets.output[i].output)
          .div(new BigNumber(10).pow(decimals.output[i].output))
          .times(priceMap.get(assetAddress) || 0)
          .toNumber();

        const url = new URL(
          `https://app.termmax.ts.finance/earn/${address.toLowerCase()}`
        );
        url.searchParams.set('chain', vaultData.alias);

        const pool = {
          pool: `${address}-${chain.toLowerCase()}`,
          chain,
          project: 'termmax',
          symbol: assetNames.output[i].output,
          tvlUsd,
          apyBase: readableApr,
          url: String(url),
          underlyingTokens: [assetAddress],
          poolMeta: names.output[i].output,
        };

        const opportunity = opportunities.find(
          (o) =>
            o.chainId === vaultData.chainId &&
            o.identifier.toLowerCase() === address.toLowerCase()
        );
        if (opportunity) {
          pool.apyReward = opportunity.apr;

          const breakdowns =
            (opportunity.rewardsRecord &&
              opportunity.rewardsRecord.breakdowns) ||
            [];
          pool.rewardTokens = breakdowns
            .map((b) => b.token.address)
            .filter((a) => a);
        }

        pools.push(pool);
      }
    };
    promises.push(task());
  }
  await Promise.all(promises);
  return pools;
}

module.exports = {
  apy,
};
