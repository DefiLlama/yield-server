const utils = require('../utils');

const fetch = require('node-fetch');
const { TonClient } = require('@ton/ton');
const { Address, Cell, Slice, Dictionary, beginCell } = require('@ton/core');
const { signVerify } = require('@ton/crypto');
const crypto = require('crypto');
const getPrices = require('./getPrices');
const { getDistributions, calculateRewardApy } = require('./rewardApy');
const { tokens } = require('../across/constants')

function sha256Hash(input) {
  const hash = crypto.createHash('sha256');
  hash.update(input);
  const hashBuffer = hash.digest();
  const hashHex = hashBuffer.toString('hex');
  return BigInt('0x' + hashHex);
}

function bufferToBigInt(buffer, start = 0, end = buffer.length) {
  console.log(buffer);
  const bufferAsHexString = buffer.subarray(start, end).toString('hex');
  return BigInt(`0x${bufferAsHexString}`);
}

const assetsMAIN = {
  TON: {
    assetId: sha256Hash('TON'),
    token: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
  },
  jUSDT: {
    assetId: sha256Hash('jUSDT'),
    token: 'EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA',
  },
  USDT: {
    assetId: sha256Hash('USDT'),
    token: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
  },
  jUSDC: {
    assetId: sha256Hash('jUSDC'),
    token: 'EQB-MPwrd1G6WKNkLz_VnV6WqBDd142KMQv-g1O-8QUA3728',
  },
  stTON: {
    assetId: sha256Hash('stTON'),
    token: 'EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k',
  },
  tsTON: {
    assetId: sha256Hash('tsTON'),
    token: 'EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav',
  },
  USDe: {
    assetId: sha256Hash('USDe'),
    token: 'EQAIb6KmdfdDR7CN1GBqVJuP25iCnLKCvBlJ07Evuu2dzP5f',
  },
  tsUSDe: {
    assetId: sha256Hash('tsUSDe'),
    token: 'EQDQ5UUyPHrLcQJlPAczd_fjxn8SLrlNQwolBznxCdSlfQwr',
  },
};

const assetsLP = {
  TON: {
    assetId: sha256Hash('TON'),
    token: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
  },
  USDT: {
    assetId: sha256Hash('USDT'),
    token: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
  },
  'USDT_STORM': {
    assetId: sha256Hash('USDT_STORM'),
    token: 'EQCup4xxCulCcNwmOocM9HtDYPU8xe0449tQLp6a-5BLEegW',
  },
  'TONUSDT_DEDUST': {
    assetId: sha256Hash('TONUSDT_DEDUST'),
    token: 'EQA-X_yo3fzzbDbJ_0bzFWKqtRuZFIRa1sJsveZJ1YpViO3r',
  },
  'TON_STORM': {
    assetId: sha256Hash('TON_STORM'),
    token: 'EQCNY2AQ3ZDYwJAqx_nzl9i9Xhd_Ex7izKJM6JTxXRnO6n1F',
  },
};

const assetsALTS = {
  TON: {
    assetId: sha256Hash('TON'),
    token: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
  },
  USDT: {
    assetId: sha256Hash('USDT'),
    token: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
  },
  NOT: {
    assetId: sha256Hash('NOT'),
    token: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT',
  },
  DOGS: {
    assetId: sha256Hash('DOGS'),
    token: 'EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS',
  },
  CATI: {
    assetId: sha256Hash('CATI'),
    token: 'EQD-cvR0Nz6XAyRBvbhz-abTrRC6sI5tvHvvpeQraV9UAAD7',
  },
};

const assetsSTABLE = {
  USDT: {
    assetId: sha256Hash('USDT'),
    token: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
  },
  USDe: {
    assetId: sha256Hash('USDe'),
    token: 'EQAIb6KmdfdDR7CN1GBqVJuP25iCnLKCvBlJ07Evuu2dzP5f',
  },
  tsUSDe: {
    assetId: sha256Hash('tsUSDe'),
    token: 'EQDQ5UUyPHrLcQJlPAczd_fjxn8SLrlNQwolBznxCdSlfQwr',
  },
  PT_tsUSDe_01Sep2025: {
    assetId: sha256Hash('PT_tsUSDe_01Sep2025'),
    token: 'EQDb90Bss5FnIyq7VMmnG2UeZIzZomQsILw9Hjo1wxaF1df3',
  },
};

function findAssetKeyByBigIntId(searchAssetId, assets) {
    return Object.entries(assets).find(([key, value]) => 
        BigInt(value.assetId) === searchAssetId
    )?.[0];
}

