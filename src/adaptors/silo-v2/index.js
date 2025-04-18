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
        }
      }
    ],
  },
  // arbitrum: {
  //   chainName: "Arbitrum",
  //   factories: [
  //     {
  //       START_BLOCK: 291201890,
  //       SILO_FACTORY: '0xf7dc975C96B434D436b9bF45E7a45c95F0521442', // Silo V2 Arbitrum (Main)
  //     }
  //   ]
  // }
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
    const siloAddressToIncentiveResults = Object.assign({}, deploymentData.SILO_ADDRESS_TO_INCENTIVE_PROGRAM);
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
      .multipliedBy(assetPrices.pricesByAddress[assetAddress.toLowerCase()])
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
    .multipliedBy(assetPrices.pricesByAddress[assetAddress.toLowerCase()])
    .toString();

    let totalSupplyRaw = new BigNumber(collateralAssetBalance).toString();
    let totalSupplyValueUSD = new BigNumber(
      ethers.utils.formatUnits(
        totalSupplyRaw,
        assetAddressToDecimals[assetAddress]
      )
    )
    .multipliedBy(assetPrices.pricesByAddress[assetAddress.toLowerCase()])
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

const main = async () => {

  const markets = [];

  for(let [chain, config] of Object.entries(configV2)) {

    const api = new sdk.ChainApi({ chain });

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

    }

  }

  return markets;
};

module.exports = {
  timetravel: false,
  apy: main,
};
