const utils = require('../utils');

const PROJECT = 'valdora-finance';
const CHAIN = 'ZIGChain';
const LCD = 'https://public-zigchain-lcd.numia.xyz';

const STAKER_CONTRACT =
  'zig18nnde5tpn76xj3wm53n0tmuf3q06nruj3p6kdemcllzxqwzkpqzqk7ue55';
const STZIG_DENOM =
  'coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig';
const ZIG_PRICE_KEY = 'zigchain:uzig';
const DECIMALS = 1e6;
const PERFORMANCE_FEE = 0.10;
const COMMUNITY_TAX = 0.02;

const VALIDATORS = [
  'zigvaloper18vykgjgcmp2z4xzkt6mh74glrpd7qda8fqldrl',
  'zigvaloper1vd9ljpsgq5ev7yf7r6tu7t237qqpf2vehp4kvp',
  'zigvaloper1jh6jve7n4pu9vxnmr67eg4m6qk7d7s4lf4uu0j',
  'zigvaloper15pwqnx4hgkwq839xv3jgjxh9aj2wdg8p8dgy76',
];

const get = (path) => utils.getData(`${LCD}${path}`);

const queryContract = async (contract, data) => {
  const query = Buffer.from(JSON.stringify(data)).toString('base64');
  const response = await get(`/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`);
  return response.data;
};

const getAverageValidatorCommission = async () => {
  const results = await Promise.allSettled(
    VALIDATORS.map(async (validator) => {
      const data = await get(`/cosmos/staking/v1beta1/validators/${validator}`);
      return Number(data.validator?.commission?.commission_rates?.rate || 0);
    })
  );

  const commissions = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  if (!commissions.length) return 0;
  return commissions.reduce((sum, value) => sum + value, 0) / commissions.length;
};

const getStzigApr = async () => {
  const [annualProvisions, stakingPool, averageCommission] = await Promise.all([
    get('/cosmos/mint/v1beta1/annual_provisions'),
    get('/cosmos/staking/v1beta1/pool'),
    getAverageValidatorCommission(),
  ]);

  const annualProvisionsZig = Number(annualProvisions.annual_provisions) / DECIMALS;
  const bondedZig = Number(stakingPool.pool?.bonded_tokens || 0) / DECIMALS;

  if (!bondedZig) return 0;
  return (
    (annualProvisionsZig / bondedZig) *
    (1 - COMMUNITY_TAX) *
    (1 - averageCommission) *
    (1 - PERFORMANCE_FEE) *
    100
  );
};

const apy = async () => {
  const [fundsRaised, apyBase, totalSupply, priceData] = await Promise.all([
    queryContract(STAKER_CONTRACT, { funds_raised: {} }),
    getStzigApr(),
    queryContract(STAKER_CONTRACT, { total_supply: {} }),
    utils.getPriceApiData(`/prices/current/${ZIG_PRICE_KEY}`),
  ]);

  const zigPrice = priceData.coins[ZIG_PRICE_KEY]?.price;
  if (!zigPrice) throw new Error('Unable to fetch ZIG price');

  const fundsRaisedValue = Number(fundsRaised.funds_raised || 0);
  const totalSupplyValue = Number(totalSupply.total_supply || 1);
  const tvlUsd = (fundsRaisedValue / DECIMALS) * zigPrice;
  const pricePerShare = fundsRaisedValue / totalSupplyValue;

  return [
    {
      pool: `${STZIG_DENOM}-${CHAIN}`.toLowerCase(),
      chain: CHAIN,
      project: PROJECT,
      symbol: 'stZIG',
      tvlUsd,
      apyBase,
      pricePerShare,
      underlyingTokens: ['uzig'],
      searchTokenOverride: STZIG_DENOM,
      isIntrinsicSource: true,
      url: 'https://valdora.finance/stake',
    },
  ].filter((pool) => utils.keepFinite(pool));
};

module.exports = {
  protocolId: '6991',
  timetravel: false,
  apy,
  url: 'https://valdora.finance/stake',
};
