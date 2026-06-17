const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const ethers = require('ethers');

const utils = require('../utils');

BigNumber.config({ EXPONENTIAL_AT: [-1e9, 1e9] });

// Helper to fetch prices in chunks to avoid URL length limits
const PRICE_CHUNK_SIZE = 50;
const getPricesChunked = async (addresses, chain) => {
  const uniqueAddresses = [...new Set(addresses)];
  let pricesByAddress = {};
  let pricesBySymbol = {};

  for (let i = 0; i < uniqueAddresses.length; i += PRICE_CHUNK_SIZE) {
    const chunk = uniqueAddresses.slice(i, i + PRICE_CHUNK_SIZE);
    try {
      const prices = await utils.getPrices(chunk, chain);
      pricesByAddress = { ...pricesByAddress, ...prices.pricesByAddress };
      pricesBySymbol = { ...pricesBySymbol, ...prices.pricesBySymbol };
    } catch (e) {
      console.error(`Error fetching prices for chunk on ${chain}:`, e.message);
    }
  }

  return { pricesByAddress, pricesBySymbol };
};

const formatRawUsd = (amount, decimals, price = 0) =>
  new BigNumber(ethers.utils.formatUnits(amount.toString(), decimals))
    .multipliedBy(price || 0)
    .toString();

const toUsdNumber = (amount) => Number(Number(amount).toFixed(2));

const SILO_V2_BASE_URL = 'https://v2.silo.finance';
const SILO_API_URL = `${SILO_V2_BASE_URL}/api/display-markets`;
const SILO_API_MARKETS_LIMIT = 1000;

const getSiloUiChain = (chain) => (chain === 'avax' ? 'avalanche' : chain);

const checksumAddress = (address) => ethers.utils.getAddress(address);

const slugifySiloSymbol = (symbol) =>
  String(symbol || '')
    .trim()
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const getSiloMarketSlug = (siloPair) => {
  const orderedPair = [...siloPair].sort(
    ([, a], [, b]) => Number(a.siloIndex || 0) - Number(b.siloIndex || 0)
  );
  const marketId = orderedPair[0]?.[1]?.marketId;
  const tokenSlug = orderedPair
    .map(([, siloInfo]) => slugifySiloSymbol(siloInfo.assetSymbol))
    .filter(Boolean)
    .join('-');

  return `${tokenSlug}-${marketId}`;
};

const getSiloMarketUrl = (chain, marketSlug, action) =>
  `${SILO_V2_BASE_URL}/markets/${getSiloUiChain(chain)}/${marketSlug}?action=${action}`;

const blacklistedSilos = ["0x6543ee07cf5dd7ad17aeecf22ba75860ef3bbaaa",];

const EVENTS = {
  NewSilo: 'event NewSilo(address indexed implementation, address indexed token0, address indexed token1, address silo0, address silo1, address siloConfig)',
};

