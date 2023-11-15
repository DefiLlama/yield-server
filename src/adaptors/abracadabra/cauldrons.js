const {
  utils: { formatEther, formatUnits },
} = require('ethers');
const _ = require('lodash');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');
const MARKET_LENS_ABI = require('./abis/MarketLens.json');
const CAULDRON_V2_ABI = require('./abis/CauldronV2.json');
const BENTOBOX_V1_ABI = require('./abis/BentoBoxV1.json');
const INTEREST_STRATEGY = require('./abis/InterestStrategy.json');
const BASE_STARGATE_LP_STRATEGY = require('./abis/BaseStargateLPStrategy.json');
const FEE_COLLECTABLE_STRATEGY = require('./abis/FeeCollectable.json');

const MIM_COINGECKO_ID = 'magic-internet-money';

const POOLS = {
  arbitrum: {
    marketLensAddress: '0x73f52bd9e59edbdf5cf0dd59126cef00ecc31528',
    cauldrons: [
      { version: 2, address: '0xc89958b03a55b5de2221acb25b58b89a000215e6' }, // wETH
      { version: 4, address: '0x5698135ca439f21a57bddbe8b582c62f090406d5' }, // GLP
      {
        version: 4,
        address: '0x726413d7402ff180609d0ebc79506df8633701b1',
        collateralPoolId: 'a4bcffaa-3b75-436c-b6c2-7b1c3840d041'
      }, // magicGLP
    ],
  },
  avax: {
    marketLensAddress: '0x73f52bd9e59edbdf5cf0dd59126cef00ecc31528',
    cauldrons: [
      { version: 2, address: '0x3cfed0439ab822530b1ffbd19536d897ef30d2a2' }, // AVAX
      { version: 2, address: '0x56984f04d2d04b2f63403f0ebedd3487716ba49d' }, // wMEMO (deprecated)
      { version: 2, address: '0x3b63f81ad1fc724e44330b4cf5b5b6e355ad964b' }, // xJOE
      { version: 2, address: '0x35fa7a723b3b39f15623ff1eb26d8701e7d6bb21' }, // wMEMO
      { version: 2, address: '0x95cce62c3ecd9a33090bbf8a9eac50b699b54210' }, // USDC/AVAX JLP
      { version: 2, address: '0x0a1e6a80e93e62bd0d3d3bfcf4c362c40fb1cf3d' }, // USDT/AVAX JLP
      { version: 2, address: '0x2450bf8e625e98e14884355205af6f97e3e68d07' }, // MIM/AVAX JLP
      { version: 2, address: '0xacc6821d0f368b02d223158f8ada4824da9f28e3' }, // MIM/AVAX SLP
    ],
  },
  bsc: {
    marketLensAddress: '0x73f52bd9e59edbdf5cf0dd59126cef00ecc31528',
    cauldrons: [
      { version: 2, address: '0x692cf15f80415d83e8c0e139cabcda67fcc12c90' }, // wBNB
      { version: 2, address: '0xf8049467f3a9d50176f4816b20cddd9bb8a93319' }, // CAKE
    ],
  },
  ethereum: {
    marketLensAddress: '0x73f52bd9e59edbdf5cf0dd59126cef00ecc31528',
    cauldrons: [
      {
        version: 1,
        address: '0xbb02a884621fb8f5bfd263a67f58b65df5b090f3',
        interestPerYear: 150,
        maximumCollateralRatio: 7500,
      }, // xSUSHI (deprecated)
      {
        version: 1,
        address: '0x6cbafee1fab76ca5b5e144c43b3b50d42b7c8c8f',
        interestPerYear: 80,
        maximumCollateralRatio: 9000,
      }, // yvUSDC (deprecated)
      {
        version: 1,
        address: '0x551a7cff4de931f32893c928bbc3d25bf1fc5147',
        interestPerYear: 80,
        maximumCollateralRatio: 9000,
      }, // yvUSDT (deprecated)
      {
        version: 1,
        address: '0x6ff9061bb8f97d948942cef376d98b51fa38b91f',
        interestPerYear: 150,
        maximumCollateralRatio: 7500,
      }, // yvWETH (deprecated)
      {
        version: 1,
        address: '0xffbf4892822e0d552cff317f65e1ee7b5d3d9ae6',
        interestPerYear: 150,
        maximumCollateralRatio: 7500,
      }, // yvYFI (deprecated)
      { version: 2, address: '0xc1879bf24917ebe531fbaa20b0d05da027b592ce' }, // AGLD
      { version: 2, address: '0x7b7473a76d6ae86ce19f7352a1e89f6c9dc39020' }, // ALCX
      { version: 2, address: '0x05500e2ee779329698df35760bedcaac046e7c27' }, // FTM
      { version: 2, address: '0x003d5a75d284824af736df51933be522de9eed0f' }, // wsOHM
      { version: 2, address: '0x98a84eff6e008c5ed0289655ccdca899bcb6b99f' }, // xSUSHI v3
      { version: 2, address: '0x0bf90b3b5cad7dfcf70de198c498b61b3ba35cff' }, // xSUSHI v2
      { version: 2, address: '0xebfde87310dc22404d918058faa4d56dc4e93f0a' }, // yvcrvIB
      { version: 2, address: '0x0bca8ebcb26502b013493bf8fe53aa2b1ed401c1' }, // yvstETH (deprecated)
      {
        version: 2,
        address: '0x920d9bd936da4eafb5e25c6bdc9f6cb528953f9f',
        collateralPoolId: 'acb09b67-8509-4e2a-adb4-4ce520084714',
      }, // yvWETH
      { version: 2, address: '0x5db0ebf9feeecfd0ee82a4f27078dbce7b4cd1dc' }, // sSPELL
      { version: 2, address: '0xc319eea1e792577c319723b5e60a15da3857e7da' }, // sSPELL v2 (deprecated)
      { version: 2, address: '0x3410297d89dcdaf4072b805efc1ef701bb3dd9bf' }, // sSPELL v3
      { version: 2, address: '0x252dcf1b621cc53bc22c256255d2be5c8c32eae4' }, // SHIB
      { version: 2, address: '0x9617b633ef905860d919b88e1d9d9a6191795341' }, // FTT
      { version: 2, address: '0xcfc571f3203756319c231d3bc643cee807e74636' }, // SPELL (DegenBox)
      { version: 2, address: '0xbc36fde44a7fd8f545d459452ef9539d7a14dd63' }, // UST V1 (deprecated)
      { version: 2, address: '0x59e9082e068ddb27fc5ef1690f9a9f22b32e573f' }, // UST V2 (deprecated)
      { version: 2, address: '0x390db10e65b5ab920c19149c919d970ad9d18a41' }, // WETH
      { version: 2, address: '0x5ec47ee69bede0b6c2a2fc0d9d094df16c192498' }, // WBTC
      { version: 2, address: '0xf179fe36a36b32a4644587b8cdee7a23af98ed37' }, // yvCVXETH
      {
        version: 2,
        address: '0x4eaed76c3a388f4a841e9c765560bbe7b3e4b3a0',
        collateralPoolId: 'ad3d7253-fb8f-402f-a6f8-821bc0a055cb',
      }, // cvxTricrypto2
      { version: 2, address: '0x806e16ec797c69afa8590a55723ce4cc1b54050e' }, // cvx3Pool (deprecated)
      { version: 2, address: '0x6371efe5cd6e3d2d7c477935b7669401143b7985' }, // cvx3pool (deprecated)
      {
        version: 2,
        address: '0x257101f20cb7243e2c7129773ed5dbbcef8b34e0',
        collateralPoolId: '7394f1bc-840a-4ff0-9e87-5e0ef932943a',
      }, // cvx3pool
      {
        version: 3,
        address: '0x7ce7d9ed62b9a6c5ace1c6ec9aeb115fa3064757',
        collateralPoolId: '7be3388a-0591-4281-a6f3-eff3217693fa',
      }, // yvDAI
      {
        version: 3,
        address: '0x53375add9d2dfe19398ed65baaeffe622760a9a6',
        cauldronMeta: 'Whitelisted',
      }, // yvstETH Concentrated (deprecated)
      { version: 3, address: '0xd31e19a0574dbf09310c3b06f3416661b4dc7324' }, // Stargate USDC
      {
        version: 3,
        address: '0xc6b2b3fe7c3d7a6f823d9106e22e66660709001e',
        collateralPoolId: '07d379c9-2c9d-4abd-9b23-18c379f1ff5b',
      }, // Stargate USDT
      { version: 3, address: '0x8227965a7f42956549afaec319f4e444aa438df5' }, // LUSD
      {
        version: 4,
        address: '0x1062eb452f8c7a94276437ec1f4aaca9b1495b72',
        cauldronMeta: 'Whitelisted',
        collateralPoolId: '07d379c9-2c9d-4abd-9b23-18c379f1ff5b',
      }, // Stargate USDT (POF)
      { version: 4, address: '0x207763511da879a900973a5e092382117c3c1588' }, // CRV
      { version: 4, address: '0x85f60d3ea4e86af43c9d4e9cc9095281fc25c405' }, // Migrated WBTC
      {
        version: 4,
        address: '0x7259e152103756e1616a77ae982353c3751a6a90',
        collateralPoolId: 'f827e130-1684-4829-b464-b5f99cf1d82b',
      }, // yvCrv3Crypto
      { version: 4, address: '0x692887e8877c6dd31593cda44c382db5b289b684' }, // magicAPE
      { version: 4, address: '0x7d8df3e4d06b0e19960c19ee673c0823beb90815' }, // CRV V2
    ],
  },
  fantom: {
    marketLensAddress: '0x73f52bd9e59edbdf5cf0dd59126cef00ecc31528',
    cauldrons: [
      { version: 2, address: '0x8e45af6743422e488afacdad842ce75a09eaed34' }, // wFTM
      { version: 2, address: '0xd4357d43545f793101b592bacab89943dc89d11b' }, // wFTM
      { version: 2, address: '0xed745b045f9495b8bfc7b58eea8e0d0597884e12' }, // yvFTM
      { version: 2, address: '0xa3fc1b4b7f06c2391f7ad7d4795c1cd28a59917e' }, // xBOO
      { version: 2, address: '0x7208d9f9398d7b02c5c22c334c2a7a3a98c0a45d' }, // FTM/MIM SpiritLP
      { version: 2, address: '0x4fdffa59bf8dda3f4d5b38f260eab8bfac6d7bc1' }, // FTM/MIM SpookyLP
    ],
  },
  optimism: {
    marketLensAddress: '0x73f52bd9e59edbdf5cf0dd59126cef00ecc31528',
    cauldrons: [
      { version: 3, address: '0x68f498c230015254aff0e1eb6f85da558dff2362' },
    ],
  },
  kava: {
    marketLensAddress: '0x2d50927A6E87E517946591A137b765fAba018E70',
    cauldrons: [
      { version: 4, address: '0x3CFf6F628Ebc88e167640966E67314Cf6466E6A8' }, // MIM/USDT Curve LP
      {
        version: 4,
        address: '0x895731a0C3836a5534561268F15EBA377218651D',
        collateralPoolId: '246ee0b2-434e-44dd-90a7-a728deaf1597',
      }, // Stargate USDT
    ]
  },
};

