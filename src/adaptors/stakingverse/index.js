const sdk = require('@defillama/sdk');
const axios = require('axios');
const BigNumber = require('bignumber.js');
const utils = require('../utils');

const VAULT = '0x8a93a876912c9f03f88bc9114847cf5b63c89f56';
const IMPLEMENTATION = '0x927a83c679a5e1a6435d6bfaef7f20d4db23e2cc';
const IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const DEPLOYMENT = 'QmYHxQPCDK7C6ttWi5DvQufttFXU4xFTVy7YLydspUY86d';
const ENDPOINT =
  'https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod';
const ZERO = '0x0000000000000000000000000000000000000000';
const OSETH = '0xf1c9acdc66974dfb6decb12aa385b9cd01190e38';
const URL = `https://app.stakewise.io/vault/mainnet/${VAULT}`;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
const DAY = 86400;
const MAX_AGE = 3600;
const MAX_CLOCK_SKEW = 300;

const fail = (message) => {
  throw new Error(`Stakingverse: ${message}`);
};
const integer = (value, label) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    fail(`invalid ${label}`);
  if (!/^[0-9]+$/.test(String(value))) fail(`invalid ${label}`);
  return BigInt(value);
};
const decimal = (value, label) => {
  if (value === null || value === undefined || value === '')
    fail(`missing ${label}`);
  const result = new BigNumber(value);
  if (!result.isFinite()) fail(`invalid ${label}`);
  return result;
};
const address = (value, label) => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    fail(`invalid ${label}`);
  return value.toLowerCase();
};
const fresh = (value, label, now) => {
  const time = Number(value);
  if (
    !Number.isSafeInteger(time) ||
    time <= 0 ||
    now - time > MAX_AGE ||
    time - now > MAX_CLOCK_SKEW
  ) {
    fail(`stale or invalid ${label}`);
  }
};
const verifyMeta = (meta, expected) => {
  if (meta?.hasIndexingErrors !== false || meta.deployment !== DEPLOYMENT)
    fail('subgraph deployment requires review');
  if (
    !Number.isSafeInteger(meta.block?.number) ||
    meta.block.number <= 0 ||
    !/^0x[0-9a-fA-F]{64}$/.test(meta.block?.hash || '')
  )
    fail('invalid indexed block');
  if (
    expected &&
    (meta.block.number !== expected.number ||
      meta.block.hash.toLowerCase() !== expected.hash.toLowerCase())
  )
    fail('inconsistent indexed block');
  fresh(meta.block.timestamp, 'indexed block', Math.floor(Date.now() / 1000));
};
async function graph(body, block) {
  const pin = block ? `(block: { hash: "${block.hash}" })` : '';
  const query = `{ _meta${pin} { deployment hasIndexingErrors block { number timestamp hash } } ${body} }`;
  const { data } = await axios.post(ENDPOINT, { query }, { timeout: 60000 });
  if (data?.errors || !data?.data) fail('invalid subgraph response');
  verifyMeta(data.data._meta, block);
  return data.data;
}

// Daily subgraph vault-share returns, already net of vault fee-share dilution.
// The deployed source labels this field APY but annualizes each day without
// exponential compounding. Average exactly seven contiguous daily observations.
function sevenDayRate(snapshots, blockTimestamp) {
  if (!Array.isArray(snapshots) || snapshots.length !== 7)
    fail('missing seven daily yield samples');
  const expectedNewest =
    BigInt((Math.floor((blockTimestamp + 30) / DAY) - 1) * DAY) * 1000000n;
  const dayMicros = BigInt(DAY) * 1000000n;
  let sum = new BigNumber(0);
  for (let i = 0; i < 7; i += 1) {
    const timestamp = integer(snapshots[i].timestamp, 'snapshot timestamp');
    if (timestamp !== expectedNewest - BigInt(i) * dayMicros)
      fail('stale or non-contiguous yield history');
    sum = sum.plus(decimal(snapshots[i].apy, 'daily staking rate'));
  }
  const rate = sum.dividedBy(7);
  if (rate.isNegative()) fail('negative staking rate needs review');
  return rate.toNumber();
}