const badDebtSilos = {
  sonic: [
    "0xCCdDbBbd1E36a6EDA3a84CdCee2040A86225Ba71", // wmetaUSD - Sonic
    "0xEd9777944A2Fb32504a410D23f246463B3f40908", // USDC (wmetaUSD) - Sonic
    "0x6e8C150224D6e9B646889b96EFF6f7FD742e2C22", // wmetaUSD - Sonic
    "0x0aB02DD08c1555d1a20C76a6EA30e3E36f3e06d4", // scUSD (wmetaUSD) - Sonic
    "0x75c550776c191A8F6aE22EdC742aD2788723B66E", // wmetaUSD - Sonic
    "0xc6ee9A58D5270e53fD1361946899b6D0553142B4", // scUSD (wmetaUSD) - Sonic
    "0x501Ee3D6cB84004c7970cA24f3daC07D61A25e4D", // wmetaUSD - Sonic
    "0x1A089424F52502139888fa4c0ED2FA088e9E1d51", // USDC (wmetaUSD) - Sonic
    "0x1c1791911483E98875D162355feC47f37613f0FB", // wmetaS - Sonic
    "0x8c98b43BF61F2B07c4D26f85732217948Fca2a90", // wS (wmetaS) - Sonic
    "0xA1627a0E1d0ebcA9326D2219B84Df0c600bed4b1", // USDC - Sonic (Stream-impacted)
    "0xb1412442aa998950f2f652667d5Eba35fE66E43f", // scUSD - Sonic (Stream-impacted)
    "0x27968d36b937DcB26F33902fA489E5b228b104BE", // dUSD - Sonic (Stream-impacted)
    "0x76DF755A9f40463F14d0a2b7Cba3Ccf05404eEdf", // dUSD - Sonic (Stream-impacted)
    "0xAF1BDaE843d90c546DE5001f7b107B46e1a26Aa9", // dUSD - Sonic (Stream-impacted)
    "0x5954ce6671d97D24B782920ddCdBB4b1E63aB2De", // USDC - Sonic (Stream-impacted)
    "0x4935FaDB17df859667Cc4F7bfE6a8cB24f86F8d0", // USDC - Sonic (Stream-impacted)
    "0x219656F33c58488D09d518BaDF50AA8CdCAcA2Aa", // ETH - Sonic (Stream-impacted)
  ].map(entry => entry.toLowerCase()),
  ethereum: [
    "0x1dE3bA67Da79A81Bc0c3922689c98550e4bd9bc2", // USDC - ethereum (Stream-impacted)
  ].map(entry => entry.toLowerCase()),
  arbitrum: [
    "0xACb7432a4BB15402CE2afe0A7C9D5b738604F6F9", // USDC - Arbitrum (Stream-impacted)
    "0x2433D6AC11193b4695D9ca73530de93c538aD18a", // USDC - Arbitrum (Stream-impacted)
  ].map(entry => entry.toLowerCase()),
  avax: [
    "0x672b77f0538b53Dc117C9dDfEb7377A678d321a6", // USDC - Avalanche (Stream-impacted)
    "0xE0fc62e685E2b3183b4B88b1fE674cFEc55a63F7", // USDT - Avalanche (Stream-impacted)
    "0x9C4D4800b489d217724155399CD64D07Eae603f3", // AUSD - Avalanche (Stream-impacted)
    "0x7437ac81457Fa98fFB2d0C8f9943ecfE4813e2f1", // BTC.b - Avalanche (Stream-impacted)
  ].map(entry => entry.toLowerCase()),
};

const getAssetAbiV2 = "address:asset";
const getSiloConfigMarketId = "uint256:SILO_ID";
const getAssetSymbolAbi = "function symbol() public view returns (string memory)";
const getAssetDecimalsAbi = "function decimals() public view returns (uint256)";
const getSiloStorageAbi = "function getSiloStorage() external view returns (uint192 daoAndDeployerRevenue, uint64 interestRateTimestamp, uint256 protectedAssets, uint256 collateralAssets, uint256 debtAssets)";
const getSiloAssetBorrowAprAbi = "function getBorrowAPR(address _silo) external view returns (uint256 borrowAPR)";
const getSiloAssetDepositAprAbi = "function getDepositAPR(address _silo) external view returns (uint256 depositAPR)";
const getSiloAssetMaxLtvAbi = "function getMaxLtv(address _silo) external view returns (uint256 maxLtv)";
const getIncentiveProgramAbi = 'function incentivesPrograms(bytes32) external view returns (uint256 index, address rewardToken, uint104 emissionPerSecond, uint40 lastUpdateTimestamp, uint40 distributionEnd)';

