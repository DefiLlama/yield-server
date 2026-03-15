const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'bsc';

// Bitway Earn vaults on BNB Chain
const ABSOLUTE_RETURN_VAULT = '0x5C4a6903732532eeB3AE0803e062d8AE25d52BD1';
const CORE_ALPHA_VAULT = '0xb82E32062C773c7748776C06FdB11B92EDAE3B63';

// Underlying tokens on BSC
const USDT = '0x55d398326f99059ff775485246999027b3197955';
const USDC = '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d';
const USD1 = '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d';
const U = '0xce24439f2d9c6a2289f741120fe202248b666666';

const pools = [
  // Absolute Return: USDT, USDC
  {
    vault: ABSOLUTE_RETURN_VAULT,
    token: USDT,
    symbol: 'USDT',
    lpToken: '0xcCafB706225331aEdfeC75b5347d462B98Ed2fD2',
    poolMeta: 'Absolute Return',
  },
  {
    vault: ABSOLUTE_RETURN_VAULT,
    token: USDC,
    symbol: 'USDC',
    lpToken: '0x8042c9aefA44dD481172aa1E470C671D353ef00A',
    poolMeta: 'Absolute Return',
  },
  // Core Alpha: USDT, USD1, U
  {
    vault: CORE_ALPHA_VAULT,
    token: USDT,
    symbol: 'USDT',
    lpToken: '0x73af543D809C8D3414e5B92b3aa2c25b182Ba3A1',
    poolMeta: 'Core Alpha',
  },
  {
    vault: CORE_ALPHA_VAULT,
    token: USD1,
    symbol: 'USD1',
    lpToken: '0xb5C3617D4f077351cc6c7fAE558d32E9782307F9',
    poolMeta: 'Core Alpha',
  },
  {
    vault: CORE_ALPHA_VAULT,
    token: U,
    symbol: 'U',
    lpToken: '0x4eFFb6bcE5cAd64D7162c7F7f15f557221B106d5',
    poolMeta: 'Core Alpha',
  },
];

const abiGetTVL = 'function getTVL(address) view returns (uint256)';
const abiRewardRate =
  'function getCurrentRewardRate(address) view returns (uint256)';

const getApy = async () => {
  const calls = pools.flatMap((p) => [
    sdk.api.abi.call({
      chain: CHAIN,
      target: p.vault,
      abi: abiGetTVL,
      params: [p.token],
    }),
    sdk.api.abi.call({
      chain: CHAIN,
      target: p.vault,
      abi: abiRewardRate,
      params: [p.token],
    }),
  ]);

  const [results, { pricesByAddress }] = await Promise.all([
    Promise.all(calls),
    utils.getPrices([...new Set(pools.map((p) => p.token))], CHAIN),
  ]);

  return pools.map((p, i) => {
    const totalStaked = results[i * 2].output / 1e18;
    const rewardRate = results[i * 2 + 1].output; // basis points annual
    const apyBase = rewardRate / 100; // basis points to percentage
    const price = pricesByAddress[p.token.toLowerCase()] || 1;
    const tvlUsd = totalStaked * price;

    return {
      pool: `${p.lpToken}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'bitway',
      symbol: p.symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [p.token],
      poolMeta: p.poolMeta,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.bitway.com/explore',
};
