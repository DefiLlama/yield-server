const axios = require('axios');
const { getPriceApiUrl } = require('../utils');
const {
  callReadOnlyFunction,
  contractPrincipalCV,
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

const DEPLOYER = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N';
const POOL_READ = 'pool-read-v2-1-4';
const POOL_VAULT = `${DEPLOYER}.pool-vault`;
const CHAIN = 'Stacks';
const URL = 'https://app.zestprotocol.com/market/legacy';
const RATE_SCALE = 1e6;

const ASSETS = [
  {
    symbol: 'sBTC',
    contract: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
    decimals: 8,
    priceKeys: ['stacks:SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token', 'coingecko:bitcoin'],
  },
  {
    symbol: 'STX',
    contract: `${DEPLOYER}.wstx`,
    decimals: 6,
    priceKeys: ['coingecko:blockstack'],
    native: true,
  },
  {
    symbol: 'stSTX',
    contract: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
    decimals: 6,
    priceKeys: ['stacks:SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token', 'coingecko:blockstack'],
  },
  {
    symbol: 'stSTXbtc',
    contract: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2',
    decimals: 6,
    priceKeys: ['stacks:SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2::ststxbtc', 'coingecko:blockstack'],
  },
  {
    symbol: 'aeUSDC',
    contract: 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc',
    decimals: 6,
    priceKeys: ['stacks:SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc', 'coingecko:usd-coin'],
  },
  {
    symbol: 'USDh',
    contract: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
    decimals: 8,
    priceKeys: ['stacks:SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1', 'coingecko:usd-coin'],
  },
  {
    symbol: 'USDT',
    contract: 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt',
    decimals: 8,
    priceKeys: ['stacks:SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt', 'coingecko:tether'],
  },
  {
    symbol: 'ALEX',
    contract: 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
    decimals: 8,
    priceKeys: ['stacks:SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex', 'coingecko:alexgo'],
  },
];

const fetchPrices = async () => {
  const keys = [...new Set(ASSETS.flatMap((a) => a.priceKeys))].join(',');
  const { data } = await axios.get(getPriceApiUrl(`/prices/current/${keys}`));
  return data.coins;
};

const getPrice = (prices, priceKeys) => {
  for (const key of priceKeys) {
    if (prices[key]?.price) return prices[key].price;
  }
  return null;
};

const fetchVaultBalances = async () => {
  const { data } = await axios.get(
    `https://api.hiro.so/extended/v1/address/${POOL_VAULT}/balances`
  );
  const balances = { stx: Number(data.stx.balance) };
  Object.entries(data.fungible_tokens || {}).forEach(([assetId, tokenData]) => {
    balances[assetId.split('::')[0]] = Number(tokenData.balance);
  });
  return balances;
};

const fetchReserve = async (network, asset) => {
  const [address, name] = asset.contract.split('.');
  const result = await callReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName: POOL_READ,
    functionName: 'get-reserve-data',
    functionArgs: [contractPrincipalCV(address, name)],
    network,
    senderAddress: DEPLOYER,
  });
  const data = result.data;
  return {
    supplyApy: Number(data['current-liquidity-rate'].value) / RATE_SCALE,
    borrowApy: Number(data['current-variable-borrow-rate'].value) / RATE_SCALE,
    ltv: Number(data['base-ltv-as-collateral'].value) / 1e8,
    totalBorrowed: Number(data['total-borrows-variable'].value) + Number(data['total-borrows-stable'].value),
  };
};

const apy = async () => {
  const network = new StacksMainnet();
  const [prices, balances] = await Promise.all([fetchPrices(), fetchVaultBalances()]);
  const pools = [];

  for (const asset of ASSETS) {
    try {
      const price = getPrice(prices, asset.priceKeys);
      if (!price) {
        console.log(`Skipping ${asset.symbol}: price not available`);
        continue;
      }
      const reserve = await fetchReserve(network, asset);
      const scale = Math.pow(10, asset.decimals);
      const available = (asset.native ? balances.stx : balances[asset.contract] || 0) / scale;
      const totalBorrowUsd = (reserve.totalBorrowed / scale) * price;
      const tvlUsd = available * price;

      pools.push({
        pool: `${asset.contract}-${CHAIN}`.toLowerCase(),
        chain: CHAIN,
        project: 'zest-v1',
        symbol: asset.symbol,
        tvlUsd,
        apyBase: reserve.supplyApy,
        apyBaseBorrow: reserve.borrowApy,
        totalSupplyUsd: tvlUsd + totalBorrowUsd,
        totalBorrowUsd,
        ltv: reserve.ltv,
        underlyingTokens: [asset.contract],
        token: asset.contract,
        url: URL,
      });
    } catch (error) {
      console.log(`Error processing ${asset.symbol}: ${error.message}`);
    }
  }
  return pools;
};

module.exports = {
  protocolId: '4420',
  timetravel: false,
  apy,
  url: URL,
};