async function apy() {
  const { _meta } = await graph('');
  const block = _meta.block;
  const provider = sdk.getProvider('ethereum');
  const chainBlock = await provider.getBlock(block.number);
  if (
    !chainBlock ||
    chainBlock.hash.toLowerCase() !== block.hash.toLowerCase() ||
    chainBlock.timestamp !== block.timestamp
  )
    fail('RPC/subgraph block mismatch');
  const implementation = await provider.getStorage(
    VAULT,
    IMPLEMENTATION_SLOT,
    block.number
  );
  if (
    typeof implementation !== 'string' ||
    implementation.toLowerCase() !==
      `0x${'0'.repeat(24)}${IMPLEMENTATION.slice(2)}`
  )
    fail('vault implementation requires review');
  const { vault, vaultSnapshots } = await graph(
    `
    vault(id: "${VAULT}", block: { hash: "${block.hash}" }) {
      isErc20 isPrivate isBlocklist isGenesis version
    }
    vaultSnapshots(first: 7, orderBy: timestamp, orderDirection: desc,
      block: { hash: "${block.hash}" }, where: { vault: "${VAULT}" }) {
      timestamp apy
    }`,
    block
  );
  if (
    !vault ||
    vault.isErc20 !== false ||
    vault.isPrivate !== false ||
    vault.isBlocklist !== false ||
    vault.isGenesis !== false ||
    String(vault.version) !== '5'
  )
    fail('unsupported vault type/version');
  const apyBase = sevenDayRate(vaultSnapshots, block.timestamp);

  // The proven deployed mapping never deletes Allocator entities. Scan ALL
  // historical accounts, including zero-share and zero-reported-debt accounts;
  // liquidations can leave debt on an account with no remaining collateral.
  const accounts = new Set();
  let cursor = '';
  let complete = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { allocators } = await graph(
      `allocators(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc,
      block: { hash: "${block.hash}" }, where: { vault: "${VAULT}", id_gt: "${cursor}" }) {
      id address
    }`,
      block
    );
    if (!Array.isArray(allocators) || allocators.length > PAGE_SIZE)
      fail('invalid allocator page');
    for (const row of allocators) {
      const account = address(row.address, 'allocator address');
      if (
        row.id !== `${VAULT}-${account}` ||
        row.id <= cursor ||
        accounts.has(account)
      )
        fail('invalid allocator cursor or duplicate');
      accounts.add(account);
      cursor = row.id;
    }
    if (allocators.length < PAGE_SIZE) {
      complete = true;
      break;
    }
  }
  if (!complete) fail('allocator pagination incomplete');

  const call = async (abi, params = []) =>
    (
      await sdk.api.abi.call({
        chain: 'ethereum',
        target: VAULT,
        abi,
        params,
        block: block.number,
      })
    ).output;
  const [
    assetsRaw,
    sharesRaw,
    queueRaw,
    feeRecipient,
    version,
  ] = await Promise.all([
    call('function totalAssets() view returns (uint256)'),
    call('function totalShares() view returns (uint256)'),
    call(
      'function getExitQueueData() view returns (uint128,uint128,uint128,uint128,uint256)'
    ),
    call('function feeRecipient() view returns (address)'),
    call('function version() view returns (uint8)'),
  ]);
  if (String(version) !== '5') fail('RPC vault version requires review');
  if (!Array.isArray(queueRaw) || queueRaw.length !== 5)
    fail('invalid exit queue data');
  const assets = integer(assetsRaw, 'total assets');
  const shares = integer(sharesRaw, 'total shares');
  const queue = queueRaw.map((v, i) => integer(v, `exit queue field ${i}`));
  const queued = queue[0];
  if (shares === 0n || queued > shares) fail('invalid active share supply');
  accounts.add(VAULT);
  accounts.add(address(feeRecipient, 'fee recipient'));
  const owners = Array.from(accounts);
  const calls = owners.map((owner) => ({ target: VAULT, params: [owner] }));
  const [balances, debts] = await Promise.all([
    sdk.api.abi.multiCall({
      chain: 'ethereum',
      abi: 'function getShares(address) view returns (uint256)',
      calls,
      block: block.number,
    }),
    sdk.api.abi.multiCall({
      chain: 'ethereum',
      abi: 'function osTokenPositions(address) view returns (uint128)',
      calls,
      block: block.number,
    }),
  ]);
  const sumCalls = (response, label) => {
    if (
      !Array.isArray(response.output) ||
      response.output.length !== owners.length
    )
      fail(`incomplete ${label} multicall`);
    return response.output.reduce((sum, item, i) => {
      if (
        item.success !== true ||
        address(item.input?.target, 'multicall target') !== VAULT ||
        address(item.input?.params?.[0], 'multicall owner') !== owners[i]
      )
        fail(`invalid ${label} multicall`);
      return sum + integer(item.output, label);
    }, 0n);
  };
  const activeShares = shares - queued;
  if (sumCalls(balances, 'owner shares') !== activeShares)
    fail('allocator coverage does not reconcile to active shares');
  const mintedShares = sumCalls(debts, 'fee-synced osETH debt');
  // Match convertToAssets rounding. All queued withdrawals leave this perimeter
  // on entry; checkpointed/unclaimed/escrow collateral and escrow debt stay out.
  const activeAssets = (activeShares * assets) / shares;
  const converted = integer(
    await call('function convertToAssets(uint256) view returns (uint256)', [
      activeShares.toString(),
    ]),
    'converted active assets'
  );
  if (converted !== activeAssets) fail('active assets do not reconcile');

  const ethKey = `ethereum:${ZERO}`;
  const osKey = `ethereum:${OSETH}`;
  const { coins } = await utils.getPriceApiData(
    `/prices/current/${ethKey},${osKey}`
  );
  const now = Math.floor(Date.now() / 1000);
  fresh(block.timestamp, 'indexed block', now);
  fresh(coins?.[ethKey]?.timestamp, 'ETH price', now);
  fresh(coins?.[osKey]?.timestamp, 'osETH price', now);
  const ethPrice = decimal(coins?.[ethKey]?.price, 'ETH price');
  const osPrice = decimal(coins?.[osKey]?.price, 'osETH price');
  if (!ethPrice.gt(0) || !osPrice.gt(0)) fail('non-positive price');
  const tvl = new BigNumber(activeAssets.toString())
    .times(ethPrice)
    .minus(new BigNumber(mintedShares.toString()).times(osPrice))
    .dividedBy('1e18');
  if (
    !tvl.gt(0) ||
    !Number.isFinite(tvl.toNumber()) ||
    !Number.isFinite(apyBase)
  )
    fail('invalid net TVL or staking rate');
  // Recheck the numbered block after all calls, catching observed reorgs.
  const finalBlock = await provider.getBlock(block.number);
  if (!finalBlock || finalBlock.hash.toLowerCase() !== block.hash.toLowerCase())
    fail('block changed during valuation');
  return [
    {
      pool: `${VAULT}-ethereum`,
      chain: 'Ethereum',
      project: 'stakingverse',
      symbol: 'ETH',
      tvlUsd: tvl.toNumber(),
      apyBase,
      underlyingTokens: [ZERO],
      token: null,
      poolMeta: 'Stakingverse (active positions; unleveraged staking rate)',
      url: URL,
    },
  ];
}

module.exports = { protocolId: '6082', timetravel: false, apy, url: URL };
