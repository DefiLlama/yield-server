const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const BigNumber = require('bignumber.js');
const ethers = require('ethers');

const utils = require('../utils');

BigNumber.config({ EXPONENTIAL_AT: [-1e9, 1e9] });

const XAI = '0xd7c9f0e536dc865ae858b0c0453fe76d13c3beac'
const blacklistedSilos = ["0x6543ee07cf5dd7ad17aeecf22ba75860ef3bbaaa",];

const getAssetAbiV2 = "address:asset";
const getSiloConfigMarketId = "uint256:SILO_ID";
const getAssetBalanceAbi = "function balanceOf(address account) external view returns (uint256)";
const getAssetSymbolAbi = "function symbol() public view returns (string memory)";
const getAssetDecimalsAbi = "function decimals() public view returns (uint256)";
const getSiloStorageAbi = "function getSiloStorage() external view returns (uint192 daoAndDeployerRevenue, uint64 interestRateTimestamp, uint256 protectedAssets, uint256 collateralAssets, uint256 debtAssets)";
const getSiloAssetBorrowAprAbi = "function getBorrowAPR(address _silo) external view returns (uint256 borrowAPR)";
const getSiloAssetDepositAprAbi = "function getDepositAPR(address _silo) external view returns (uint256 depositAPR)";
const getSiloAssetMaxLtvAbi = "function getMaxLtv(address _silo) external view returns (uint256 maxLtv)";
const getAssetStateAbiV2 = 'function getTotalAssetsStorage(uint8 _assetType) external view returns (uint256 totalAssetsByType)';
const getIncentiveProgramAbi = 'function incentivesPrograms(bytes32) external view returns (uint256 index, address rewardToken, uint104 emissionPerSecond, uint40 lastUpdateTimestamp, uint40 distributionEnd)';

const configV2 = {
  sonic: {
    chainName: "Sonic",
    deployments: [
      {
        START_BLOCK: 2672166,
        SILO_FACTORY: '0xa42001d6d2237d2c74108fe360403c4b796b7170', // Silo V2 Sonic (Main)
        SILO_LENS: "0xB6AdBb29f2D8ae731C7C72036A7FD5A7E970B198",
        SILO_ADDRESS_TO_INCENTIVE_PROGRAM: {
          "0x4E216C15697C1392fE59e1014B009505E05810Df": {
            controller: "0x0dd368Cd6D8869F2b21BA3Cb4fd7bA107a2e3752",
            name: "wS_sUSDC_008",
            id: "0x77535f73555344435f3030380000000000000000000000000000000000000000",
          }
        },
        SUBGRAPH_URL: 'https://api.thegraph.com/subgraphs/id/QmdZHcgScfYHSAmosSrrRC4YYk5sV1QENsnUrUbFH6G7Cs',
      },
      {
        START_BLOCK: 25244110,
        SILO_FACTORY: '0xa42001d6d2237d2c74108fe360403c4b796b7170', // Silo V2 Sonic (Main Revised)
        SILO_LENS: "0x925D5466d4D5b01995E20e1245924aDa6415126a",
        SUBGRAPH_URL: 'https://api.thegraph.com/subgraphs/id/QmdZHcgScfYHSAmosSrrRC4YYk5sV1QENsnUrUbFH6G7Cs',
      }
    ],
  },
  arbitrum: {
    chainName: "Arbitrum",
    deployments: [
      {
        START_BLOCK: 334531851,
        SILO_FACTORY: '0x384DC7759d35313F0b567D42bf2f611B285B657C', // Silo V2 Arbitrum (Main)
        SILO_LENS: '0x8fBe8229a8959d0623C73B91121B12Cea79D739f',
      }
    ],
  },
  ethereum: {
    chainName: "Ethereum",
    deployments: [
      {
        START_BLOCK: 22616413,
        SILO_FACTORY: '0x22a3cF6149bFa611bAFc89Fd721918EC3Cf7b581', // Silo V2 Ethereum (Main)
        SILO_LENS: '0xF5875422734412EBbF6D4A074b7dE0a276BcDC88',
      }
    ],
  },
  avax: {
    chainName: "Avalanche",
    deployments: [
      {
        START_BLOCK: 64050356,
        SILO_FACTORY: '0x92cECB67Ed267FF98026F814D813fDF3054C6Ff9', // Silo V2 Avalanche (Main)
        SILO_LENS: '0x626B6fd8Cb764F1776BF7d65049D998D5a9f6c0A',
      }
    ],
  },
}

