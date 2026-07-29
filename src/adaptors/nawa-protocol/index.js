const axios = require('axios');
const utils = require('../utils');

const PROJECT = 'nawa-protocol';
const CHAIN = 'ZIGChain';
const LCD = 'https://public-zigchain-lcd.numia.xyz';
const VAULT_URL = 'https://www.nawa.finance/vault/usdc';

const USDC_VAULT = 'zig1fn4rrr5knlg93nf3wyme9fzmgve3fftxu5l7wv90llp77mwg7ctq2lfwtd';
const USDC_DENOM =
  'ibc/6490A7EAB61059BFC1CDDEB05917DD70BDF3A611654162A1A47DB930D40D8AF4';
const SHARE_DENOM = `coin.${USDC_VAULT}.n1usdc`;
const USDC_PRICE_KEY = 'coingecko:usd-coin';

const SECONDS_PER_DAY = 24 * 60 * 60;
const APY_LOOKBACK_DAYS = 7;
const BLOCK_SAMPLE_SIZE = 100000;

const encodeQuery = (query) =>
  Buffer.from(JSON.stringify(query)).toString('base64');

const queryContract = async (contract, query, height) => {
  const encoded = encodeQuery(query);
  const options = height
    ? { headers: { 'x-cosmos-block-height': String(height) } }
    : undefined;

  const { data } = await axios.get(
    `${LCD}/cosmwasm/wasm/v1/contract/${contract}/smart/${encoded}`,
    options
  );

  return data?.data;
};

const getBlock = async (height = 'latest') => {
  const { data } = await axios.get(
    `${LCD}/cosmos/base/tendermint/v1beta1/blocks/${height}`
  );

  return {
    height: Number(data.block.header.height),
    timestamp: Date.parse(data.block.header.time),
  };
};

const getHistoricalHeight = async (daysAgo) => {
  const latest = await getBlock();
  const sampleHeight = Math.max(1, latest.height - BLOCK_SAMPLE_SIZE);
  const sample = await getBlock(sampleHeight);
  const secondsPerBlock =
    (latest.timestamp - sample.timestamp) / 1000 / (latest.height - sample.height);

  return {
    latest,
    height: Math.max(
      1,
      latest.height - Math.round((daysAgo * SECONDS_PER_DAY) / secondsPerBlock)
    ),
  };
};

const getPricePerShare = async (height) => {
  const result = await queryContract(
    USDC_VAULT,
    { asset_for_shares: { shares: '1000000' } },
    height
  );

  return Number(result?.asset) / 1e6;
};

const getApy = async () => {
  const currentPps = await getPricePerShare();
  const historicalHeight = await getHistoricalHeight(APY_LOOKBACK_DAYS);
  const historicalBlock = await getBlock(historicalHeight.height);
  const historicalPps = await getPricePerShare(historicalHeight.height);

  const days =
    (historicalHeight.latest.timestamp - historicalBlock.timestamp) /
    1000 /
    SECONDS_PER_DAY;

  if (
    !Number.isFinite(currentPps) ||
    !Number.isFinite(historicalPps) ||
    historicalPps <= 0 ||
    days <= 0
  ) {
    throw new Error('Invalid Nawa USDC vault price-per-share data');
  }

  return (Math.pow(currentPps / historicalPps, 365 / days) - 1) * 100;
};

const apy = async () => {
  const [{ aum }, prices, apyBase] = await Promise.all([
    queryContract(USDC_VAULT, { aum: {} }),
    utils.getPriceApiData(`/prices/current/${USDC_PRICE_KEY}`),
    getApy(),
  ]);

  const usdcPrice = prices?.coins?.[USDC_PRICE_KEY]?.price || 1;
  const tvlUsd = (Number(aum) / 1e6) * usdcPrice;

  return [
    {
      pool: `${USDC_VAULT}-zigchain`,
      chain: CHAIN,
      project: PROJECT,
      symbol: 'USDC',
      tvlUsd,
      apyBase,
      apyBase7d: apyBase,
      underlyingTokens: [USDC_DENOM],
      searchTokenOverride: SHARE_DENOM,
      poolMeta: 'n1USDC Vault',
      url: VAULT_URL,
    },
  ];
};

module.exports = {
  protocolId: '6096',
  apy,
  timetravel: false,
  url: VAULT_URL,
};
