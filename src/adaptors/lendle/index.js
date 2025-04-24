const sdk = require('@defillama/sdk');
const axios = require('axios');
const abiLendingPool = require('../aave-v2/abiLendingPool');
const abiProtocolDataProvider = require('../aave-v2/abiProtocolDataProvider');

const utils = require('../utils');

const vaultsApi = 'https://lendle-vaults-api-184110952121.europe-west4.run.app';
const vaultsApy = `${vaultsApi}/apy/breakdown`;
const vaultsTvl = `${vaultsApi}/tvl`;
const vaultsData = `${vaultsApi}/vaults`;

const vaultsCampaignApi = 'https://api.merkl.xyz/v4/opportunities?name=lendle';

const chains = {
  mantle: {
    LendingPool: '0xCFa5aE7c2CE8Fadc6426C1ff872cA45378Fb7cF3',
    ProtocolDataProvider: '0x552b9e4bae485C4B7F540777d7D25614CdB84773',
    url: 'mantle',
    chainId: 5000,
  },
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const addresses = chains[chain];
      const sdkChain = chain;

      const reservesList = (
        await sdk.api.abi.call({
          target: addresses.LendingPool,
          abi: abiLendingPool.find((m) => m.name === 'getReservesList'),
          chain: sdkChain,
        })
      ).output;

      const reserveData = (
        await sdk.api.abi.multiCall({
          calls: reservesList.map((i) => ({
            target: addresses.LendingPool,
            params: [i],
          })),
          abi: abiLendingPool.find((m) => m.name === 'getReserveData'),
          chain: sdkChain,
        })
      ).output.map((o) => o.output);

      const [liquidityRes, decimalsRes, symbolsRes] = await Promise.all(
        ['erc20:balanceOf', 'erc20:decimals', 'erc20:symbol'].map((method) =>
          sdk.api.abi.multiCall({
            abi: method,
            calls: reservesList.map((t, i) => ({
              target: t,
              params:
                method === 'erc20:balanceOf'
                  ? reserveData[i].aTokenAddress
                  : null,
            })),
            chain: sdkChain,
          })
        )
      );

      const liquidity = liquidityRes.output.map((o) => o.output);
      const decimals = decimalsRes.output.map((o) => o.output);
      let symbols = symbolsRes.output.map((o) => o.output);

      const totalBorrow = (
        await sdk.api.abi.multiCall({
          abi: 'erc20:totalSupply',
          calls: reserveData.map((p) => ({
            target: p.variableDebtTokenAddress,
          })),
          chain: sdkChain,
        })
      ).output.map((o) => o.output);

      const reserveConfigurationData = (
        await sdk.api.abi.multiCall({
          calls: reservesList.map((t) => ({
            target: addresses.ProtocolDataProvider,
            params: t,
          })),
          chain: sdkChain,
          abi: abiProtocolDataProvider.find(
            (n) => n.name === 'getReserveConfigurationData'
          ),
        })
      ).output.map((o) => o.output);

      const pricesArray = reservesList.map((t) => `${sdkChain}:${t}`);
      const prices = (
        await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
      ).data.coins;

      return reservesList.map((t, i) => {
        const config = reserveConfigurationData[i];
        if (!config.isActive) return null;

        const price = prices[`${sdkChain}:${t}`]?.price;

        const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
        const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
        const totalSupplyUsd = tvlUsd + totalBorrowUsd;

        const apyBase = reserveData[i].currentLiquidityRate / 1e25;
        const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

        const ltv = config.ltv / 1e4;
        const borrowable = config.borrowingEnabled;
        const frozen = config.isFrozen;

        const url = `https://app.lendle.xyz/marketdetail?asset=${
          symbols[i]
        }&contract=${t.toLowerCase()}`;

        return {
          pool: `${reserveData[i].aTokenAddress}-${chain}`.toLowerCase(),
          symbol: symbols[i],
          project: 'lendle',
          chain,
          tvlUsd,
          apyBase,
          underlyingTokens: [t],
          url,
          // borrow fields
          totalSupplyUsd,
          totalBorrowUsd,
          apyBaseBorrow,
          ltv,
          borrowable,
          poolMeta: frozen ? 'frozen' : null,
        };
      });
    })
  );

  const vaults = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const chainId = chains[chain].chainId;

      const _vaultsData = (await axios.get(vaultsData)).data;
      const vaultsList = _vaultsData.map((vault) => vault.earnContractAddress);

      const _vaultsTvl = (await axios.get(vaultsTvl)).data;
      const _vaultsApy = (await axios.get(vaultsApy)).data;

      const _vaultsCampaignApi = (await axios.get(vaultsCampaignApi)).data;

      return vaultsList.map((t, i) => {
        const config = _vaultsData[i];
        if (config.status !== 'active') return null;

        const tvlUsd = _vaultsTvl[chainId][config.id];

        let id = config.id;
        if (config.id === 'lendle-vault-mnt') {
          id = 'lendle-vault-wmnt';
        }
        const apyBase = _vaultsApy[id].totalApy;

        const aprData = _vaultsCampaignApi.find(
          (item) =>
            item.status === 'LIVE' &&
            item.identifier.toLowerCase() === t.toLowerCase() &&
            item.rewardsRecord.breakdowns[0].token.address !== '0x0000000000000000000000000000000000000000'
        );
        const apyReward = aprData ? aprData.apr : 0;

        const url = `https://app.lendle.xyz/vault/${
          config.id
        }`;

        return {
          pool: `${t}-${chain}`.toLowerCase(),
          symbol: config.earnedToken,
          project: 'lendle',
          chain,
          tvlUsd,
          apyBase,
          apyReward,
          underlyingTokens: [config.tokenAddress],
          rewardTokens: aprData && apyReward
            ? [aprData.rewardsRecord.breakdowns[0].token.address]
            : ['0x0000000000000000000000000000000000000000'],
          url,
          poolMeta: 'Vault',
        };
      });
    })
  );

  return [...pools.flat(), ...vaults.flat()].filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy: getApy,
};