const NEGATIVE_INTEREST_STRATEGIES = {
  ethereum: [
    '0x186d76147a226a51a112bb1958e8b755ab9fd1af',
    '0xcc0d7af1f809dd3a589756bba36be04d19e9c6c5',
  ],
};

const BASE_STARGATE_LP_STRATEGIES = {
  ethereum: [
    '0x86130Dac04869a8201c7077270C10f3AFaba1c82',
    '0x8439Ac976aC597C71C0512D8a53697a39E8F9773',
  ],
};

const FEE_COLLECTABLE_STRATEGIES = {
  kava: [
    '0x30D525cbB79D2baaE7637eA748631a6360Ce7c16'
  ]
}

const getMarketLensDetailsForCauldrons = (
  chain,
  marketLensAddress,
  abiName,
  cauldrons
) =>
  sdk.api.abi
    .multiCall({
      abi: MARKET_LENS_ABI.find((abi) => abi.name == abiName),
      calls: cauldrons.map((cauldron) => ({
        target: marketLensAddress,
        params: [cauldron.address],
      })),
      chain,
      requery: true,
    })
    .then((call) => call.output.map((x) => x.output));

const enrichMarketInfos = (cauldrons, marketInfos) =>
  marketInfos
    .map((marketInfo, i) => ({
      cauldron: cauldrons[i].address,
      maximumCollateralRatio: cauldrons[i].maximumCollateralRatio,
      interestPerYear: cauldrons[i].interestPerYear,
      cauldronMeta: cauldrons[i].cauldronMeta,
      collateralPoolId: cauldrons[i].collateralPoolId,
      ...marketInfo,
    }))
    .map((enrichedMarketInfo) => _.omitBy(enrichedMarketInfo, _.isUndefined));

