const BigNumber = require('bignumber.js');
const shared = require('../rhea-lend/data');
const { assertConservation, assertShareIdentity } = require('./math');

const XRHEA_CONTRACT = 'xtoken.rhealab.near';
const RHEA_TOKEN = 'token.rhealab.near';
const RNEAR_CONTRACT = 'lst.rhealab.near';
const RNEAR_APY_URL = 'https://api.rhea.finance/get-rnear-apy';

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function rawInteger(value, name) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function blockHeight(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Invalid staking block height');
  }
  return value;
}

function tokenMetadata(value, expectedDecimals, name) {
  const metadata = object(value, `${name} token metadata`);
  if (metadata.decimals !== expectedDecimals) {
    throw new Error(`Invalid ${name} token decimals`);
  }
  return metadata;
}

function exitFees(value) {
  const fees = object(value, 'RHEA exit fees');
  const entries = Object.entries(fees);
  if (
    entries.length === 0 ||
    entries.some(
      ([days, bps]) =>
        !/^\d+$/.test(days) ||
        typeof bps !== 'number' ||
        !Number.isSafeInteger(bps) ||
        bps < 0 ||
        bps > 10000
    )
  ) {
    throw new Error('Invalid RHEA exit fee schedule');
  }
  return fees;
}

async function xrheaSnapshot(height, client = shared) {
  const fixedHeight = blockHeight(height);
  const [metadataValue, supplyValue, virtualPriceValue, tokenValue, feesValue] =
    await Promise.all([
      client.view(XRHEA_CONTRACT, 'contract_metadata', {}, fixedHeight),
      client.view(XRHEA_CONTRACT, 'ft_total_supply', {}, fixedHeight),
      client.view(XRHEA_CONTRACT, 'get_virtual_price', {}, fixedHeight),
      client.view(XRHEA_CONTRACT, 'ft_metadata', {}, fixedHeight),
      client.view(XRHEA_CONTRACT, 'get_exit_fee_bps', {}, fixedHeight),
    ]);

  const metadata = object(metadataValue, 'xRHEA contract metadata');
  if (metadata.locked_token_id !== RHEA_TOKEN) {
    throw new Error('Invalid xRHEA locked token');
  }
  const supply = rawInteger(supplyValue, 'xRHEA supply');
  const virtualPrice = rawInteger(virtualPriceValue, 'xRHEA virtual price');
  const receiptMetadata = tokenMetadata(tokenValue, 18, 'xRHEA');
  const fees = exitFees(feesValue);

  const locked = rawInteger(
    metadata.locked_token_amount,
    'locked_token_amount'
  );
  const currentLocked = rawInteger(
    metadata.cur_locked_token_amount,
    'cur_locked_token_amount'
  );
  rawInteger(metadata.reward_per_sec, 'reward_per_sec');
  const undistributed = rawInteger(
    metadata.undistributed_reward_amount,
    'undistributed_reward_amount'
  );
  const currentUndistributed = rawInteger(
    metadata.cur_undistributed_reward_amount,
    'cur_undistributed_reward_amount'
  );

  assertConservation(
    locked,
    undistributed,
    currentLocked,
    currentUndistributed
  );
  assertShareIdentity(currentLocked, supply, virtualPrice, 8);

  return {
    metadata,
    supply,
    virtualPrice,
    tokenMetadata: receiptMetadata,
    exitFees: fees,
  };
}

async function rnearSnapshot(height, client = shared) {
  const fixedHeight = blockHeight(height);
  const [summaryValue, supplyValue, tokenValue] = await Promise.all([
    client.view(RNEAR_CONTRACT, 'get_summary', {}, fixedHeight),
    client.view(RNEAR_CONTRACT, 'ft_total_supply', {}, fixedHeight),
    client.view(RNEAR_CONTRACT, 'ft_metadata', {}, fixedHeight),
  ]);

  const summary = object(summaryValue, 'rNEAR summary');
  const totalShares = rawInteger(
    summary.total_share_amount,
    'rNEAR total_share_amount'
  );
  const totalStaked = rawInteger(
    summary.total_staked_near_amount,
    'rNEAR total_staked_near_amount'
  );
  const pricePerShare = rawInteger(summary.ft_price, 'rNEAR ft_price');
  const supply = rawInteger(supplyValue, 'rNEAR supply');
  const receiptMetadata = tokenMetadata(tokenValue, 24, 'rNEAR');

  if (!new BigNumber(supply).eq(totalShares)) {
    throw new Error('rNEAR supply does not match summary');
  }
  assertShareIdentity(totalStaked, totalShares, pricePerShare, 24);

  return { summary, supply, tokenMetadata: receiptMetadata };
}

async function nearApy(client = shared) {
  const body = await client.getJson(RNEAR_APY_URL);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    body.code !== 0
  ) {
    throw new Error('Invalid NEAR APY response');
  }
  if (
    (typeof body.data !== 'number' && typeof body.data !== 'string') ||
    (typeof body.data === 'string' && !/^\d+(?:\.\d+)?$/.test(body.data))
  ) {
    throw new Error('Invalid NEAR APY value');
  }

  const exact = new BigNumber(body.data);
  const result = exact.toNumber();
  if (
    !exact.isFinite() ||
    exact.lt(0) ||
    !Number.isFinite(result) ||
    (!exact.isZero() && result === 0)
  ) {
    throw new Error('Invalid NEAR APY value');
  }
  return result;
}

module.exports = { xrheaSnapshot, rnearSnapshot, nearApy };
