const axios = require('axios');
const { getPriceApiUrl } = require('../utils');
const {
  callReadOnlyFunction,
  contractPrincipalCV,
  cvToValue,
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

const DEPLOYER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7';
const DATA_READER = 'v0-5-data';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const CHAIN = 'Stacks';
const URL = 'https://app.zestprotocol.com/market/main';

const POOLS = [
  {
    symbol: 'STX',
    vaultContract: 'v0-vault-stx',
    underlying: `${DEPLOYER}.wstx`,
    decimals: 6,
    priceKeys: ['coingecko:blockstack'],
  },
  {
    symbol: 'sBTC',
    vaultContract: 'v0-vault-sbtc',
    underlying: SBTC,
    decimals: 8,
    priceKeys: [`stacks:${SBTC}`, 'coingecko:bitcoin'],
  },
  {
    symbol: 'stSTX',
    vaultContract: 'v0-vault-ststx',
    underlying: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
    decimals: 6,
    priceKeys: [
      'stacks:SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
      'coingecko:blockstack',
    ],
  },
  {
    symbol: 'USDCx',
    vaultContract: 'v0-vault-usdc',
    underlying: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
    decimals: 6,
    priceKeys: [
      'stacks:SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
      'coingecko:usd-coin',
    ],
  },
  {
    symbol: 'USDh',
    vaultContract: 'v0-vault-usdh',
    underlying: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
    decimals: 8,
    priceKeys: [
      'stacks:SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
      'coingecko:usd-coin',
    ],
  },
  {
    symbol: 'stSTXbtc',
    vaultContract: 'v0-vault-ststxbtc',
    underlying: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2',
    decimals: 6,
    priceKeys: [
      'stacks:SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2::ststxbtc',
      'coingecko:blockstack',
    ],
  },
  {
    symbol: 'stBTC',
    vaultContract: 'v0-vault-stbtc',
    underlying: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stbtc-token',
    decimals: 8,
    priceKeys: [`stacks:${SBTC}`, 'coingecko:bitcoin'],
  },
];

const toNum = (cv) => {
  const v = cvToValue(cv);
  if (typeof v === 'object' && v !== null && 'value' in v) return Number(v.value);
  return Number(v);
};

const readOnly = async (network, contractName, functionName, functionArgs = []) =>
  callReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName,
    functionName,
    functionArgs,
    network,
    senderAddress: DEPLOYER,
  });

const fetchPrices = async () => {
  const keys = [...new Set(POOLS.flatMap((p) => p.priceKeys))].join(',');
  const { data } = await axios.get(getPriceApiUrl(`/prices/current/${keys}`));
  return data.coins;
};

const getPrice = (prices, priceKeys) => {
  for (const key of priceKeys) {
    if (prices[key]?.price) return prices[key].price;
  }
  return null;
};

const fetchRates = async (network, pool) => {
  const [address, name] = pool.underlying.split('.');
  const result = await readOnly(network, DATA_READER, 'get-asset-apys', [
    contractPrincipalCV(address, name),
  ]);
  const data = result.value.data;
  return {
    supplyApy: Number(data['supply-apy'].value) / 100,
    borrowApy: Number(data['borrow-apy'].value) / 100,
  };
};

const fetchVault = async (network, pool) => {
  const [assets, debt] = await Promise.all([
    readOnly(network, pool.vaultContract, 'get-total-assets'),
    readOnly(network, pool.vaultContract, 'get-debt'),
  ]);
  const scale = Math.pow(10, pool.decimals);
  return { totalAssets: toNum(assets) / scale, totalBorrowed: toNum(debt) / scale };
};

const apy = async () => {
  const network = new StacksMainnet();
  const prices = await fetchPrices();
  const results = [];

  for (const pool of POOLS) {
    try {
      const price = getPrice(prices, pool.priceKeys);
      if (!price) {
        console.log(`Skipping ${pool.symbol}: price not available`);
        continue;
      }
      const [rates, vault] = await Promise.all([
        fetchRates(network, pool),
        fetchVault(network, pool),
      ]);
      const totalSupplyUsd = vault.totalAssets * price;
      const totalBorrowUsd = vault.totalBorrowed * price;

      results.push({
        pool: `${DEPLOYER}.${pool.vaultContract}-${CHAIN}`.toLowerCase(),
        chain: CHAIN,
        project: 'zest-v2',
        symbol: pool.symbol,
        tvlUsd: totalSupplyUsd - totalBorrowUsd,
        apyBase: rates.supplyApy,
        apyBaseBorrow: rates.borrowApy,
        totalSupplyUsd,
        totalBorrowUsd,
        borrowToken: pool.underlying,
        underlyingTokens: [pool.underlying],
        token: pool.underlying,
        url: URL,
      });
    } catch (error) {
      console.log(`Error processing pool ${pool.symbol}: ${error.message}`);
    }
  }
  return results;
};

module.exports = {
  protocolId: '7449',
  timetravel: false,
  apy,
  url: URL,
};