const configV2 = {
  sonic: {
    chainName: "Sonic",
    deployments: [
      {
        START_BLOCK: 2672166,
        END_BLOCK: 25244109,
        SILO_FACTORY: '0xa42001d6d2237d2c74108fe360403c4b796b7170', // Silo V2 Sonic (Main)
        SILO_LENS: "0xB6AdBb29f2D8ae731C7C72036A7FD5A7E970B198",
      },
      {
        START_BLOCK: 25244110,
        SILO_FACTORY: '0xa42001d6d2237d2c74108fe360403c4b796b7170', // Silo V2 Sonic (Main Revised)
        SILO_LENS: "0x925D5466d4D5b01995E20e1245924aDa6415126a",
        SILO_ADDRESS_TO_INCENTIVE_PROGRAM: {
          "0x4E216C15697C1392fE59e1014B009505E05810Df": {
            controller: "0x0dd368Cd6D8869F2b21BA3Cb4fd7bA107a2e3752",
            name: "wS_sUSDC_008",
            id: "0x77535f73555344435f3030380000000000000000000000000000000000000000",
          }
        },
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
  let siloAddressToIndex = {};
  if(configV2[api.chain]) {
    const { 
      siloAddresses: siloArrayV2,
      siloAddressesToSiloConfigAddress,
      siloAddressToIndex: siloAddressToIndexV2,
    } = await getSilosV2(api, deploymentData);
    siloAddressToIndex = siloAddressToIndexV2;
    if (siloArrayV2.length === 0) return {};
    const assetsV2 = await api.multiCall({
      abi: getAssetAbiV2,
      calls: siloArrayV2.map(i => ({ target: i })),
      permitFailure: true,
    });
    // Filter out silos where the asset call failed (non-V2 silos)
    const validIndices = [];
    for (let i = 0; i < assetsV2.length; i++) {
      if (assetsV2[i]) validIndices.push(i);
    }
    const validSilos = validIndices.map(i => siloArrayV2[i]);
    const validAssets = validIndices.map(i => assetsV2[i]);

    const assetBorrowAPR = await api.multiCall({
      abi: getSiloAssetBorrowAprAbi,
      calls: validSilos.map((siloAddress, i) => ({ target: deploymentData.SILO_LENS, params: [siloAddress] })),
      permitFailure: true,
    });
    const assetDepositAPR = await api.multiCall({
      abi: getSiloAssetDepositAprAbi,
      calls: validSilos.map((siloAddress, i) => ({ target: deploymentData.SILO_LENS, params: [siloAddress] })),
      permitFailure: true,
    });
    const assetMaxLTV = await api.multiCall({
      abi: getSiloAssetMaxLtvAbi,
      calls: validSilos.map((siloAddress, i) => ({ target: deploymentData.SILO_LENS, params: [siloAddress] })),
      permitFailure: true,
    });
    const siloStorage = await api.multiCall({
      abi: getSiloStorageAbi,
      calls: validSilos.map((siloAddress, i) => ({ target: siloAddress, params: [] })),
      permitFailure: true,
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
    for (let i = 0; i < validSilos.length; i++) {
      // Skip silos where any critical lens call failed
      if (!assetBorrowAPR[i] && assetBorrowAPR[i] !== 0n && assetBorrowAPR[i] !== '0') continue;
      if (!assetDepositAPR[i] && assetDepositAPR[i] !== 0n && assetDepositAPR[i] !== '0') continue;
      if (!siloStorage[i]) continue;
      siloData.push([
        validAssets[i],
        validSilos[i],
        assetBorrowAPR[i],
        assetDepositAPR[i],
        assetMaxLTV[i] || '0',
        siloStorage[i].protectedAssets,
        siloStorage[i].collateralAssets,
        siloStorage[i].debtAssets,
        siloAddressToIncentiveResults?.[validSilos?.[i]] ? siloAddressToIncentiveResults[validSilos[i]] : false,
      ]);
    }
    let uniqueAssetAddresses = [...new Set(validAssets.filter(Boolean))];
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

  let assetPrices = await getPricesChunked(siloData.map(entry => entry[0]), api.chain);

  let assetDataBySilo = {};
  for(
    let [
      assetAddress,
      siloAddress,
      assetBorrowAPR,
      assetDepositAPR,
      assetMaxLTV,
      protectedAssetBalance,
      collateralAssetBalance,
      debtAssetBalance,
      incentiveProgramResults,
    ] of siloData
  ) {

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

    const assetPrice = assetPrices.pricesByAddress[assetAddress.toLowerCase()] || 0;
    const protectedSupplyRaw = new BigNumber(protectedAssetBalance);
    const borrowableSupplyRaw = new BigNumber(collateralAssetBalance);
    const totalBorrowRaw = new BigNumber(debtAssetBalance);
    const totalCollateralRaw = protectedSupplyRaw.plus(borrowableSupplyRaw);
    const availableBorrowRaw = BigNumber.maximum(
      borrowableSupplyRaw.minus(totalBorrowRaw),
      0
    );
    const hasBadDebt = totalBorrowRaw.gt(totalCollateralRaw);

    let totalBorrowValueUSD = formatRawUsd(
      totalBorrowRaw,
      assetAddressToDecimals[assetAddress],
      assetPrice
    );

    let totalSupplyRaw = totalCollateralRaw.toString();
    let totalSupplyValueUSD = formatRawUsd(
      totalSupplyRaw,
      assetAddressToDecimals[assetAddress],
      assetPrice
    );

    let availableBorrowValueUSD = formatRawUsd(
      availableBorrowRaw,
      assetAddressToDecimals[assetAddress],
      assetPrice
    );

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
      assetPrice,
      assetBorrowAprRaw: assetBorrowAPR,
      assetDepositAprRaw: assetDepositAPR,
      assetBorrowAprFormatted: assetBorrowAprFormatted,
      assetDepositAprFormatted: assetDepositAprFormatted,
      marketId: siloAddressToMarketId[siloAddress],
      siloConfig: siloAddressToConfigAddress[siloAddress],
      siloIndex: siloAddressToIndex[siloAddress],
      totalSupplyRaw: totalSupplyRaw,
      totalSupplyValueUSD: totalSupplyValueUSD,
      totalBorrowRaw: debtAssetBalance,
      totalBorrowValueUSD: totalBorrowValueUSD,
      availableBorrowRaw: availableBorrowRaw.toString(),
      availableBorrowValueUSD,
      hasBadDebt,
      assetMaxLtvRaw: assetMaxLTV,
      assetMaxLtvFormatted: assetMaxLtvFormatted,
      boostedAprFormatted,
      rewardTokens,
    }
  }

  return assetDataBySilo;
}

async function getSilosViaEnumeration(chainApi, deploymentData) {
  const chain = chainApi.chain;
  const { SILO_FACTORY } = deploymentData;
  let siloAddresses = [];
  let siloAddressesToSiloConfigAddress = {};
  let siloAddressToIndex = {};

  const nextId = await chainApi.call({
    target: SILO_FACTORY,
    abi: 'function getNextSiloId() view returns (uint256)',
  });
  const maxId = Number(nextId);
  if (maxId <= 1) return { siloAddresses, siloAddressesToSiloConfigAddress, siloAddressToIndex };

  const ids = Array.from({ length: maxId - 1 }, (_, i) => i + 1);
  const configAddresses = await chainApi.multiCall({
    target: SILO_FACTORY,
    abi: 'function idToSiloConfig(uint256) view returns (address)',
    calls: ids.map(id => ({ params: [id] })),
  });

  const validConfigs = configAddresses.filter(a => a !== '0x0000000000000000000000000000000000000000');
  if (validConfigs.length === 0) return { siloAddresses, siloAddressesToSiloConfigAddress, siloAddressToIndex };

  const siloResults = await chainApi.multiCall({
    abi: 'function getSilos() view returns (address, address)',
    calls: validConfigs.map(c => ({ target: c })),
  });

  for (let i = 0; i < validConfigs.length; i++) {
    const siloConfig = validConfigs[i];
    const silo0 = siloResults[i][0];
    const silo1 = siloResults[i][1];

    siloAddressesToSiloConfigAddress[silo0] = siloConfig;
    siloAddressesToSiloConfigAddress[silo1] = siloConfig;
    siloAddressToIndex[silo0] = 0;
    siloAddressToIndex[silo1] = 1;

    const pair = [silo0, silo1].filter(
      (address) => ((blacklistedSilos.indexOf(address.toLowerCase()) === -1) && (badDebtSilos[chain]?.indexOf(address.toLowerCase()) === -1))
    );
    siloAddresses.push(...pair);
  }

  return { siloAddresses, siloAddressesToSiloConfigAddress, siloAddressToIndex };
}

async function getSilosViaApi(chainApi, deploymentData) {
  const chain = chainApi.chain;
  const chainKey = getSiloUiChain(chain);
  let siloAddresses = [];
  let siloAddressesToSiloConfigAddress = {};
  let siloAddressToIndex = {};

  const markets = await utils.getData(
    SILO_API_URL,
    {
      search: null,
      chainKey,
      sort: null,
      limit: SILO_API_MARKETS_LIMIT,
      offset: 0,
      isCurated: true,
    },
    { 'Content-Type': 'application/json' }
  );
  if (!Array.isArray(markets)) throw new Error('invalid Silo API market response');

  const siloConfigs = markets
    .filter((market) => market?.chainKey === chainKey && market?.configAddress)
    .map((market) => checksumAddress(market.configAddress));
  if (!siloConfigs.length) return { siloAddresses, siloAddressesToSiloConfigAddress, siloAddressToIndex };

  const siloResults = await chainApi.multiCall({
    abi: 'function getSilos() view returns (address, address)',
    calls: siloConfigs.map((configAddress) => ({ target: configAddress })),
    permitFailure: true,
  });

  for (let i = 0; i < siloConfigs.length; i++) {
    const siloConfig = siloConfigs[i];
    const siloPair = siloResults[i];
    if (!siloPair?.[0] || !siloPair?.[1]) continue;

    for (const [index, siloAddress] of siloPair.entries()) {
      if (
        blacklistedSilos.indexOf(siloAddress.toLowerCase()) !== -1 ||
        badDebtSilos[chain]?.indexOf(siloAddress.toLowerCase()) !== -1
      ) continue;

      siloAddresses.push(siloAddress);
      siloAddressesToSiloConfigAddress[siloAddress] = siloConfig;
      siloAddressToIndex[siloAddress] = index;
    }
  }

  return { siloAddresses, siloAddressesToSiloConfigAddress, siloAddressToIndex };
}

async function getSilosV2(chainApi, deploymentData) {
  const chain = chainApi.chain;
  let siloAddresses = [];
  let siloAddressesToSiloConfigAddress = {};
  let siloAddressToIndex = {};
  if(configV2[chain]) {
    return await getSilosViaApi(chainApi, deploymentData);
  }

  return { siloAddresses, siloAddressesToSiloConfigAddress, siloAddressToIndex };
}

const main = async () => {

  const markets = [];

  for(let [chain, config] of Object.entries(configV2)) {

    try {
      const api = new sdk.ChainApi({ chain });

      const marketPoolIds = [];

      for(let deploymentData of config.deployments) {
        if (deploymentData.END_BLOCK) continue;

        let siloData = await getSiloData(api, deploymentData);
        const silosByConfig = {};

        for(let [siloAddress, siloInfo] of Object.entries(siloData)) {
          if (!silosByConfig[siloInfo.siloConfig]) silosByConfig[siloInfo.siloConfig] = [];
          silosByConfig[siloInfo.siloConfig].push([siloAddress, siloInfo]);
        }

        for(const siloPair of Object.values(silosByConfig)) {
          if (siloPair.some(([, siloInfo]) => siloInfo.hasBadDebt)) continue;
          const marketSlug = getSiloMarketSlug(siloPair);

          for (const [siloAddress, siloInfo] of siloPair) {
            let marketPoolId = `${siloInfo.marketId}-${siloAddress}-${chain}`;
            if(marketPoolIds.indexOf(marketPoolId) !== -1) continue;

            let marketData = {
              pool: marketPoolId,
              chain: config.chainName,
              project: 'silo-v2',
              symbol: siloInfo.assetSymbol,
              tvlUsd: toUsdNumber(siloInfo.totalSupplyValueUSD),
              apyBase: new BigNumber(siloInfo.assetDepositAprFormatted).toNumber(),
              url: getSiloMarketUrl(chain, marketSlug, 'deposit'),
              underlyingTokens: [siloInfo.assetAddress],
              poolMeta: `id ${siloInfo.marketId}`,
              ...(siloInfo.boostedAprFormatted && {
                apyReward: new BigNumber(siloInfo.boostedAprFormatted).toNumber(),
                rewardTokens: siloInfo.rewardTokens,
              })
            };

            marketPoolIds.push(marketPoolId);
            markets.push(marketData);
          }
        }

        for(const siloPair of Object.values(silosByConfig)) {
          if (siloPair.length !== 2) continue;
          if (siloPair.some(([, siloInfo]) => siloInfo.hasBadDebt)) continue;
          const marketSlug = getSiloMarketSlug(siloPair);

          for (const [borrowSiloAddress, borrowInfo] of siloPair) {
            const collateralEntry = siloPair.find(([siloAddress]) => siloAddress !== borrowSiloAddress);
            if (!collateralEntry) continue;

            const [, collateralInfo] = collateralEntry;
            const borrowPoolId = `${borrowInfo.marketId}-${borrowSiloAddress}-${chain}-borrow`;
            if(marketPoolIds.indexOf(borrowPoolId) !== -1) continue;

            const ltv = Number(collateralInfo.assetMaxLtvFormatted);
            if (!(ltv > 0)) continue;

            const availableBorrowUsd = toUsdNumber(borrowInfo.availableBorrowValueUSD);
            const totalBorrowUsd = toUsdNumber(borrowInfo.totalBorrowValueUSD);
            const totalSupplyUsd = toUsdNumber(collateralInfo.totalSupplyValueUSD);

            marketPoolIds.push(borrowPoolId);
            markets.push({
              pool: borrowPoolId,
              chain: config.chainName,
              project: 'silo-v2',
              symbol: collateralInfo.assetSymbol,
              token: null,
              tvlUsd: availableBorrowUsd,
              apy: 0,
              apyBaseBorrow: new BigNumber(borrowInfo.assetBorrowAprFormatted).toNumber(),
              url: getSiloMarketUrl(chain, marketSlug, 'borrow'),
              underlyingTokens: [collateralInfo.assetAddress],
              ltv,
              totalSupplyUsd,
              totalBorrowUsd,
              availableBorrowUsd,
              borrowToken: borrowInfo.assetAddress,
              borrowable: ltv > 0,
              poolMeta: `${borrowInfo.assetSymbol} borrow`,
            });
          }
        }

      }
    } catch(e) {
      throw new Error(`Error processing chain ${chain}: ${e.message}`);
    }

  }

  return markets;
};

module.exports = {
  protocolId: '5611',
  timetravel: false,
  apy: main,
};
