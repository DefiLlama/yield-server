const sdk = require('@defillama/sdk');

const utils = require('../utils');
const abi = require('./abi.json');

const getApiUrl = (chain) =>
`https://app.dforce.network/general/markets?network=${chain}`;

const NETWORKS = {
  ethereum: {
    name: 'mainnet',
    controller: '0x8B53Ab2c0Df3230EA327017C91Eb909f815Ad113',
  },
  binance: {
    name: 'bsc',
    controller: '0x0b53E608bD058Bb54748C35148484fD627E6dc0A',
  },
  polygon: {
    name: 'Polygon',
    controller: '0x52eaCd19E38D501D006D2023C813d7E37F025f37',
  },
  arbitrum: {
    name: 'ArbitrumOne',
    controller: '0x8E7e9eA9023B81457Ae7E6D2a51b003D421E5408',
  },
  optimism: {
    name: 'Optimism',
    controller: '0xA300A84D8970718Dac32f54F61Bd568142d8BCF4',
  },
};

const getStakingApiUrl = (chain) =>
  `https://app.dforce.network/staking/getRoi?network=${chain}`;

const VAULT_CONTRACTS = {
  ethereum: {
    vaultPools: [
      {
        symbol: "USX-3CRV",
        address: "0xd8d07A8ab4F6a1cC4cF86b3cB11b78A7C1e701ad",
        underlyingTokens: [
          "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490", // 3CRV
          "0x0a5E677a6A24b2F1A2Bf4F3bFfC443231d2fDEc8", // USX
        ],
        vMUSX: "0x53BF3c82f62B152800E0152DB743451849F1aFF9",
        rewardTokens: ["0x431ad2ff6a9C365805eBaD47Ee021148d6f7DBe0"],
      },
    ],
    vaultData: "0x4779f4b09C74b9Ed31aBe60E1cfC3B1b4832F128",
  },
  arbitrum: {
    vaultPools: [
      {
        symbol: "USX-2CRV",
        address: "0x3EA2c9daa2aB26dbc0852ea653f99110c335f10a",
        underlyingTokens: [
          "0xbF7E49483881C76487b0989CD7d9A8239B20CA41", // 2CRV
          "0x641441c631e2F909700d2f41FD87F0aA6A6b4EDb", // USX
        ],
        vMUSX: "0x8A49dbE58CE2D047D3453a3ee4f0F245b7195f67",
        rewardTokens: ["0xaE6aab43C4f3E0cea4Ab83752C278f8dEbabA689"],
      },
    ],
    vaultData: "0x3Fc9F017fbF4251f006163B7CAd6601fC1A8Aa71",
  },
}

const STAKING_CONTRACTS = {
  binance: {
    name: 'bsc',
    stakingPools: [
      {
        symbol: "USX-BUSD",
        address: "0x8d61b71958dD9Df6eAA670c0476CcE7e25e98707",
        underlyingTokens: [
          "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD
          "0xB5102CeE1528Ce2C760893034A4603663495fD72", // USX
        ],
      },
    ],
  },
  arbitrum: {
    name: 'ArbitrumOne',
    stakingPools: [
      {
        symbol: "USX-USDC",
        address: "0x2Ca5B28B9F348f652b46210C75F528ee094b15cf",
        underlyingTokens: [
          "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC
          "0x641441c631e2F909700d2f41FD87F0aA6A6b4EDb", // USX
        ],
      },
    ],
  }
}

const getStakingApy = async () => {
  const stakingDetails = await Promise.all(
    Object.keys(STAKING_CONTRACTS).map(async (network) => {
      return {
        network,
        apyData: await utils.getData(getStakingApiUrl(STAKING_CONTRACTS[network].name)),
        poolData: STAKING_CONTRACTS[network]
      };
    })
  );

  let stakingData = [];
    stakingDetails.map(
      async ({ network, apyData, poolData }) => {
        poolData.stakingPools.map(stakingPool => {
          let underlying0, underlying1;
          apyData.map(async (apy) => {
            if (apy.asset == stakingPool.address) {
              let allRewardTokens = [];
              apy.APY.map(
                element => {
                  Object.keys(element).map(rewardToken => {
                    allRewardTokens.push(rewardToken);
                  })
                })
              stakingData.push({
                pool: `${stakingPool.address}-${network}`,
                chain: utils.formatChain(network),
                project: 'dforce',
                symbol: stakingPool.symbol,
                tvlUsd: Number(apy.totalStaking) / 1e18,
                // 1e16 = apy / 1e18 * 100%
                apyReward: Number(apy.totalApy) / 1e16,
                underlyingTokens: stakingPool.underlyingTokens,
                rewardTokens: allRewardTokens,
                url: `https://app.dforce.network/#/Liquidity?AssetsType=Lend&currentPool=general`,
              })
            }
          })
        })
      })

  return stakingData.flat();
}