async function getSiloData(api, deploymentData) {

  // Handle V2 silos
  let siloData = [];
  let assetAddressToSymbol = {};
  let assetAddressToDecimals = {};
  let siloAddressToMarketId = {};
  let siloAddressToConfigAddress = {};
  if(configV2[api.chain]) {
    const { 
      siloAddresses: siloArrayV2,
      siloAddressesToSiloConfigAddress,
    } = await getSilosV2(api, deploymentData);
    const assetsV2 = await api.multiCall({
      abi: getAssetAbiV2,
      calls: siloArrayV2.map(i => ({ target: i })),
    });
    const assetBalancesV2 = await api.multiCall({
      abi: getAssetBalanceAbi,
      calls: assetsV2.map((asset, i) => ({ target: asset, params: [siloArrayV2[i]] })),
    });
    const assetBorrowAPR = await api.multiCall({
      abi: getSiloAssetBorrowAprAbi,
      calls: siloArrayV2.map((siloAddress, i) => ({ target: deploymentData.SILO_LENS, params: [siloAddress] })),
    });
    const assetDepositAPR = await api.multiCall({
      abi: getSiloAssetDepositAprAbi,
      calls: siloArrayV2.map((siloAddress, i) => ({ target: deploymentData.SILO_LENS, params: [siloAddress] })),
    });
    const assetMaxLTV = await api.multiCall({
      abi: getSiloAssetMaxLtvAbi,
      calls: siloArrayV2.map((siloAddress, i) => ({ target: deploymentData.SILO_LENS, params: [siloAddress] })),
    });
    const siloStorage = await api.multiCall({
      abi: getSiloStorageAbi,
      calls: siloArrayV2.map((siloAddress, i) => ({ target: siloAddress, params: [] })),
    });
    let siloAddressToIncentiveResults = {};
    if(deploymentData.SILO_ADDRESS_TO_INCENTIVE_PROGRAM) {
      siloAddressToIncentiveResults = Object.assign({}, deploymentData.SILO_ADDRESS_TO_INCENTIVE_PROGRAM);
      const siloIncentiveProgramData = await api.multiCall({
        abi: getIncentiveProgramAbi,
        calls: Object.entries(deploymentData.SILO_ADDRESS_TO_INCENTIVE_PROGRAM).map(([siloAddress, incentiveProgramEntry], i) => ({ target: incentiveProgramEntry.controller, params: [incentiveProgramEntry.id] })),
      });
      for(const [index, siloAddress] of Object.keys(deploymentData.SILO_ADDRESS_TO_INCENTIVE_PROGRAM).entries()) {
        siloAddressToIncentiveResults[siloAddress].result = {
          index: siloIncentiveProgramData[index].index,
          rewardToken: siloIncentiveProgramData[index].rewardToken,
          emissionPerSecond: siloIncentiveProgramData[index].emissionPerSecond,
          lastUpdateTimestamp: siloIncentiveProgramData[index].lastUpdateTimestamp,
          distributionEnd: siloIncentiveProgramData[index].distributionEnd,
        };
      }
    }
    siloData = assetsV2.map((asset, i) => [
      asset,
      siloArrayV2[i],
      assetBalancesV2[i],
      assetBorrowAPR[i],
      assetDepositAPR[i],
      assetMaxLTV[i],
      siloStorage[i].protectedAssets,
      siloStorage[i].collateralAssets,
      siloStorage[i].debtAssets,
      siloAddressToIncentiveResults?.[siloArrayV2?.[i]] ? siloAddressToIncentiveResults[siloArrayV2[i]] : false,
    ]);
    let uniqueAssetAddresses = [...new Set(assetsV2)];
    const assetSymbols = await api.multiCall({
      abi: getAssetSymbolAbi,
      calls: uniqueAssetAddresses.map((asset, i) => ({ target: asset })),
    });
    const assetDecimals = await api.multiCall({
      abi: getAssetDecimalsAbi,
      calls: uniqueAssetAddresses.map((asset, i) => ({ target: asset })),
    });
    for(let [index, assetAddress] of uniqueAssetAddresses.entries()) {
      assetAddressToSymbol[assetAddress] = assetSymbols[index];
      assetAddressToDecimals[assetAddress] = assetDecimals[index];
    }
    let uniqueSiloConfigAddresses = [...new Set(Object.values(siloAddressesToSiloConfigAddress))];
    const siloConfigMarketIds = await api.multiCall({
      abi: getSiloConfigMarketId,
      calls: uniqueSiloConfigAddresses.map((siloConfig, i) => ({ target: siloConfig })),
    });
    let siloConfigAddressToMarketId = {};
    for(let [index, siloConfigAddress] of uniqueSiloConfigAddresses.entries()) {
      siloConfigAddressToMarketId[siloConfigAddress] = siloConfigMarketIds[index];
    }
    for(let [siloAddress, siloConfigAddress] of Object.entries(siloAddressesToSiloConfigAddress)) {
      siloAddressToConfigAddress[siloAddress] = siloConfigAddress;
      siloAddressToMarketId[siloAddress] = siloConfigAddressToMarketId[siloConfigAddress];
    }
  }

  let assetPrices = await utils.getPrices(siloData.map(entry => entry[0]), api.chain);

  let assetDataBySilo = {};
  for(
    let [
      assetAddress,
      siloAddress,
      assetBalance,
      assetBorrowAPR,
      assetDepositAPR,
      assetMaxLTV,
      protectedAssetBalance,
      collateralAssetBalance,
      debtAssetBalance,
      incentiveProgramResults,
    ] of siloData
  ) {

    let assetBalanceFormatted = new BigNumber(
      ethers.utils.formatUnits(
        assetBalance,
        assetAddressToDecimals[assetAddress]
      )
    ).toString();

    let assetBalanceValueUSD = new BigNumber(
        ethers.utils.formatUnits(
          assetBalance,
          assetAddressToDecimals[assetAddress]
        )
      )
      .multipliedBy(assetPrices.pricesByAddress[assetAddress.toLowerCase()] ? assetPrices.pricesByAddress[assetAddress.toLowerCase()] : 0)
      .toString();

    let assetBorrowAprFormatted = new BigNumber(
      ethers.utils.formatUnits(
        assetBorrowAPR,
        16
      )
    ).toString();

    let assetMaxLtvFormatted = new BigNumber(
      ethers.utils.formatUnits(
        assetMaxLTV,
        18
      )
    ).toString();

    let assetDepositAprFormatted = new BigNumber(
      ethers.utils.formatUnits(
        assetDepositAPR,
        16
      )
    ).toString();

    let totalBorrowValueUSD = new BigNumber(
      ethers.utils.formatUnits(
        debtAssetBalance,
        assetAddressToDecimals[assetAddress]
      )
    )
    .multipliedBy(assetPrices.pricesByAddress[assetAddress.toLowerCase()] ? assetPrices.pricesByAddress[assetAddress.toLowerCase()] : 0)
    .toString();

    let totalSupplyRaw = new BigNumber(collateralAssetBalance).toString();
    let totalSupplyValueUSD = new BigNumber(
      ethers.utils.formatUnits(
        totalSupplyRaw,
        assetAddressToDecimals[assetAddress]
      )
    )
    .multipliedBy(assetPrices.pricesByAddress[assetAddress.toLowerCase()] ? assetPrices.pricesByAddress[assetAddress.toLowerCase()] : 0)
    .toString();

    let boostedAprFormatted = 0;
    let rewardTokens = [];
    if(incentiveProgramResults?.result?.emissionPerSecond) {
      let emissionsPerYearRewardToken = new BigNumber(incentiveProgramResults?.result.emissionPerSecond).multipliedBy(60).multipliedBy(60).multipliedBy(24).multipliedBy(365);
      let emissionsPerYearUSD = new BigNumber(
        ethers.utils.formatUnits(
          emissionsPerYearRewardToken.toString(),
          assetAddressToDecimals[incentiveProgramResults?.result?.rewardToken]
        )
      )
      .multipliedBy(assetPrices.pricesByAddress[incentiveProgramResults?.result?.rewardToken.toLowerCase()])
      .toString();
      rewardTokens.push(incentiveProgramResults?.result?.rewardToken);
      boostedAprFormatted = new BigNumber(new BigNumber(emissionsPerYearUSD).multipliedBy(100).toString()).dividedBy(new BigNumber(totalSupplyValueUSD)).toString();
    }

    assetDataBySilo[siloAddress] = {
      assetAddress: assetAddress,
      assetSymbol: assetAddressToSymbol[assetAddress],
      assetDecimals: assetAddressToDecimals[assetAddress],
      assetBalanceRaw: assetBalance,
      assetBalanceFormatted: assetBalanceFormatted,
      assetBalanceValueUSD: assetBalanceValueUSD,
      assetPrice: assetPrices.pricesByAddress[assetAddress.toLowerCase()],
      assetBorrowAprRaw: assetBorrowAPR,
      assetDepositAprRaw: assetDepositAPR,
      assetBorrowAprFormatted: assetBorrowAprFormatted,
      assetDepositAprFormatted: assetDepositAprFormatted,
      marketId: siloAddressToMarketId[siloAddress],
      siloConfig: siloAddressToConfigAddress[siloAddress],
      totalSupplyRaw: totalSupplyRaw,
      totalSupplyValueUSD: totalSupplyValueUSD,
      totalBorrowRaw: debtAssetBalance,
      totalBorrowValueUSD: totalBorrowValueUSD,
      assetMaxLtvRaw: assetMaxLTV,
      assetMaxLtvFormatted: assetMaxLtvFormatted,
      boostedAprFormatted,
      rewardTokens,
    }
  }

  return assetDataBySilo;
}