const MASTER_CONSTANTS = {
  FACTOR_SCALE: BigInt(1e12),
  ASSET_COEFFICIENT_SCALE: 10000n,
  ASSET_PRICE_SCALE: BigInt(1e8),
  ASSET_RESERVE_FACTOR_SCALE: 10000n,
  ASSET_LIQUIDATION_RESERVE_FACTOR_SCALE: 10000n,
  ASSET_ORIGINATION_FEE_SCALE: BigInt(1e9),
};

function createAssetsIdDict(assets) {
    const ASSETS_ID = {};
    for (const key in assets) {
        ASSETS_ID[key] = assets[key].assetId;
    }
    return ASSETS_ID;
}

class MyCell extends Cell {
  toString() {
    return this.hashBigInt().toString();
  }

  hashBigInt() {
    return BigInt('0x' + this.hash().toString('hex'));
  }
}

function mulFactor(decimal, a, b) {
  return (a * b) / decimal;
}

function mulDiv(x, y, z) {
  return (x * y) / z;
}

function createAssetData() {
    return {
        serialize: (src, builder) => {
            builder.storeUint(src.sRate, 64);
            builder.storeUint(src.bRate, 64);
            builder.storeUint(src.totalSupply, 64);
            builder.storeUint(src.totalBorrow, 64);
            builder.storeUint(src.lastAccural, 32);
            builder.storeUint(src.balance, 64);
        },
        parse: (src) => {
            const sRate = BigInt(src.loadInt(64));
            const bRate = BigInt(src.loadInt(64));
            const totalSupply = BigInt(src.loadInt(64));
            const totalBorrow = BigInt(src.loadInt(64));
            const lastAccural = BigInt(src.loadInt(32));
            const balance = BigInt(src.loadInt(64));

            return {
              sRate,
              bRate,
              totalSupply,
              totalBorrow,
              lastAccural,
              balance
            };
        },
    };
}

function createAssetConfig() {
  return {
    serialize: (src, builder) => {
      builder.storeUint(src.oracle, 256);
      builder.storeUint(src.decimals, 8);
      const refBuild = beginCell();
      refBuild.storeUint(src.collateralFactor, 16);
      refBuild.storeUint(src.liquidationThreshold, 16);
      refBuild.storeUint(src.liquidationBonus, 16);
      refBuild.storeUint(src.baseBorrowRate, 64);
      refBuild.storeUint(src.borrowRateSlopeLow, 64);
      refBuild.storeUint(src.borrowRateSlopeHigh, 64);
      refBuild.storeUint(src.supplyRateSlopeLow, 64);
      refBuild.storeUint(src.supplyRateSlopeHigh, 64);
      refBuild.storeUint(src.targetUtilization, 64);
      refBuild.storeUint(src.originationFee, 64);
      refBuild.storeUint(src.dust, 64);
      refBuild.storeUint(src.maxTotalSupply, 64);
      refBuild.storeUint(src.reserveFactor, 16);
      refBuild.storeUint(src.liquidationReserveFactor, 16);
      builder.storeRef(refBuild.endCell());
    },
    parse: (src) => {
      const oracle = src.loadUintBig(256);
      const decimals = BigInt(src.loadUint(8));
      const ref = src.loadRef().beginParse();
      const collateralFactor = ref.loadUintBig(16);
      const liquidationThreshold = ref.loadUintBig(16);
      const liquidationBonus = ref.loadUintBig(16);
      const baseBorrowRate = ref.loadUintBig(64);
      const borrowRateSlopeLow = ref.loadUintBig(64);
      const borrowRateSlopeHigh = ref.loadUintBig(64);
      const supplyRateSlopeLow = ref.loadUintBig(64);
      const supplyRateSlopeHigh = ref.loadUintBig(64);
      const targetUtilization = ref.loadUintBig(64);
      const originationFee = ref.loadUintBig(64);
      const dust = ref.loadUintBig(64);
      const maxTotalSupply = ref.loadUintBig(64);
      const reserveFactor = ref.loadUintBig(16);
      const liquidationReserveFactor = ref.loadUintBig(16);

      return {
        oracle,
        decimals,
        collateralFactor,
        liquidationThreshold,
        liquidationBonus,
        baseBorrowRate,
        borrowRateSlopeLow,
        borrowRateSlopeHigh,
        supplyRateSlopeLow,
        supplyRateSlopeHigh,
        targetUtilization,
        originationFee,
        dust,
        maxTotalSupply,
        reserveFactor,
        liquidationReserveFactor,
      };
    },
  };
}

