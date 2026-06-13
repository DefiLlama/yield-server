const axios = require('axios');
const sdk = require('@defillama/sdk');

const {
  getPendingTokenMetadataCandidates,
  upsertTokenMetadata,
} = require('../queries/tokenMetadata');

const LOOKBACK_DAYS = 7;
const BATCH_SIZE = 200;
const ERC20_ABI = {
  symbol: 'function symbol() view returns (string)',
  name: 'function name() view returns (string)',
  decimals: 'function decimals() view returns (uint8)',
};

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return main();
};

const main = async () => {
  console.log('START TOKEN METADATA');

  const candidates = await getPendingTokenMetadataCandidates(LOOKBACK_DAYS);
  console.log(`tokens to process: ${candidates.length}`);

  if (!candidates.length) {
    return {
      status: 'success',
      candidates: 0,
      upserts: 0,
    };
  }

  const chainMap = Object.fromEntries(
    Object.entries(await getChainMap()).map(([displayName, chainNk]) => [
      displayName.toLowerCase(),
      chainNk,
    ])
  );
  const grouped = new Map();
  const unsupportedRows = [];
  let upserts = 0;

  for (const row of candidates) {
    const sdkChain = chainMap[row.chain.toLowerCase()] || null;
    if (!sdkChain) {
      unsupportedRows.push({
        chain: row.chain,
        address: row.address,
        symbol: null,
        name: null,
        decimals: null,
        last_attempt_at: new Date(),
      });
      continue;
    }

    if (!grouped.has(row.chain)) {
      grouped.set(row.chain, {
        sdkChain,
        rows: [],
      });
    }
    grouped.get(row.chain).rows.push(row);
  }

  console.log(
    `chains: ${grouped.size}, unsupported candidates: ${unsupportedRows.length}`
  );

  if (unsupportedRows.length) {
    console.log(
      `processing unsupported batch: ${unsupportedRows.length} token(s)`
    );
    await upsertTokenMetadata(unsupportedRows);
    upserts += unsupportedRows.length;
    console.log(
      `inserted unsupported batch: ${unsupportedRows.length} token(s)`
    );
  }

  for (const [chain, group] of grouped.entries()) {
    const chunks = chunk(group.rows, BATCH_SIZE);
    console.log(
      `fetching ${chain}: ${group.rows.length} token(s) in ${chunks.length} chunk(s)`
    );

    for (const [index, rowsChunk] of chunks.entries()) {
      console.log(
        `fetching ${chain} chunk ${index + 1}/${chunks.length}: ${
          rowsChunk.length
        } token(s)`
      );
      const rows = await fetchChunk(chain, group.sdkChain, rowsChunk);
      await upsertTokenMetadata(rows);
      upserts += rows.length;
      console.log(
        `inserted ${chain} chunk ${index + 1}/${chunks.length}: ${
          rows.length
        } token(s)`
      );
    }
  }

  console.log(`upserts: ${upserts}`);
  return {
    status: 'success',
    candidates: candidates.length,
    upserts,
  };
};

const fetchChunk = async (chain, sdkChain, rows) => {
  const addresses = rows.map((row) => row.address);
  const calls = addresses.map((address) => ({ target: address }));
  const nameRows = rows.filter((row) => row.fetch_name);
  const nameCalls = nameRows.map((row) => ({ target: row.address }));
  const attemptedAt = new Date();

  const [symbolResult, decimalsResult, nameResult] = await Promise.allSettled([
    sdk.api.abi.multiCall({
      abi: ERC20_ABI.symbol,
      calls,
      chain: sdkChain,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: ERC20_ABI.decimals,
      calls,
      chain: sdkChain,
      permitFailure: true,
    }),
    nameCalls.length
      ? sdk.api.abi.multiCall({
          abi: ERC20_ABI.name,
          calls: nameCalls,
          chain: sdkChain,
          permitFailure: true,
        })
      : Promise.resolve({ output: [] }),
  ]);

  const symbolRes =
    symbolResult.status === 'fulfilled' ? symbolResult.value : { output: [] };
  const decimalsRes =
    decimalsResult.status === 'fulfilled'
      ? decimalsResult.value
      : { output: [] };
  const nameRes =
    nameResult.status === 'fulfilled' ? nameResult.value : { output: [] };

  if (symbolResult.status === 'rejected') {
    console.log(
      `symbol fetch failed for ${chain}: ${
        symbolResult.reason?.message || symbolResult.reason
      }`
    );
  }

  if (decimalsResult.status === 'rejected') {
    console.log(
      `decimals fetch failed for ${chain}: ${
        decimalsResult.reason?.message || decimalsResult.reason
      }`
    );
  }

  if (nameResult.status === 'rejected') {
    console.log(
      `name fetch failed for ${chain}: ${
        nameResult.reason?.message || nameResult.reason
      }`
    );
  }

  const nameByAddress = new Map(
    nameRows.map((row, i) => [
      row.address,
      normalizeText(nameRes.output[i]?.output),
    ])
  );

  return rows.map((row, i) => {
    const address = row.address;
    const symbol = normalizeText(symbolRes.output[i]?.output);
    const decimals = normalizeInteger(decimalsRes.output[i]?.output);
    const name = row.fetch_name ? nameByAddress.get(address) ?? null : null;

    return {
      chain,
      address,
      symbol,
      name,
      decimals,
      last_attempt_at: attemptedAt,
    };
  });
};

const normalizeText = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeInteger = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const getChainMap = async () => {
  const { data } = await axios.get(
    'https://api.llama.fi/overview/_internal/chain-name-id-map'
  );
  return data;
};