const getApyV1Cauldrons = async (chain, marketLensAddress, cauldrons) => {
  const [
    marketMaxBorrowCauldrons,
    totalBorrowedCauldrons,
    oracleExchangeRateCauldrons,
    totalCollateralCauldrons,
  ] = await Promise.all([
    getMarketLensDetailsForCauldrons(
      chain,
      marketLensAddress,
      'getMaxMarketBorrowForCauldronV2',
      cauldrons
    ),
    sdk.api.abi
      .multiCall({
        abi: CAULDRON_V2_ABI.find((abi) => abi.name == 'totalBorrow'),
        calls: cauldrons.map((cauldron) => ({
          target: cauldron.address,
        })),
        chain,
        requery: true,
      })
      .then((call) => call.output.map((x) => x.output.elastic)),
    getMarketLensDetailsForCauldrons(
      chain,
      marketLensAddress,
      'getOracleExchangeRate',
      cauldrons
    ),
    getMarketLensDetailsForCauldrons(
      chain,
      marketLensAddress,
      'getTotalCollateral',
      cauldrons
    ),
  ]);

  const marketInfos = cauldrons.map((_, i) => ({
    marketMaxBorrow: marketMaxBorrowCauldrons[i],
    totalBorrowed: totalBorrowedCauldrons[i],
    oracleExchangeRate: oracleExchangeRateCauldrons[i],
    totalCollateral: totalCollateralCauldrons[i],
  }));

  return enrichMarketInfos(cauldrons, marketInfos);
};