function loadMaybeMyRef(slice) {
  const cell = slice.loadMaybeRef();
  if (cell === null) {
    return null;
  }
  return new MyCell({
    exotic: cell.isExotic,
    bits: cell.bits,
    refs: cell.refs,
  });
}

function loadMyRef(slice) {
  const cell = slice.loadRef();
  return new MyCell({
    exotic: cell.isExotic,
    bits: cell.bits,
    refs: cell.refs,
  });
}

function parseMasterData(masterDataBOC, assets) {
  const ASSETS_ID = createAssetsIdDict(assets);
  const masterSlice = Cell.fromBase64(masterDataBOC).beginParse();
  const meta = masterSlice.loadRef().beginParse().loadStringTail();
  const upgradeConfigParser = masterSlice.loadRef().beginParse();

  const upgradeConfig = {
      masterCodeVersion: Number(upgradeConfigParser.loadCoins()),
      userCodeVersion: Number(upgradeConfigParser.loadCoins()),
      timeout: upgradeConfigParser.loadUint(32),
      updateTime: upgradeConfigParser.loadUint(64),
      freezeTime: upgradeConfigParser.loadUint(64),
      userCode: loadMyRef(upgradeConfigParser),
      newMasterCode: loadMaybeMyRef(upgradeConfigParser),
      newUserCode: loadMaybeMyRef(upgradeConfigParser),
  };

  const masterConfigSlice = masterSlice.loadRef().beginParse();
  const assetsConfigDict = masterConfigSlice.loadDict(Dictionary.Keys.BigUint(256), createAssetConfig());
  const assetsDataDict = masterSlice.loadDict(Dictionary.Keys.BigUint(256), createAssetData());

  const assetsExtendedData = Dictionary.empty();
  const assetsReserves = Dictionary.empty();
  const apy = {
      supply: Dictionary.empty(),
      borrow: Dictionary.empty(),
  };
  
  for (const [_, assetId] of Object.entries(ASSETS_ID)) {
    const assetData = calculateAssetData(
      assetsConfigDict,
      assetsDataDict,
      assetId,
      MASTER_CONSTANTS
    );
    assetsExtendedData.set(assetId, assetData);
  }
  const masterConfig = {
      ifActive: masterConfigSlice.loadInt(8),
      admin: masterConfigSlice.loadAddress(),
      oraclesInfo:  {
          numOracles: masterConfigSlice.loadUint(16),
          threshold: masterConfigSlice.loadUint(16),
          oracles: loadMaybeMyRef(masterConfigSlice)
      },
      tokenKeys: loadMaybeMyRef(masterConfigSlice),
  };
  // dont call endParse() here: contract may append fields later
  // only parse the fields we need and ignore any trailing data

  for (const [_, assetId] of Object.entries(ASSETS_ID)) {
    const assetData = assetsExtendedData.get(assetId);
    const totalSupply = calculatePresentValue(
      assetData.sRate,
      assetData.totalSupply,
      MASTER_CONSTANTS
    );
    const totalBorrow = calculatePresentValue(
      assetData.bRate,
      assetData.totalBorrow,
      MASTER_CONSTANTS
    );
    assetsReserves.set(assetId, assetData.balance - totalSupply + totalBorrow);

    apy.supply.set(
      assetId,
      (1 + (Number(assetData.supplyInterest) / 1e12) * 24 * 3600) ** 365 - 1
    );
    apy.borrow.set(
      assetId,
      (1 + (Number(assetData.borrowInterest) / 1e12) * 24 * 3600) ** 365 - 1
    );
  }

  return {
    assetsConfig: assetsConfigDict,
    assetsData: assetsExtendedData,
    assetsReserves: assetsReserves,
    apy: apy,
  };
}

function calculateAssetData(assetsConfigDict, assetsDataDict, assetId) {
  const config = assetsConfigDict.get(assetId);
  const data = assetsDataDict.get(assetId);

  if (!data || !config) {
    throw new Error('Asset Data or Config is not accessible');
  }

  const { sRate, bRate, supplyInterest, borrowInterest, now } =
    calculateCurrentRates(config, data);
  data.sRate = sRate || 0n;
  data.bRate = bRate || 0n;
  data.lastAccural = now;

  const supplyApy =
    (1 + (Number(supplyInterest) / 1e12) * 24 * 3600) ** 365 - 1;
  const borrowApy =
    (1 + (Number(borrowInterest) / 1e12) * 24 * 3600) ** 365 - 1;

  return {
    ...data,
    ...{ supplyInterest, borrowInterest },
    ...{ supplyApy, borrowApy },
  };
}

