const utils = require('../utils');
const sdk = require('@defillama/sdk');

const chains = {
  Ethereum: 1,
};

const getAssetSymbolAbi =
  'function symbol() public view returns (string memory)';
const getAssetTotalSupplyAbi =
  'function totalSupply() public view returns (uint256)';

const getApy = async () => {
  const data = await Promise.all(
    Object.entries(chains).map(async (chain) => {
      // instantiate the sdk api for the chain
      const api = new sdk.ChainApi({ chain: chain[0].toLowerCase() });
      // Get yearn vaults data
      const yearnVaults = await utils.getData(
        `https://boosties.cove.finance/api/v1/yearn-vaults?chainId=${chain[1]}`
      );

      // Get Cove's boosties data
      const boostiesData = await utils.getData(
        `https://boosties.cove.finance/api/v1/cove-vaults`
      );
      const boostiesVaults = boostiesData.vaults;

      // Create a map of yearn vaults by address for easy lookup
      const yearnVaultsMap = {};
      yearnVaults.forEach((vault) => {
        yearnVaultsMap[vault.address.toLowerCase()] = vault;
      });

      // Fetch asset symbols for all boosties vaults
      const assetSymbols = await api.multiCall({
        abi: getAssetSymbolAbi,
        calls: boostiesVaults.map((vault) => ({
          target: vault.coveYearnStrategy,
        })),
      });

      // Enrich boosties vaults with their strategy symbols
      boostiesVaults.forEach((vault, i) => {
        vault.coveYearnStrategySymbol = assetSymbols[i];
      });

      // Fetch the total supply of each coveYearnStrategy
      const coveYearnStrategyTotalSupply = await api.multiCall({
        abi: getAssetTotalSupplyAbi,
        calls: boostiesVaults.map((vault) => ({
          target: vault.coveYearnStrategy,
        })),
      });

      // Multiply by the vault.coveYearnStrategyPricePerShare and divide by 1e18
      // Multiply by the underlying asset price, which is tvl.price of matching yearn vault
      const coveYearnStrategyTVL = coveYearnStrategyTotalSupply.map(
        (totalSupply, i) => {
          return parseFloat(
            Number(
              (((totalSupply *
                boostiesVaults[i].coveYearnStrategyPricePerShare) /
                1e18) *
                yearnVaultsMap[boostiesVaults[i].yearnVault.toLowerCase()].tvl
                  .price) /
                1e18
            ).toFixed(2)
          );
        }
      );

      // Enrich boosties vaults with their coveYearnStrategyTVL
      boostiesVaults.forEach((vault, i) => {
        vault.coveYearnStrategyTVL = coveYearnStrategyTVL[i];
      });

      return boostiesVaults
        .filter((boostie) => {
          // Find matching yearn vault
          const yearnVault = yearnVaultsMap[boostie.yearnVault.toLowerCase()];

          // Skip if no matching yearn vault found
          if (!yearnVault) return false;

          // Skip retired vaults
          if (yearnVault.info?.isRetired) return false;

          // Only include vaults with TVL > 0
          if (!yearnVault.tvl?.tvl || yearnVault.tvl.tvl <= 0) return false;

          return true;
        })
        .map((boostie) => {
          // Get the matching yearn vault
          const yearnVault = yearnVaultsMap[boostie.yearnVault.toLowerCase()];

          // Multiply coveYearnStrategy1DayAPR by yearnVault.apr.netAPR to get the net base APY for
          // the boosties vault
          const apyBase =
            (boostie.coveYearnStrategy1DayAPR + 100) *
              (((yearnVault.apr.netAPR + 1) * 100) / 100) -
            100;

          return {
            pool: `${boostie.coveYearnStrategy}-${chain[0]}`.toLowerCase(),
            chain: chain[0],
            project: 'cove-boosties',
            symbol: boostie.coveYearnStrategySymbol,
            tvlUsd: boostie.coveYearnStrategyTVL,
            apyBase,
            apyReward: null,
            rewardTokens: [],
            url: `https://boosties.cove.finance/boosties`,
            underlyingTokens: [boostie.vaultAsset],
          };
        });
    })
  );

  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