const getVaultApy = async () => {
  const vaultDetails = await Promise.all(
    Object.keys(VAULT_CONTRACTS).map(async (network) => {
      return {
        network,
        poolData: VAULT_CONTRACTS[network]
      };
    })
  );

  const vaultData = await Promise.all(vaultDetails.map(
    async ({ network, poolData }) => {
      return await Promise.all(
        poolData.vaultPools.map(async (vaultPool) => {
          let apyResult = await (
            await sdk.api.abi.call({
              target: poolData.vaultData,
              chain: network,
              abi: abi.find(({ name }) => name === "getDistributionSupplyApy"),
              params: [vaultPool.address]
            })
          ).output

          let poolInfoResult = await (
            await sdk.api.abi.call({
              target: poolData.vaultData,
              chain: network,
              abi: abi.find(({ name }) => name === "getPoolInfo"),
              params: [vaultPool.vMUSX]
            })
          ).output

          let rawTvlUsd = Number(poolInfoResult._supplyValue) - Number(poolInfoResult._borrowValue);

          return {
            pool: `${vaultPool.address}-${network}`,
            chain: utils.formatChain(network),
            project: 'dforce',
            symbol: vaultPool.symbol,
            tvlUsd: Number(rawTvlUsd) / 1e18,
            // 1e16 = apy / 1e18 * 100%
            apyReward: Number(apyResult) / 1e16,
            underlyingTokens: vaultPool.underlyingTokens,
            rewardTokens: vaultPool.rewardTokens,
            url: `https://app.dforce.network/#/Liquidity?AssetsType=Lend&currentPool=general`,
          }
        })
      )
    }
  ));

  return vaultData.flat();
}

const getLendingApy = async () => {
  const markets = await Promise.all(
    Object.keys(NETWORKS).map(async (network) => {
      return {
        network,
        data: await utils.getData(getApiUrl(NETWORKS[network].name)),
      };
    })
  );

  const pools = await Promise.all(
    markets.map(
      async ({ network, data: { supplyMarkets, underlyingToken } }) => {
        // get iTokens
        const iTokens = (
          await sdk.api.abi.call({
            chain: network === 'binance' ? 'bsc' : network,
            target: NETWORKS[network].controller,
            abi: abi.find((n) => n.name === 'getAlliTokens'),
          })
        ).output;

        // get LTV per iToken
        const markets = (
          await sdk.api.abi.multiCall({
            chain: network === 'binance' ? 'bsc' : network,
            abi: abi.find((n) => n.name === 'markets'),
            calls: iTokens.map((t) => ({
              target: NETWORKS[network].controller,
              params: [t],
            })),
          })
        ).output.map((o) => o.output);

        const ltvs = markets.map((m, i) => ({
          iToken: iTokens[i],
          ltv: m.collateralFactorMantissa,
        }));

        return supplyMarkets.map((market) => ({
          pool: `${market.address}-${network}`,
          chain: utils.formatChain(network),
          project: 'dforce',
          symbol: market.underlying_symbol,
          tvlUsd:
            (Number(market.supplyValue) - Number(market.borrowValue)) / 1e18,
          // 1e16 = apy / 1e18 * 100%
          apyBase: Number(market.supplyAPY) / 1e16,
          apyReward: Number(market.rewardSupplyApy) / 1e16,
          rewardTokens: ['0x431ad2ff6a9c365805ebad47ee021148d6f7dbe0'],
          underlyingTokens: [
            underlyingToken.find((x) => x.symbol === market.underlying_symbol)
              .underlying,
          ],
          // borrow fields
          apyBaseBorrow: Number(market.borrowAPY) / 1e16,
          apyRewardBorrow: Number(market.rewardBorrowApy) / 1e16,
          totalSupplyUsd: Number(market.supplyValue) / 1e18,
          totalBorrowUsd: Number(market.borrowValue) / 1e18,
          ltv:
            Number(ltvs.find((m) => m.iToken === market.address)?.ltv) / 1e18,
          url: 'https://app.dforce.network/#/lending?AssetsType=Lend&currentPool=general',
        }));
      }
    )
  );

  return pools.flat();
};

const main = async () => {
  let data = await Promise.all([
    getStakingApy(),
    getVaultApy(),
    getLendingApy(),
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