async function getSilosV2(chainApi, deploymentData) {
  const chain = chainApi.chain;
  let logs = [];
  let siloAddresses = [];
  let siloAddressesToSiloConfigAddress = {};
  if(configV2[chain]) {
    let latestBlock = await sdk.api.util.getLatestBlock(chain);
    const iface = new ethers.utils.Interface([
      'event NewSilo(address indexed implementation, address indexed token0, address indexed token1, address silo0, address silo1, address siloConfig)',
    ]);
    const { SILO_FACTORY, START_BLOCK } = deploymentData;
    let logChunk = await sdk.api2.util.getLogs({
      target: SILO_FACTORY,
      topics: ['0x3d6b896c73b628ec6ba0bdfe3cdee1356ea2af31af2a97bbd6b532ca6fa00acb'],
      keys: [],
      fromBlock: START_BLOCK,
      toBlock: latestBlock.block,
      chain: chain,
    });
    logs = [...logs, ...logChunk.output.map((event) =>  iface.parseLog(event))];

    siloAddresses = logs.flatMap((log) => {

      let silo0 = log.args[3];
      let silo1 = log.args[4];
      let siloConfig = log.args[5];

      siloAddressesToSiloConfigAddress[silo0] = siloConfig;
      siloAddressesToSiloConfigAddress[silo1] = siloConfig;

      return [silo0, silo1].filter(
        (address) => blacklistedSilos.indexOf(address.toLowerCase()) === -1
      );
    });

  }

  return { siloAddresses, siloAddressesToSiloConfigAddress };
}

