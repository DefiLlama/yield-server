const { ContractMissingABIError } = require('web3');
const utils = require('../utils');

const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const COINS_LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/';

const COINS = [
  ['APT', 'coingecko:aptos', 8, '0x1::aptos_coin::AptosCoin'],
  [
    'amAPT',
    'coingecko:amnis-aptos',
    8,
    '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::amapt_token::AmnisApt',
  ],
  [
    'stAPT',
    'coingecko:amnis-staked-aptos-coin',
    8,
    '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::stapt_token::StakedApt',
  ],
  [
    'zUSDC',
    'coingecko:usd-coin',
    6,
    '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC',
  ],
  [
    'zUSDT',
    'coingecko:tether',
    6,
    '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT',
  ],
  [
    'wUSDC',
    'coingecko:usd-coin',
    6,
    '0x5e156f1207d0ebfa19a9eeff00d62a282278fb8719f4fab3a586a0a2c0fffbea::coin::T',
  ],
  [
    'WBTC',
    'coingecko:bitcoin',
    6,
    '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WBTC',
  ],
  [
    'zWETH',
    'coingecko:ethereum',
    6,
    '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WETH',
  ],
  [
    'CELL',
    'coingecko:cellana-finance',
    8,
    '0x2ebb2ccac5e027a87fa0e2e5f656a3a4238d6a48d93ec9b610d570fc0aa0df12',
  ],
];

async function main() {
  const pools = (await utils.getData(`https://api.meso.finance/api/v1/pool`))
    .datas;
  const map = new Map(pools.map((pool) => [pool.tokenAddress, pool]));
  return await Promise.all(
    COINS.map(async (coin) => {
      const [coinSymbol, priceId, coinDecimal, coinAddr] = coin;
      const pool = map.get(coinAddr);

      const priceRes = await utils.getData(
        `${COINS_LLAMA_PRICE_URL}${priceId}`
      );
      let coinPrice = priceRes['coins']?.[priceId]?.['price'];
      if (!coinPrice) {
        const aptosPriceRes = await utils.getData(
          `${COINS_LLAMA_PRICE_URL}aptos:${coinAddr}`
        );
        coinPrice = aptosPriceRes['coins'][`aptos:${coinAddr}`]['price'];
      }

      const res = {
        pool: `meso-finance-${coinSymbol}`,
        chain: utils.formatChain('aptos'),
        project: 'meso-finance',
        symbol: utils.formatSymbol(coinSymbol),
        tvlUsd:
          ((pool.poolSupply - pool.totalDebt) * coinPrice) /
          10 ** pool['token']['decimals'],
        apyBase: pool.supplyApy + pool.stakingApr,
      };

      if (pool.incentiveSupplyApy > 0) {
        res['apyReward'] = pool.incentiveSupplyApy;
        res['rewardTokens'] = ['0x1::aptos_coin::AptosCoin'];
      }

      return res;
    })
  );
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.meso.finance/',
};