function calculateAssetInterest(assetConfig, assetData) {
  const totalSupply = calculatePresentValue(
    assetData.sRate,
    assetData.totalSupply
  );
  const totalBorrow = calculatePresentValue(
    assetData.bRate,
    assetData.totalBorrow
  );
  let utilization = 0n;
  let supplyInterest = 0n;
  let borrowInterest = 0n;

  if (totalSupply !== 0n) {
    utilization = (totalBorrow * MASTER_CONSTANTS.FACTOR_SCALE) / totalSupply;
  }

  if (utilization <= assetConfig.targetUtilization) {
    borrowInterest =
      assetConfig.baseBorrowRate +
      mulFactor(
        MASTER_CONSTANTS.FACTOR_SCALE,
        assetConfig.borrowRateSlopeLow,
        utilization
      );
  } else {
    borrowInterest =
      assetConfig.baseBorrowRate +
      mulFactor(
        MASTER_CONSTANTS.FACTOR_SCALE,
        assetConfig.borrowRateSlopeLow,
        assetConfig.targetUtilization
      ) +
      mulFactor(
        MASTER_CONSTANTS.FACTOR_SCALE,
        assetConfig.borrowRateSlopeHigh,
        utilization - assetConfig.targetUtilization
      );
  }

  supplyInterest = mulDiv(
    mulDiv(borrowInterest, utilization, MASTER_CONSTANTS.FACTOR_SCALE),
    MASTER_CONSTANTS.ASSET_RESERVE_FACTOR_SCALE - assetConfig.reserveFactor,
    MASTER_CONSTANTS.ASSET_RESERVE_FACTOR_SCALE
  );

  return {
    supplyInterest,
    borrowInterest,
  };
}

function calculateCurrentRates(assetConfig, assetData) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timeElapsed = now - assetData.lastAccural;
  const { supplyInterest, borrowInterest } = calculateAssetInterest(
    assetConfig,
    assetData
  );

  if (timeElapsed > 0) {
    const updatedSRate =
      assetData.sRate +
      mulFactor(
        MASTER_CONSTANTS.FACTOR_SCALE,
        assetData.sRate,
        supplyInterest * timeElapsed
      );
    const updatedBRate =
      assetData.bRate +
      mulFactor(
        MASTER_CONSTANTS.FACTOR_SCALE,
        assetData.bRate,
        borrowInterest * timeElapsed
      );
    return {
      sRate: updatedSRate,
      bRate: updatedBRate,
      supplyInterest,
      borrowInterest,
      now,
    };
  }

  return {
    sRate: assetData.sRate,
    bRate: assetData.bRate,
    supplyInterest,
    borrowInterest,
    now,
  };
}


const priceScaleFactor = BigInt(1e9);

function calculatePresentValue(index, principalValue) {
  return (principalValue * index) / MASTER_CONSTANTS.FACTOR_SCALE;
}

