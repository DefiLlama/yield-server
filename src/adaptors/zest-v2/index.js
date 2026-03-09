const axios = require('axios');
const {
  callReadOnlyFunction,
  contractPrincipalCV,
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

const DEPLOYER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7';

const POOLS = [
  {
    symbol: 'STX',
    vaultContract: 'v0-vault-stx',
    assetAddress: 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7',
    contractName: 'wstx',
    decimals: 6,
    priceKeys: ['coingecko:blockstack'],
  },
  {
    symbol: 'sBTC',
    vaultContract: 'v0-vault-sbtc',
    assetAddress: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4',
    contractName: 'sbtc-token',
    decimals: 8,
    priceKeys: [
      'stacks:SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
      'coingecko:bitcoin',
    ],
  },
  {
    symbol: 'stSTX',
    vaultContract: 'v0-vault-ststx',
    assetAddress: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG',
    contractName: 'ststx-token',
    decimals: 6,
    priceKeys: [
      'stacks:SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
      'coingecko:blockstack',
    ],
  },
  {
    symbol: 'USDC',
    vaultContract: 'v0-vault-usdc',
    assetAddress: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE',
    contractName: 'usdcx',
    decimals: 6,
    priceKeys: [
      'stacks:SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
      'coingecko:usd-coin',
    ],
  },
  {
    symbol: 'USDH',
    vaultContract: 'v0-vault-usdh',
    assetAddress: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG',
    contractName: 'usdh-token-v1',
    decimals: 8,
    priceKeys: [
      'stacks:SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
      'coingecko:usd-coin',
    ],
  },
  {
    symbol: 'stSTXbtc',
    vaultContract: 'v0-vault-ststxbtc',
    assetAddress: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG',
    contractName: 'ststxbtc-token-v2',
    decimals: 6,
    priceKeys: [
      'stacks:SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2',
      'coingecko:blockstack',
    ],
  },
];

async function fetchPrices() {
  const keys = [...new Set(POOLS.flatMap((p) => p.priceKeys))].join(',');
  const url = `https://coins.llama.fi/prices/current/${keys}`;
  const { data } = await axios.get(url);
  return data.coins;
}

function getPrice(prices, priceKeys) {
  for (const key of priceKeys) {
    if (prices[key]?.price) return { price: prices[key].price, key };
  }
  return null;
}

async function fetchApys(pool, network) {
  const result = await callReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName: 'v0-1-data',
    functionName: 'get-asset-apys',
    network,
    functionArgs: [
      contractPrincipalCV(pool.assetAddress, pool.contractName),
    ],
    senderAddress: DEPLOYER,
  });

  const tupleData = result.value.data;
  const supplyApy = Number(tupleData['supply-apy'].value) / 100;
  const borrowApy = Number(tupleData['borrow-apy'].value) / 100;

  return { supplyApy, borrowApy };
}

async function fetchTotalAssets(pool, network) {
  const result = await callReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName: pool.vaultContract,
    functionName: 'get-total-assets',
    network,
    functionArgs: [],
    senderAddress: DEPLOYER,
  });

  const rawAmount = Number(result.value.value);
  return rawAmount / Math.pow(10, pool.decimals);
}

async function getZestV2Pools() {
  try {
    const network = new StacksMainnet();
    const chain = 'Stacks';

    const prices = await fetchPrices();

    const results = [];

    for (const pool of POOLS) {
      try {
        const priceResult = getPrice(prices, pool.priceKeys);
        if (!priceResult) {
          console.log(`Skipping ${pool.symbol}: price not available`);
          continue;
        }

        const [apys, totalAssets] = await Promise.all([
          fetchApys(pool, network),
          fetchTotalAssets(pool, network),
        ]);

        const tvlUsd = totalAssets * priceResult.price;

        results.push({
          pool: `${DEPLOYER}.${pool.vaultContract}-${chain}`.toLowerCase(),
          chain: chain,
          project: 'zest-v2',
          symbol: pool.symbol,
          tvlUsd: tvlUsd,
          apyBase: apys.supplyApy,
          apyBaseBorrow: apys.borrowApy,
          underlyingTokens: [priceResult.key],
          url: 'https://app.zestprotocol.com/market/main',
        });
      } catch (error) {
        console.log(`Error processing pool ${pool.symbol}: ${error.message}`);
      }
    }

    return results;
  } catch (error) {
    console.log(`Error in getZestV2Pools: ${error.message}`);
    return [];
  }
}

module.exports = {
  timetravel: false,
  apy: getZestV2Pools,
  url: 'https://app.zestprotocol.com/market/main',
};