const getApyV2Cauldrons = (chain, marketLensAddress, cauldrons) =>
  getMarketLensDetailsForCauldrons(
    chain,
    marketLensAddress,
    'getMarketInfoCauldronV2',
    cauldrons
  ).then((marketInfos) => enrichMarketInfos(cauldrons, marketInfos));

const getApyV3PlusCauldrons = (chain, marketLensAddress, cauldrons) =>
  getMarketLensDetailsForCauldrons(
    chain,
    marketLensAddress,
    'getMarketInfoCauldronV3',
    cauldrons
  ).then((marketInfos) => enrichMarketInfos(cauldrons, marketInfos));

const getMarketInfos = (pools) =>
  Promise.all(
    Object.entries(pools).map(async ([chain, chainPoolData]) => {
      const v1Cauldrons = chainPoolData.cauldrons.filter(
        (cauldron) => cauldron.version === 1
      );
      const v2Cauldrons = chainPoolData.cauldrons.filter(
        (cauldron) => cauldron.version === 2
      );
      const v3plusCauldrons = chainPoolData.cauldrons.filter(
        (cauldron) => cauldron.version >= 3
      );

      const marketInfos = await Promise.all([
        getApyV1Cauldrons(chain, chainPoolData.marketLensAddress, v1Cauldrons),
        getApyV2Cauldrons(chain, chainPoolData.marketLensAddress, v2Cauldrons),
        getApyV3PlusCauldrons(
          chain,
          chainPoolData.marketLensAddress,
          v3plusCauldrons
        ),
      ]).then((x) => x.flat());

      return [chain, marketInfos];
    })
  ).then((x) => Object.fromEntries(x));

