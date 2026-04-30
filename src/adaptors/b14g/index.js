const sdk = require('@defillama/sdk');
const { getLatestBlock } = require('@defillama/sdk/build/util');
const { RateLimiter } = require('limiter');
const { getPrices } = require('../utils');
const { fetchURL } = require('../../helper/utils');

// ---------- Constants ----------
const STAKING_CONTRACT = '0xee21ab613d30330823D35Cf91A84cE964808B83F';
const MARKETPLACE_CONTRACT = '0x04EA61C431F7934d51fEd2aCb2c5F942213f8967';
const WBTC_VAULT_CONTRACT = '0xa3CD4D4A568b76CFF01048E134096D2Ba0171C27';
const WBTC_CORE = '0x5832f53d147b3d6cd4578b9cbd62425c7ea9d0bd';
const DUAL_CORE_TOKEN = '0xc5555eA27e63cd89f8b227deCe2a3916800c0f4F';

// CORE chain system contracts
const VALIDATOR_SET = '0x0000000000000000000000000000000000001005';
const BTC_LIGHT_CLIENT = '0x0000000000000000000000000000000000001014';
const LENDING_POOL = '0x0CEa9F0F49F30d376390e480ba32f903B43B19C5';
const WBTC_ORACLE = '0x2e3ea6cf100632a4a4b34f26681a6f50347775c9';
const CORE_NATIVE = '0x0000000000000000000000000000000000000000';

const BLOCKS_PER_DAY = 28800;
const SECONDS_PER_DAY = 86400;
const ONE_E18 = '1000000000000000000';
const MARKETPLACE_FROM_BLOCK = 19942300;

const BTC_CACHE_TTL = 3 * 60 * 60; // 3 hours

const limiter = new RateLimiter({ tokensPerInterval: 1, interval: 10_000 });

// ---------- Helpers ----------
const sumMulticallOutput = (results, extract = (o) => o) =>
  results.reduce((acc, r) => {
    const out = r && r.output;
    const val = out != null ? extract(out) : null;
    return val ? acc + parseInt(val) : acc;
  }, 0);

const withLimiter =
  (fn, tokensToRemove = 1) =>
  async (...args) => {
    await limiter.removeTokens(tokensToRemove);
    return fn(...args);
  };

function reverseBytes(hex) {
  let h = hex;
  if (h.length % 2 === 1) h = '0' + h;
  h = h.split('').reverse().join('');
  let out = '';
  for (let i = 0; i < h.length - 1; i += 2) out += h[i + 1] + h[i];
  return out;
}

// ---------- Bitcoin balance lookups ----------
const blockchainInfoUrl = (addrs) =>
  'https://blockchain.info/multiaddr?active=' + addrs.join('|');

async function _sumTokensBlockchain({ balances = {}, owners = [] }) {
  const STEP = 200;
  for (let i = 0; i < owners.length; i += STEP) {
    const {
      data: { addresses },
    } = await fetchURL(blockchainInfoUrl(owners.slice(i, i + STEP)));
    for (const addr of addresses)
      sdk.util.sumSingleBalance(balances, 'bitcoin', addr.final_balance / 1e8);
  }
  return balances;
}

const sumTokensBlockchain = withLimiter(_sumTokensBlockchain);

async function sumTokens({ balances = {}, owners = [], timestamp }) {
  if (typeof timestamp === 'object' && timestamp.timestamp)
    timestamp = timestamp.timestamp;
  const now = Date.now() / 1e3;
  if (timestamp && now - timestamp >= BTC_CACHE_TTL) return;

  try {
    await sumTokensBlockchain({ balances, owners });
    return balances;
  } catch (e) {
    sdk.log('b14g bitcoin sumTokens error', e.toString());
  }
}

const totalBTC = async () => {
  const {
    data: {
      data: { result },
    },
  } = await fetchURL(
    'https://api.b14g.xyz/restake/marketplace/defillama/btc-tx-hash'
  );

  const owners = new Set();
  for (const { txHash } of result) {
    const { data: tx } = await fetchURL(
      `https://mempool.space/api/tx/${reverseBytes(txHash.slice(2))}`
    );
    const vinAddrs = new Set(
      tx.vin.map((v) => v.prevout.scriptpubkey_address)
    );
    for (const vout of tx.vout) {
      if (
        vout.scriptpubkey_type !== 'op_return' &&
        !vinAddrs.has(vout.scriptpubkey_address)
      ) {
        owners.add(vout.scriptpubkey_address);
      }
    }
  }
  return await sumTokens({ owners: [...owners] });
};

