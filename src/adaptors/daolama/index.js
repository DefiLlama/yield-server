const { TonClient } = require('@ton/ton');
const { Address, Cell, Slice, Dictionary, beginCell } = require('@ton/core');
const utils = require('../utils');
const PROTOCOL_FEE_BITS = 16;
const PROTOCOL_FEE_BASE = 1000;

function parseAssetConfig(assetConfigCell) {
    const assetConfigSlice = assetConfigCell.beginParse();

    return {
        supplyAmountMax: assetConfigSlice.loadCoins(),
        protocolFee: assetConfigSlice.loadUint(PROTOCOL_FEE_BITS) / PROTOCOL_FEE_BASE,
    }
}

function parsePoolData(dataBOC) {
    const dataSlice = Cell.fromBase64(dataBOC).beginParse();

    dataSlice.loadRef()
    const { protocolFee: protocolFeeRate, supplyAmountMax } = parseAssetConfig(dataSlice.loadRef());
    const halted = dataSlice.loadBit();
    const balance = dataSlice.loadCoins();
    const borrowed = dataSlice.loadCoins();
    const lpJettonSupply = dataSlice.loadCoins();
    return {
        halted,
        balance,
        borrowed,
        lpJettonSupply,
        protocolFeeRate,
        supplyAmountMax,
    }
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

async function getPoolData(
    client,
    poolAddress,
    token,
    tokenSymbol,
    price,
    scale,
    poolName,
    borrowRate
) {
    let data;
    try {
        const result = await getContractStateWithRetry(
            client,
            Address.parse(poolAddress),
            5, // maxRetries
            500 // initialDelay in ms
        );
        if (!result?.data) {
            throw new Error('Master data not found');
        }

        data = parsePoolData(result.data.toString('base64'));
    } catch (error) {
        console.error('getPoolData error:', error);
        return;
    }

    const totalSupply = Number(data.balance + data.borrowed) / scale;
    const totalBorrow = Number(data.borrowed) / scale;
    const totalSupplyUsd = (totalSupply * price);
    const totalBorrowUsd = (totalBorrow * price);
    const utilization =  totalSupply > 0 ? totalBorrow / totalSupply : 0;
    const supplyRate = borrowRate * utilization * (1 - data.protocolFeeRate);
    const supplyApy = (1 + supplyRate) ** 365 - 1;
    const borrowApy = (1 + borrowRate) ** 365 - 1;

    console.log(poolName, tokenSymbol, 'totalSupplyInUsd', totalSupplyUsd);
    console.log(poolName, tokenSymbol, 'totalBorrowInUsd', totalBorrowUsd);
    console.log(poolName, tokenSymbol, 'supplyApy', supplyApy * 100);
    console.log(poolName, tokenSymbol, 'borrowApy', borrowApy * 100);

    return {
      pool: `daolama-${poolAddress}-${poolName}-ton`.toLowerCase(),
      chain: 'Ton',
      project: 'daolama',
      symbol: tokenSymbol,
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: supplyApy * 100,
      apyBaseBorrow: borrowApy * 100,
      underlyingTokens: [token],
      totalSupplyUsd,
      totalBorrowUsd,
      poolMeta: poolName,
      url: `https://app.daolama.co/yield`,
    };
}

async function getApy() {
    const TON = 'ton:EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
    const price = async (token) => (await utils.getData(`https://coins.llama.fi/prices/current/${token}`)).coins[token].price;
    const tonPrice = await price(TON);
    const borrowRate = (await utils.getData('https://api.daolama.co/api/v1/analytics/borrowed/rate')).value;
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
    });

    const poolData = await Promise.all([
      getPoolData(
        client,
        'EQCkeTvOSTBwBtP06X2BX7THj_dlX67PhgYRGuKfjWtB9FVb',
        'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
        'TON',
        tonPrice,
        1e9,
        'Main',
        borrowRate,
      ),
    ]);

    return poolData.filter((pool) => pool !== undefined);
}

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://daolama.co/',
};