const getCauldronDetails = (pools, abiName) =>
  Promise.all(
    Object.entries(pools).map(async ([chain, { cauldrons }]) => [
      chain,
      await sdk.api.abi
        .multiCall({
          abi: CAULDRON_V2_ABI.find((abi) => abi.name == abiName),
          calls: cauldrons.map((cauldron) => ({
            target: cauldron.address,
          })),
          chain,
          requery: true,
        })
        .then((call) =>
          Object.fromEntries(
            call.output.map((x, i) => [
              cauldrons[i].address.toLowerCase(),
              x.output,
            ])
          )
        ),
    ])
  ).then(Object.fromEntries);

const getStrategies = (collaterals, bentoboxes) =>
  Promise.all(
    Object.entries(collaterals).map(async ([chain, chainCollaterals]) => {
      const zippedCollateralBentoboxes = Object.keys(chainCollaterals).map(
        (cauldronAddress) => [
          collaterals[chain][cauldronAddress].toLowerCase(),
          bentoboxes[chain][cauldronAddress].toLowerCase(),
        ]
      );

      const uniqueZippedCollateralBentoboxes = _.uniqWith(
        zippedCollateralBentoboxes,
        _.isEqual
      );

      const [strategies, strategyDataArray] = await Promise.all([
        sdk.api.abi
          .multiCall({
            abi: BENTOBOX_V1_ABI.find((abi) => abi.name === 'strategy'),
            calls: uniqueZippedCollateralBentoboxes.map(
              ([collateral, bentobox]) => ({
                target: bentobox,
                params: [collateral],
              })
            ),
            chain,
            requery: true,
          })
          .then((call) => call.output.map((x) => x.output)),
        sdk.api.abi
          .multiCall({
            abi: BENTOBOX_V1_ABI.find((abi) => abi.name === 'strategyData'),
            calls: uniqueZippedCollateralBentoboxes.map(
              ([collateral, bentobox]) => ({
                target: bentobox,
                params: [collateral],
              })
            ),
            chain,
            requery: true,
          })
          .then((call) => call.output.map((x) => x.output)),
      ]);

      // Build result like {collateralAddress: {bentoboxAddress: {address: strategyAddress, strategyData: strategyData}}}
      const zippedResults = _.zip(
        uniqueZippedCollateralBentoboxes,
        strategies,
        strategyDataArray
      ).filter(
        ([_, strategy, strategyData]) =>
          // Ignore empty strategies and disabled strategies
          strategy !== '0x0000000000000000000000000000000000000000' &&
          strategyData.targetPercentage != 0
      );
      const resultObject = _.zipObjectDeep(
        zippedResults.map(([collateralBentobox, _]) => collateralBentobox),
        zippedResults.map(([_, strategy, strategyData]) => ({
          address: strategy.toLowerCase(),
          strategyData: strategyData,
        }))
      );

      return [chain, resultObject];
    })
  ).then(Object.fromEntries);

const getNegativeInterestStrategyApy = (negativeInterestStrategies) =>
  Promise.all(
    Object.entries(negativeInterestStrategies).map(
      async ([chain, chainNegativeInterestStrategies]) => [
        chain,
        await sdk.api.abi
          .multiCall({
            abi: INTEREST_STRATEGY.find(
              (abi) => abi.name === 'getYearlyInterestBips'
            ),
            calls: chainNegativeInterestStrategies.map(
              (negativeInterestStrategy) => ({
                target: negativeInterestStrategy,
              })
            ),
            chain,
            requery: true,
          })
          .then((call) =>
            Object.fromEntries(
              call.output.map((x, i) => [
                chainNegativeInterestStrategies[i].toLowerCase(),
                x.output / 100,
              ])
            )
          ),
      ]
    )
  ).then(Object.fromEntries);