async function getVaultData(api, deploymentData) {

  // Handle V2 Vaults
  let rawVaultData = {};
  let assetDataByVault = {};
  let assetsForPriceData = [];
  let subgraphVaults;
  if(deploymentData?.SUBGRAPH_URL) {
    const vaultQuery = gql`
      {
        vaults {
          id
          name
          totalSupply
          assetRatio
          decimals
          performanceFee
          asset {
            symbol
            name
            id
            decimals
          }
        }
      }
    `;
    subgraphVaults = await request(deploymentData?.SUBGRAPH_URL, vaultQuery);

    for(let vault of subgraphVaults?.vaults) {
      // Only collect data for vaults with a positive supply
      if(vault?.totalSupply && new BigNumber(vault.totalSupply).isGreaterThan(0)) {
        rawVaultData[vault.id] = {
          id: vault.id,
          name: vault.name,
          totalSupply: vault.totalSupply,
          assetRatio: vault.assetRatio,
          asset: vault.asset,
          performanceFee: vault.performanceFee ? ethers.utils.formatUnits(vault.performanceFee, 16) : 0,
        }
        if(vault?.asset?.id && assetsForPriceData?.indexOf(vault?.asset?.id) === -1) {
          assetsForPriceData.push(vault?.asset?.id);
        }
      }
    }

  }

  let assetPrices = await utils.getPrices(assetsForPriceData, api.chain);

  if(deploymentData?.SUBGRAPH_URL) {
    const VAULT_POSITION_BATCH_SIZE = 10;
    let vaultBatches = [];
    let vaultIdToPositionMetadata = {};
    for (let i = 0; i < subgraphVaults?.vaults?.length; i += VAULT_POSITION_BATCH_SIZE) {
      const batch = subgraphVaults?.vaults.slice(i, i + VAULT_POSITION_BATCH_SIZE);
      vaultBatches.push(batch);
    }

    for (let vaultBatch of vaultBatches) {

      let vaultAddresses = vaultBatch.map((vault) => vault.id);

      const vaultPositionsBatchQuery = gql`
        query vaultPositionQuery($account_in: [String!]) {
          positions(where: {account_in: $account_in}) {
            account {
              id
            }
            sTokenBalance
            market {
              id
              collateralRatio
              rates(where: {side: LENDER}) {
                rate
              }
            }
            sToken {
              asset {
                id
              }
              decimals
              symbol
            }
          }
        }
      `;
      const vaultPositions = await request(deploymentData?.SUBGRAPH_URL, vaultPositionsBatchQuery, {
        account_in: vaultAddresses
      });

      for(let vaultPosition of vaultPositions?.positions) {
        let vaultAccountId = vaultPosition?.account?.id;
        let underlyingAssetAmount = new BigNumber(vaultPosition?.sTokenBalance).multipliedBy(vaultPosition?.market?.collateralRatio).toFixed(0);
        if(!vaultIdToPositionMetadata[vaultAccountId]) {
          vaultIdToPositionMetadata[vaultAccountId] = {
            totalUnderlyingAssets: underlyingAssetAmount,
            totalUnderlyingAssetsUSD: ethers.utils.formatUnits(new BigNumber(underlyingAssetAmount).multipliedBy(assetPrices.pricesByAddress[vaultPosition?.sToken?.asset?.id.toLowerCase()]).toFixed(0), vaultPosition?.sToken?.decimals),
            positions: [{
              rates: vaultPosition?.market?.rates,
              underlyingAssetSymbol: vaultPosition?.sToken?.symbol,
              underlyingAssetAmount,
              underlyingAssetAmountUSD: ethers.utils.formatUnits(new BigNumber(underlyingAssetAmount).multipliedBy(assetPrices.pricesByAddress[vaultPosition?.sToken?.asset?.id.toLowerCase()]).toFixed(0), vaultPosition?.sToken?.decimals),
              underlyingAssetDecimals: vaultPosition?.sToken?.decimals,
            }]
          }
        } else {
          vaultIdToPositionMetadata[vaultAccountId].totalUnderlyingAssets = new BigNumber(vaultIdToPositionMetadata[vaultAccountId].totalUnderlyingAssets).plus(underlyingAssetAmount).toString();
          vaultIdToPositionMetadata[vaultAccountId].totalUnderlyingAssetsUSD = new BigNumber(vaultIdToPositionMetadata[vaultAccountId].totalUnderlyingAssetsUSD).plus(new BigNumber(ethers.utils.formatUnits(new BigNumber(underlyingAssetAmount).multipliedBy(assetPrices.pricesByAddress[vaultPosition?.sToken?.asset?.id.toLowerCase()]).toFixed(0), vaultPosition?.sToken?.decimals))).toFixed(0),
          vaultIdToPositionMetadata[vaultAccountId].positions.push({
            rates: vaultPosition?.market?.rates,
            underlyingAssetSymbol: vaultPosition?.sToken?.symbol,
            underlyingAssetAmount,
            underlyingAssetAmountUSD: ethers.utils.formatUnits(new BigNumber(underlyingAssetAmount).multipliedBy(assetPrices.pricesByAddress[vaultPosition?.sToken?.asset?.id.toLowerCase()]).toFixed(0), vaultPosition?.sToken?.decimals),
            underlyingAssetDecimals: vaultPosition?.sToken?.decimals,
          })
        }
      }

    }

    for(let matchAddress of Object.keys(vaultIdToPositionMetadata)) {
      if(rawVaultData[matchAddress]) {
        let totalRate = "0";
        for(let position of vaultIdToPositionMetadata[matchAddress].positions) {
          let positionRatio = new BigNumber(position.underlyingAssetAmountUSD).dividedBy(new BigNumber(vaultIdToPositionMetadata[matchAddress].totalUnderlyingAssetsUSD)).toString();
          let effectiveRate = new BigNumber(positionRatio).multipliedBy(new BigNumber(position.rates[0].rate)).toString();
          totalRate = new BigNumber(totalRate).plus(new BigNumber(effectiveRate)).toString();
        }
        // subtract performance fee
        totalRate = new BigNumber(totalRate).multipliedBy(new BigNumber(1).minus(new BigNumber(rawVaultData[matchAddress].performanceFee).dividedBy(100))).toString()
        rawVaultData[matchAddress].apyBase = totalRate;
      }
    }
  }

  for(
    let [
      vaultAddress,
      {
        id,
        name,
        totalSupply,
        assetRatio,
        asset,
        decimals,
        apyBase,
      }
    ] of Object.entries(rawVaultData)
  ) {

    let assetDepositedBalance = new BigNumber(assetRatio).multipliedBy(totalSupply)
    let assetDepositedBalanceFormatted = ethers.utils.formatUnits(
      assetDepositedBalance.toFixed(0),
      decimals
    )

    let assetDepositedBalanceValueUSD = new BigNumber(
        assetDepositedBalanceFormatted
      )
      .multipliedBy(assetPrices.pricesByAddress[asset.id.toLowerCase()])
      .toString();

    assetDataByVault[vaultAddress] = {
      assetAddress: asset.id,
      assetSymbol: asset.symbol,
      assetDecimals: asset.decimals,
      assetPrice: assetPrices.pricesByAddress[asset.id.toLowerCase()],
      vaultId: name,
      apyBase,
      totalSupplyRaw: assetDepositedBalance.toString(),
      totalSupplyFormatted: assetDepositedBalanceFormatted.toString(),
      totalSupplyValueUSD: assetDepositedBalanceValueUSD,
    }

    // console.log({assetDataByVault})

  }

  return assetDataByVault;
}