async function getContractStateWithRetry(client, address, maxRetries = 3, initialDelay = 500) {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      return await client.getContractState(address);
    } catch (err) {
      if (err.message?.includes('429') || err.code === 429) {
        attempts++;
        const delay = initialDelay * 2 ** (attempts - 1);
        console.warn(
          `Rate limit (429) encountered. Retrying in ${delay} ms... (attempt ${attempts} of ${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }

  throw new Error(`Max retries (${maxRetries}) exceeded while getting contract state for address ${address}.`);
}


const getApy = async () => {
  console.log('Requesting prices');
  let prices = await getPrices();
  let distributions = await getDistributions();
  const client = new TonClient({
    endpoint: 'https://toncenter.com/api/v2/jsonRPC',
  });

    const poolData = await Promise.all([
      getPoolData(
        'EQC8rUZqR_pWV1BylWUlPNBzyiTYVoBEmQkMIQDZXICfnuRr',
        assetsMAIN,
        'Main',
        prices,
        distributions,
        client
      ),
      getPoolData(
        'EQBIlZX2URWkXCSg3QF2MJZU-wC5XkBoLww-hdWk2G37Jc6N',
        assetsLP,
        'LP',
        prices,
        distributions,
        client
      ),
      getPoolData(
        'EQANURVS3fhBO9bivig34iyJQi97FhMbpivo1aUEAS2GYSu-',
        assetsALTS,
        'Alts',
        prices,
        distributions,
        client
      ),
      getPoolData(
        'EQCdIdXf1kA_2Hd9mbGzSFDEPA-Px-et8qTWHEXgRGo0K3zd',
        assetsSTABLE,
        'Stable',
        prices,
        distributions,
        client
      ),
    ]);

    return poolData.flat().filter((pool) => pool !== undefined);
};

async function getPoolData(
  masterAddress,
  assets,
  poolName,
  prices,
  distributions,
  client
) {
    let data;
    try {
        const result = await getContractStateWithRetry(
            client,
            Address.parse(masterAddress),
            5, // maxRetries
            500 // initialDelay in ms
        );
        if (!result?.data) {
            throw new Error('Master data not found');
        }

        data = parseMasterData(result.data.toString('base64'), assets);
    } catch (error) {
        console.error('getPoolData error:', error);
        return [];
    }

    const rewardApys = calculateRewardApy(distributions, poolName, data, prices);

    return Object.entries(assets).map(([tokenSymbol, asset]) => {
        const { assetId, token } = asset;
        
        console.log(poolName, 'Process symbol', tokenSymbol, asset, assetId, token);

        const priceData = prices.dict.get(assetId);
        if (!priceData) {
            console.warn(`No price data available for ${tokenSymbol}, skipping...`);
            return undefined;
        }

        const assetConfig = data.assetsConfig.get(assetId);
        const assetData = data.assetsData.get(assetId);
        if (!assetConfig || !assetData) {
            console.warn(`Missing config or data for ${tokenSymbol}, skipping...`);
            return undefined;
        }

        const price = Number(priceData) / Number(priceScaleFactor);
        if (!price) {
            console.warn(`Invalid price for ${tokenSymbol}, skipping...`);
            return undefined;
        }

        const scaleFactor = 10 ** Number(assetConfig.decimals);
        const totalSupplyNum = Number(
            calculatePresentValue(assetData.sRate, assetData.totalSupply)
        );
        const totalBorrowNum = Number(
            calculatePresentValue(assetData.bRate, assetData.totalBorrow)
        );

        const totalSupplyUsd = (totalSupplyNum * price) / scaleFactor;
        const totalBorrowUsd = (totalBorrowNum * price) / scaleFactor;

        console.log(poolName, tokenSymbol, 'totalSupplyInUsd', totalSupplyUsd);
        console.log(poolName, tokenSymbol, 'totalBorrowInUsd', totalBorrowUsd);

        const supplyApy = (1 + (Number(assetData.supplyInterest) / 1e12) * 86400) ** 365 - 1;
        const borrowApy = (1 + (Number(assetData.borrowInterest) / 1e12) * 86400) ** 365 - 1;

        console.log(poolName, tokenSymbol, 'supplyApy', supplyApy * 100);
        console.log(poolName, tokenSymbol, 'borrowApy', borrowApy * 100);

        const apyRewardData = rewardApys.find(
            (r) =>
                BigInt(r.rewardingAssetId) === BigInt(assetId) &&
                r.rewardType.toLowerCase() === 'supply'
        );
        const apyReward = apyRewardData?.apy;
        const rewardTokensSupply = apyRewardData
            ? [
                assets[findAssetKeyByBigIntId(apyRewardData.rewardsAssetId, assets)]
                    ?.token,
                ].filter(Boolean)
            : [];

        console.log(
            poolName,
            tokenSymbol,
            'apyReward',
            apyReward,
            'rewardTokensSupply',
            rewardTokensSupply
        );

        const apyRewardBorrowData = rewardApys.find(
            (r) =>
                BigInt(r.rewardingAssetId) === BigInt(assetId) &&
                r.rewardType.toLowerCase() === 'borrow'
        );
        const apyRewardBorrow = apyRewardBorrowData?.apy;
        const rewardTokensBorrow = apyRewardBorrowData
            ? [
                assets[
                    findAssetKeyByBigIntId(apyRewardBorrowData.rewardsAssetId, assets)
                ]?.token,
                ].filter(Boolean)
            : [];

        console.log(
            poolName,
            tokenSymbol,
            'apyRewardBorrow',
            apyRewardBorrow,
            'rewardTokensBorrow',
            rewardTokensBorrow
        );

    return {
      pool: `evaa-${assetId}-${poolName}-ton`.toLowerCase(),
      chain: 'Ton',
      project: 'evaa-protocol',
      symbol: tokenSymbol,
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: supplyApy * 100,
      apyReward,
      rewardTokens: [
        ...new Set([...rewardTokensSupply, ...rewardTokensBorrow]),
      ],
      apyBaseBorrow: borrowApy * 100,
      apyRewardBorrow,
      underlyingTokens: [token],
      url: `https://app.evaa.finance/token/${tokenSymbol}?pool=${poolName}`,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow: borrowApy * 100,
      ltv: Number(assetConfig.collateralFactor) / 10000,
      poolMeta: poolName
    };
  });
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://evaa.finance/',
};