const getBaseStargateLpStrategyFees = (baseStargateLpStrategies) =>
  Promise.all(
    Object.entries(baseStargateLpStrategies).map(
      async ([chain, chainBaseStargateLpStrategies]) => [
        chain,
        await sdk.api.abi
          .multiCall({
            abi: BASE_STARGATE_LP_STRATEGY.find(
              (abi) => abi.name === 'feePercent'
            ),
            calls: chainBaseStargateLpStrategies.map(
              (baseStargateLpStrategy) => ({
                target: baseStargateLpStrategy,
              })
            ),
            chain,
            requery: true,
          })
          .then((call) =>
            Object.fromEntries(
              call.output.map((x, i) => [
                chainBaseStargateLpStrategies[i].toLowerCase(),
                x.output / 100,
              ])
            )
          ),
      ]
    )
  ).then(Object.fromEntries);

const getFeeCollectableStrategyFees = (feeCollectableStrategies) =>
  Promise.all(
    Object.entries(feeCollectableStrategies).map(
      async ([chain, chainFeeCollectableStrategies]) => [
        chain,
        await sdk.api.abi
          .multiCall({
            abi: FEE_COLLECTABLE_STRATEGY.find(
              ({ name }) => name === 'feeBips'
            ),
            calls: chainFeeCollectableStrategies.map(
              (feeCollectableStrategy) => ({
                target: feeCollectableStrategy,
              })
            ),
            chain,
            requery: true,
          })
          .then((call) =>
            Object.fromEntries(
              call.output.map((x, i) => [
                chainFeeCollectableStrategies[i].toLowerCase(),
                x.output / 10000,
              ])
            )
          ),
      ]
    )
  ).then(Object.fromEntries);


const getDetailsFromCollaterals = (collaterals, abi) =>
  Promise.all(
    Object.entries(collaterals).map(async ([chain, chainCollaterals]) => {
      const chainCollateralEntries = Object.entries(chainCollaterals);

      return [
        chain,
        await sdk.api.abi
          .multiCall({
            abi,
            calls: chainCollateralEntries.map(([_, collateral]) => ({
              target: collateral,
            })),
            chain,
            requery: true,
          })
          .then((call) =>
            Object.fromEntries(
              call.output.map((x, i) => [
                chainCollateralEntries[i][0].toLowerCase(),
                x.output,
              ])
            )
          ),
      ];
    })
  ).then(Object.fromEntries);

const marketInfoToPool = (chain, marketInfo, collateral, pricesObj) => {
  // Use price from pricesObj, but fallback to cauldron oracle price
  const collateralPrice = pricesObj.pricesByAddress[
    collateral.address.toLowerCase()
  ]
    ? pricesObj.pricesByAddress[collateral.address.toLowerCase()]
    : 1 / formatUnits(marketInfo.oracleExchangeRate, collateral.decimals);
  const mimPrice = pricesObj.pricesByAddress[MIM_COINGECKO_ID];

  const totalSupplyUsd =
    formatUnits(marketInfo.totalCollateral.amount, collateral.decimals) *
    collateralPrice;
  const totalBorrowUsd = formatEther(marketInfo.totalBorrowed) * mimPrice;
  const availableToBorrowUsd =
    formatEther(marketInfo.marketMaxBorrow) * mimPrice;
  const debtCeilingUsd = totalBorrowUsd + availableToBorrowUsd;

  const apyBaseBorrow = marketInfo.interestPerYear / 100;
  const ltv = marketInfo.maximumCollateralRatio / 10000;

  const pool = {
    pool: `${marketInfo.cauldron}-${chain}`,
    chain: utils.formatChain(chain),
    symbol: utils.formatSymbol(collateral.symbol),
    tvlUsd: totalSupplyUsd,
    apyBaseBorrow,
    totalSupplyUsd,
    totalBorrowUsd,
    ltv,
    debtCeilingUsd,
    mintedCoin: 'MIM',
  };

  if (collateral.apyBase !== undefined) {
    pool.apyBase = collateral.apyBase;
  } else {
    pool.apy = 0;
  }

  if (marketInfo.cauldronMeta !== undefined) {
    pool.poolMeta = marketInfo.cauldronMeta;
  }

  return pool;
};