const main = async () => {

  const markets = [];

  for(let [chain, config] of Object.entries(configV2)) {

    const api = new sdk.ChainApi({ chain });

    const vaultPoolIds = [];

    for(let deploymentData of config.deployments) {

      let siloData = await getSiloData(api, deploymentData);

      for(let [siloAddress, siloInfo] of Object.entries(siloData)) {

        let marketData = {
          pool: `${siloInfo.marketId}-${siloAddress}-${chain}`,
          chain: config.chainName,
          project: 'silo-v2',
          symbol: utils.formatSymbol(siloInfo.assetSymbol),
          tvlUsd: new BigNumber(siloInfo.assetBalanceValueUSD).toNumber(),
          apyBase: new BigNumber(siloInfo.assetDepositAprFormatted).toNumber(),
          apyBaseBorrow: new BigNumber(siloInfo.assetBorrowAprFormatted).toNumber(),
          url: `https://v2.silo.finance/markets/${chain}/${siloInfo.marketId}`,
          underlyingTokens: [siloInfo.assetAddress],
          ltv: Number(siloInfo.assetMaxLtvFormatted),
          totalBorrowUsd: Number(Number(siloInfo.totalBorrowValueUSD).toFixed(2)),
          totalSupplyUsd: Number(Number(siloInfo.totalSupplyValueUSD).toFixed(2)),
          poolMeta: `${siloInfo.marketId}`,
          ...(siloInfo.boostedAprFormatted && {
            apyReward: new BigNumber(siloInfo.boostedAprFormatted).toNumber(),
            rewardTokens: siloInfo.rewardTokens,
          })
        };

        markets.push(marketData);
      }

      let vaultData = await getVaultData(api, deploymentData);

      for(let [vaultAddress, vaultInfo] of Object.entries(vaultData)) {
        let vaultPoolId = `${vaultInfo.vaultId}-${vaultAddress}-${chain}`;
        if(
          (new BigNumber(vaultInfo.apyBase).toNumber() > 0) && 
          (Number(Number(vaultInfo.totalSupplyValueUSD).toFixed(2)) > 0) && 
          (vaultPoolIds.indexOf(vaultPoolId) === -1)
        ) {
          let marketData = {
            pool: vaultPoolId,
            chain: config.chainName,
            project: 'silo-v2',
            symbol: utils.formatSymbol(vaultInfo.assetSymbol),
            tvlUsd: Number(Number(vaultInfo.totalSupplyValueUSD).toFixed(2)),
            apyBase: new BigNumber(vaultInfo.apyBase).toNumber(),
            url: `https://app.silo.finance/vaults/${chain}/${vaultAddress}?action=deposit`,
            underlyingTokens: [vaultInfo.assetAddress],
            totalSupplyUsd: Number(Number(vaultInfo.totalSupplyValueUSD).toFixed(2)),
            poolMeta: `${vaultInfo.vaultId}`,
          };
          vaultPoolIds.push()
          markets.push(marketData);
        }
      }

    }

  }

  return markets;
};

module.exports = {
  timetravel: false,
  apy: main,
};
