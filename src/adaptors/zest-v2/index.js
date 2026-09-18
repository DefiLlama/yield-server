const axios = require('axios');
const { getPriceApiUrl, withRetry } = require('../utils');
const {
  ClarityType,
  contractPrincipalCV,
  cvToHex,
  hexToCV,
} = require('@stacks/transactions');

const HIRO = 'https://api.hiro.so';
const RETRY = { retries: 3, delayMs: 8000 };
const HTTP = { timeout: 30000 };
const DEPLOYER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7';
const DATA_READER = `${DEPLOYER}.v0-5-data`;
const STBTC_DATA = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.data-stbtc-v1';
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
    exchangeRate: { contract: STBTC_DATA, fn: 'get-sbtc-per-stbtc', scale: 1e8 },
  },
];

const unwrap = (cv) => {
  if (cv.type === ClarityType.ResponseOk) return unwrap(cv.value);
  if (cv.type === ClarityType.Tuple) return cv.data;
  return cv;
};

const readOnly = async (contractId, functionName, functionArgs = []) => {
  const [address, name] = contractId.split('.');
  const url = `${HIRO}/v2/contracts/call-read/${address}/${name}/${functionName}`;
  const { data } = await withRetry(
    () => axios.post(url, { sender: DEPLOYER, arguments: functionArgs.map(cvToHex) }, HTTP),
    RETRY
  );
  if (!data.okay) throw new Error(`${contractId}.${functionName} failed: ${data.cause}`);
  return unwrap(hexToCV(data.result));
};

const fetchPrices = async () => {
  const keys = [...new Set(POOLS.flatMap((p) => p.priceKeys))].join(',');
  const { data } = await withRetry(() => axios.get(getPriceApiUrl(`/prices/current/${keys}`), HTTP), RETRY);
  return data.coins;
};

const fetchExchangeRate = async (pool) => {
  if (!pool.exchangeRate) return 1;
  const { contract, fn, scale } = pool.exchangeRate;
  return Number((await readOnly(contract, fn)).value) / scale;
};

const getPrice = (prices, priceKeys) => {
  for (const key of priceKeys) {
    if (prices[key]?.price) return prices[key].price;
  }
  return null;
};

const fetchRates = async (pool) => {
  const [address, name] = pool.underlying.split('.');
  const data = await readOnly(DATA_READER, 'get-asset-apys', [
    contractPrincipalCV(address, name),
  ]);
  return {
    supplyApy: Number(data['supply-apy'].value) / 100,
    borrowApy: Number(data['borrow-apy'].value) / 100,
  };
};

const fetchVault = async (pool) => {
  const [assets, debt] = await Promise.all([
    readOnly(`${DEPLOYER}.${pool.vaultContract}`, 'get-total-assets'),
    readOnly(`${DEPLOYER}.${pool.vaultContract}`, 'get-debt'),
  ]);
  const scale = Math.pow(10, pool.decimals);
  return { totalAssets: Number(assets.value) / scale, totalBorrowed: Number(debt.value) / scale };
};

const apy = async () => {
  const prices = await fetchPrices();
  const results = [];

  for (const pool of POOLS) {
    try {
      const basePrice = getPrice(prices, pool.priceKeys);
      if (!basePrice) {
        console.log(`Skipping ${pool.symbol}: price not available`);
        continue;
      }
      const [rates, vault, exchangeRate] = await Promise.all([
        fetchRates(pool),
        fetchVault(pool),
        fetchExchangeRate(pool),
      ]);
      const price = basePrice * exchangeRate;
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