const poolsApy = async () =>
  (await superagent.get('https://yields.llama.fi/pools')).body.data;

const getApy = async () => {
  const collateralsPromise = getCauldronDetails(POOLS, 'collateral');
  const bentoboxesPromise = getCauldronDetails(POOLS, 'bentoBox');
  const [
    marketInfos,
    collaterals,
    bentoboxes,
    strategies,
    negativeInterestStrategyApys,
    strategyFees,
    symbols,
    decimals,
    pricesObj,
    apyObj,
  ] = await Promise.all([
    getMarketInfos(POOLS),
    collateralsPromise,
    bentoboxesPromise,
    Promise.all([collateralsPromise, bentoboxesPromise]).then(
      ([collaterals, bentoboxes]) => getStrategies(collaterals, bentoboxes)
    ),
    getNegativeInterestStrategyApy(NEGATIVE_INTEREST_STRATEGIES),
    Promise.all([
      getBaseStargateLpStrategyFees(BASE_STARGATE_LP_STRATEGIES),
      getFeeCollectableStrategyFees(FEE_COLLECTABLE_STRATEGIES),
    ]).then((strategyFeesArr) => _.merge({}, ...strategyFeesArr)),
    collateralsPromise.then((collaterals) =>
      getDetailsFromCollaterals(collaterals, 'erc20:symbol')
    ),
    collateralsPromise.then((collaterals) =>
      getDetailsFromCollaterals(collaterals, 'erc20:decimals')
    ),
    collateralsPromise.then((collaterals) => {
      const coins = Object.entries(collaterals).flatMap(
        ([chain, chainCollaterals]) =>
          Object.values(chainCollaterals).map(
            (collateral) => `${chain}:${collateral}`
          )
      );

      return utils.getPrices([`coingecko:${MIM_COINGECKO_ID}`, ...coins]);
    }),
    poolsApy(),
  ]);

  return Object.entries(marketInfos).flatMap(([chain, chainMarketInfos]) =>
    chainMarketInfos.map((marketInfo) => {
      const collateralAddress =
        collaterals[chain][marketInfo.cauldron.toLowerCase()].toLowerCase();
      const bentobox =
        bentoboxes[chain][marketInfo.cauldron.toLowerCase()].toLowerCase();
      const collateral = {
        address: collateralAddress,
        symbol: symbols[chain][marketInfo.cauldron.toLowerCase()],
        decimals: decimals[chain][marketInfo.cauldron.toLowerCase()],
      };

      // Add negative strategy APY to collateral if there's one for the cauldron
      const strategyDetails = _.get(strategies, [
        chain,
        collateralAddress,
        bentobox,
      ]);
      const collateralApy =
        marketInfo.collateralPoolId !== undefined
          ? _.find(apyObj, { pool: marketInfo.collateralPoolId })
          : undefined;
      if (strategyDetails !== undefined) {
        const strategy = strategyDetails.address.toLowerCase();
        const targetPercentage = strategyDetails.strategyData.targetPercentage;
        const negativeInterestStrategyApy = _.get(
          negativeInterestStrategyApys,
          [chain, strategy]
        );
        const strategyFee = _.get(strategyFees, [
          chain,
          strategy,
        ]);
        if (negativeInterestStrategyApy !== undefined) {
          collateral.apyBase =
            (targetPercentage / 100) * -negativeInterestStrategyApy;
        } else if (
          strategyFee !== undefined &&
          collateralApy !== undefined
        ) {
          collateral.apyBase =
            ((collateralApy.apy * targetPercentage) / 100) *
            (1 - strategyFee);
        }
      } else {
        // No strategy to consider, so just use the apy from the pool if one exists.
        if (collateralApy) {
          collateral.apyBase = collateralApy.apy;
        }
      }

      return {
        ...marketInfoToPool(chain, marketInfo, collateral, pricesObj),
        project: 'abracadabra',
      };
    })
  );
};

module.exports = getApy;