// ---------- ABIs ----------
const exchangeRateAbi = {
  inputs: [{ internalType: 'uint256', name: '_dualCore', type: 'uint256' }],
  name: 'exchangeCore',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'nonpayable',
  type: 'function',
};

const getTxIdsByDelegatorAbi = {
  outputs: [{ name: '', internalType: 'bytes32[]', type: 'bytes32[]' }],
  inputs: [{ name: 'delegator', internalType: 'address', type: 'address' }],
  name: 'getTxIdsByDelegator',
  stateMutability: 'view',
  type: 'function',
};

const btcTxMapAbi = {
  outputs: [
    { name: 'amount', internalType: 'uint64', type: 'uint64' },
    { name: 'outputIndex', internalType: 'uint32', type: 'uint32' },
    { name: 'blockTimestamp', internalType: 'uint64', type: 'uint64' },
    { name: 'lockTime', internalType: 'uint32', type: 'uint32' },
    { name: 'usedHeight', internalType: 'uint32', type: 'uint32' },
  ],
  inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
  name: 'btcTxMap',
  stateMutability: 'view',
  type: 'function',
};

const claimBTCRewardAbi = {
  inputs: [
    {
      components: [
        { internalType: 'address', name: 'receiver', type: 'address' },
        { internalType: 'bytes32', name: 'txHash', type: 'bytes32' },
        { internalType: 'address', name: 'to', type: 'address' },
      ],
      internalType: 'struct Marketplace.ClaimParamOnBehalf[]',
      name: 'claimParam',
      type: 'tuple[]',
    },
  ],
  name: 'claimBTCRewardProxyOnBehalf',
  outputs: [
    { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
  ],
  stateMutability: 'nonpayable',
  type: 'function',
};

const rewardDataLogAbi = {
  inputs: [{ internalType: 'uint256', name: 'round', type: 'uint256' }],
  name: 'rewardDataLog',
  outputs: [
    { internalType: 'uint256', name: 'accPerShare', type: 'uint256' },
    { internalType: 'uint256', name: 'liquidityIndex', type: 'uint256' },
  ],
  stateMutability: 'view',
  type: 'function',
};

const getReserveDataAbi = {
  outputs: [
    {
      components: [
        {
          components: [
            { name: 'data', internalType: 'uint256', type: 'uint256' },
          ],
          name: 'configuration',
          internalType: 'struct DataTypes.ReserveConfigurationMap',
          type: 'tuple',
        },
        { name: 'liquidityIndex', internalType: 'uint128', type: 'uint128' },
        {
          name: 'currentLiquidityRate',
          internalType: 'uint128',
          type: 'uint128',
        },
        {
          name: 'variableBorrowIndex',
          internalType: 'uint128',
          type: 'uint128',
        },
        {
          name: 'currentVariableBorrowRate',
          internalType: 'uint128',
          type: 'uint128',
        },
        {
          name: 'currentStableBorrowRate',
          internalType: 'uint128',
          type: 'uint128',
        },
        {
          name: 'lastUpdateTimestamp',
          internalType: 'uint40',
          type: 'uint40',
        },
        { name: 'id', internalType: 'uint16', type: 'uint16' },
        { name: 'aTokenAddress', internalType: 'address', type: 'address' },
        {
          name: 'stableDebtTokenAddress',
          internalType: 'address',
          type: 'address',
        },
        {
          name: 'variableDebtTokenAddress',
          internalType: 'address',
          type: 'address',
        },
        {
          name: 'interestRateStrategyAddress',
          internalType: 'address',
          type: 'address',
        },
        {
          name: 'accruedToTreasury',
          internalType: 'uint128',
          type: 'uint128',
        },
        { name: 'unbacked', internalType: 'uint128', type: 'uint128' },
        {
          name: 'isolationModeTotalDebt',
          internalType: 'uint128',
          type: 'uint128',
        },
      ],
      name: '',
      internalType: 'struct DataTypes.ReserveData',
      type: 'tuple',
    },
  ],
  inputs: [{ name: 'asset', internalType: 'address', type: 'address' }],
  name: 'getReserveData',
  stateMutability: 'view',
  type: 'function',
};

// ---------- Core reward for BTC holder ----------
const getTurnRoundBlockNumber = async (blockNumber) => {
  const { output: roundTag } = await sdk.api.abi.call({
    target: VALIDATOR_SET,
    chain: 'core',
    abi: 'uint256:roundTag',
  });
  const logs = await sdk.getEventLogs({
    chain: 'core',
    target: VALIDATOR_SET,
    eventAbi: 'event turnedRound(uint256)',
    fromBlock: blockNumber.block - SECONDS_PER_DAY,
    toBlock: blockNumber.block,
  });
  const matched = logs.find((l) => l.args[0].toString() === roundTag.toString());
  if (!matched) throw new Error(`turnedRound not found for roundTag ${roundTag}`);
  return matched.blockNumber;
};

const getCORERewardForBTCHolderPerDay = async (blockNumber) => {
  const allOrders = (
    await sdk.getEventLogs({
      chain: 'core',
      target: MARKETPLACE_CONTRACT,
      eventAbi:
        'event CreateRewardReceiver(address indexed owner, address indexed order, uint256, uint256)',
      fromBlock: MARKETPLACE_FROM_BLOCK,
      toBlock: blockNumber.block,
    })
  ).map((l) => ({ order: l.args.order, owner: l.args.owner }));

  const txIdsResults = (
    await sdk.api.abi.multiCall({
      abi: getTxIdsByDelegatorAbi,
      calls: allOrders.map((o) => ({
        target: BTC_LIGHT_CLIENT,
        params: [o.order],
      })),
      chain: 'core',
      permitFailure: true,
    })
  ).output;

  const listTxHash = [];
  const listOrderActive = txIdsResults
    .map((r, i) => ({ ...r, order: allOrders[i].order, owner: allOrders[i].owner }))
    .filter((r) => {
      if (!Array.isArray(r.output) || r.output.length === 0) return false;
      listTxHash.push(...r.output);
      return true;
    });

  const btcTxMapResults = (
    await sdk.api.abi.multiCall({
      abi: btcTxMapAbi,
      calls: listTxHash.map((h) => ({ target: BTC_LIGHT_CLIENT, params: [h] })),
      chain: 'core',
      permitFailure: true,
    })
  ).output;
  const btcStake = sumMulticallOutput(btcTxMapResults, (o) => o.amount) / 1e8;

  const turnRoundBlock = await getTurnRoundBlockNumber(blockNumber);

  const beforeResults = (
    await sdk.api.abi.multiCall({
      abi: 'uint256:pendingRewardForBTC',
      calls: listOrderActive.map((o) => ({ target: o.order })),
      block: turnRoundBlock,
      chain: 'core',
      permitFailure: true,
    })
  ).output;
  const rewardBefore = sumMulticallOutput(beforeResults);

  const afterResults = (
    await sdk.api.abi.multiCall({
      abi: claimBTCRewardAbi,
      calls: listOrderActive.map((o) => ({
        target: MARKETPLACE_CONTRACT,
        params: [[{ receiver: o.order, txHash: o.output[0], to: o.owner }]],
      })),
      block: turnRoundBlock + 1,
      chain: 'core',
      chunkSize: 20,
      permitFailure: true,
    })
  ).output;
  const rewardAfter = sumMulticallOutput(afterResults);

  return {
    reward: (rewardAfter - rewardBefore) / 1e18,
    btcStake,
  };
};

// ---------- Per-pool APY calculators ----------
const getDualCOREVault = async (blockNumber) => {
  const [totalStake, exchangeRateYesterday, currentExchangeRate] =
    await Promise.all([
      sdk.api.abi.call({
        chain: 'core',
        target: STAKING_CONTRACT,
        abi: 'uint256:totalStaked',
      }),
      sdk.api.abi.call({
        chain: 'core',
        target: STAKING_CONTRACT,
        abi: exchangeRateAbi,
        params: [ONE_E18],
        block: blockNumber.block - BLOCKS_PER_DAY,
      }),
      sdk.api.abi.call({
        chain: 'core',
        target: STAKING_CONTRACT,
        abi: exchangeRateAbi,
        params: [ONE_E18],
      }),
    ]);
  // auto-compounding vault
  const apy =
    ((currentExchangeRate.output / exchangeRateYesterday.output) ** 365 - 1) *
    100;
  return {
    apy,
    totalStake: totalStake.output / 1e18,
    pricePerShare: Number(currentExchangeRate.output) / 1e18,
  };
};

const getBTCMarketplace = async (blockNumber, corePrice, btcPrice) => {
  const totalBTCLock = await totalBTC();
  const coreRewardPerDay = await getCORERewardForBTCHolderPerDay(blockNumber);
  const btcLock = Math.min(
    totalBTCLock.bitcoin,
    coreRewardPerDay.btcStake
  );
  const apy =
    ((corePrice * coreRewardPerDay.reward) / btcLock / btcPrice) * 365 * 100;
  return { totalLock: btcLock, apy };
};

const getWBTCVault = async (blockNumber, corePrice, btcPrice) => {
  const totalStake = await sdk.api.abi.call({
    target: WBTC_ORACLE,
    params: WBTC_VAULT_CONTRACT,
    abi: 'erc20:balanceOf',
    chain: 'core',
  });

  const wbtcReserve = await sdk.api.abi.call({
    chain: 'core',
    target: LENDING_POOL,
    params: WBTC_CORE,
    abi: getReserveDataAbi,
  });
  const liquidityIndex = wbtcReserve.output[1];
  const wbtcRate = wbtcReserve.output[2] / 1e25; // currentLiquidityRate

  const lastRoundClaim = await sdk.api.abi.call({
    chain: 'core',
    target: WBTC_VAULT_CONTRACT,
    abi: 'uint:lastRoundClaim',
  });

  const rewardDataLog = await sdk.api.abi.multiCall({
    abi: rewardDataLogAbi,
    calls: [
      { target: WBTC_VAULT_CONTRACT, params: [lastRoundClaim.output - 1] },
      { target: WBTC_VAULT_CONTRACT, params: [lastRoundClaim.output] },
    ],
    chain: 'core',
  });
  const coreReward =
    (rewardDataLog.output[1].output.accPerShare -
      rewardDataLog.output[0].output.accPerShare) /
    1e28;
  const coreAPR =
    (coreReward / (liquidityIndex / 1e27) / btcPrice) * corePrice * 365 * 100;
  const apy = ((1 + (coreAPR + wbtcRate) / 365 / 100) ** 365 - 1) * 100;
  return { apy, totalStake: totalStake.output / 1e8 };
};

// ---------- Entry ----------
const isFinitePositive = (n) => Number.isFinite(n) && n > 0;

const getApy = async () => {
  const blockNumber = await getLatestBlock('core');
  const price = await getPrices([CORE_NATIVE, WBTC_CORE], 'core');
  const corePrice = price.pricesBySymbol.core;
  const wbtcPrice = price.pricesBySymbol.wbtc;

  const specs = [
    {
      name: 'dualCORE vault',
      run: () => getDualCOREVault(blockNumber),
      build: (v) => ({
        pool: `${STAKING_CONTRACT}-core`,
        project: 'b14g',
        symbol: 'CORE',
        token: DUAL_CORE_TOKEN,
        tvlUsd: v.totalStake * corePrice,
        apyBase: v.apy,
        ...(v.pricePerShare > 0 && { pricePerShare: v.pricePerShare }),
        chain: 'core',
        url: 'https://app.b14g.xyz/vaults/core',
        underlyingTokens: [CORE_NATIVE],
      }),
    },
    {
      name: 'WBTC vault',
      run: () => getWBTCVault(blockNumber, corePrice, wbtcPrice),
      build: (v) => ({
        pool: `${WBTC_VAULT_CONTRACT}-core`,
        project: 'b14g',
        symbol: 'WBTC',
        tvlUsd: v.totalStake * wbtcPrice,
        apyBase: v.apy,
        chain: 'core',
        url: 'https://app.b14g.xyz/vaults/core',
        underlyingTokens: [WBTC_CORE],
      }),
    },
    {
      name: 'BTC marketplace',
      run: () => getBTCMarketplace(blockNumber, corePrice, wbtcPrice),
      validate: (v) =>
        isFinitePositive(v.totalLock) &&
        Number.isFinite(v.apy) &&
        isFinitePositive(wbtcPrice),
      build: (v) => ({
        pool: `${MARKETPLACE_CONTRACT}-bitcoin`,
        project: 'b14g',
        symbol: 'BTC',
        token: null,
        tvlUsd: v.totalLock * wbtcPrice,
        apyBase: v.apy,
        chain: 'bitcoin',
        url: 'https://app.b14g.xyz/marketplace',
        underlyingTokens: ['coingecko:bitcoin'],
      }),
    },
  ];

  const results = await Promise.allSettled(specs.map((s) => s.run()));

  const pools = [];
  results.forEach((r, i) => {
    const spec = specs[i];
    if (r.status !== 'fulfilled') {
      sdk.log(`b14g ${spec.name} failed`, r.reason?.toString());
      return;
    }
    if (spec.validate && !spec.validate(r.value)) {
      sdk.log(`b14g ${spec.name} skipped: invalid metrics`, JSON.stringify(r.value));
      return;
    }
    pools.push(spec.build(r.value));
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
