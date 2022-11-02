const BigNumber = require('bignumber.js');
const axios = require('axios');

const {
  calculateLendTableData,
  calcFarmTableData,
  commonCall,
  getVolume,
  getTvl,
} = require('./utils');

const tokensMetadata = require('./tokens_metadata');

const PEMBROCK_CONTRACT = 'v1.pembrock.near';
const REF_FINANCE_CONTRACT = 'v2.ref-finance.near';
const REF_BOOST_CONTRACT = 'boostfarm.ref-labs.near';
const PEM_TOKEN = 'token.pembrock.near';

const indexerUrl = 'https://indexer.ref.finance/';

const endpoint = 'https://rpc.mainnet.near.org/';

const getNearPrice = async (): Promise<string> => {
  return commonCall('https://helper.mainnet.near.org', 'get')
    .then((res) => res.json())
    .then((price) => {
      return price.near.usd.toString();
    })
    .catch(() => []);
};

async function call(contract, method, args = {}) {
  const result = await axios.post(endpoint, {
    jsonrpc: '2.0',
    id: '1',
    method: 'query',
    params: {
      request_type: 'call_function',
      finality: 'final',
      account_id: contract,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    },
  });
  if (result.data.error) {
    throw new Error(`${result.data.error.message}: ${result.data.error.data}`);
  }
  return JSON.parse(Buffer.from(result.data.result.result).toString());
}

async function getFormattedFarms(tokenPrices): Promise<[any[], any]> {
  const farms: Record<string, any> = await call(
    PEMBROCK_CONTRACT,
    'get_farms',
    {}
  );

  const volume = await Promise.all(
    Object.keys(farms).map((key) => {
      return getVolume(farms[key]['ref_pool_id']);
    })
  );

  const tvl = await Promise.all(
    Object.keys(farms).map((key) => {
      return getTvl(farms[key]['ref_pool_id']);
    })
  );

  const tokens = await call(PEMBROCK_CONTRACT, 'get_tokens', {});

  const arr = Object.keys(farms).map((key) => ({
    ...farms[key],
    pem_farm_id: +key,
  }));
  arr.forEach((item: Record<string, any>, index) => {
    // we need only 7 days exclude current day
    item.volume = volume[index].slice(1, 8);
    // we need only 7 days exclude current day
    item.tvl = tvl[index].slice(1, 8);

    item.token1 = tokens[item.token1_id];
    item.token2 = tokens[item.token2_id];
    item.t1meta = tokensMetadata[item.token1_id];
    item.t2meta = tokensMetadata[item.token2_id];

    item.tokensPriceList = tokenPrices || [];
  });

  for (let farm of arr) {
    const pool = await commonCall(
      indexerUrl,
      `list-pools-by-ids?ids=${farm.ref_pool_id}`
    );
    farm.pool = pool[0];
    const seed_id = `${REF_FINANCE_CONTRACT}@${farm.ref_pool_id}`;
    const listFarmsBySeed = await call(REF_BOOST_CONTRACT, 'list_seed_farms', {
      seed_id,
    });
    const seedInfo = await call(REF_BOOST_CONTRACT, 'get_seed', { seed_id });
    farm.listFarmsBySeed = listFarmsBySeed;
    farm.seedInfo = seedInfo;
  }

  const tokensList = Object.entries(tokens).map(
    ([key, value]: [string, any]) => ({
      id: key,
      ...value,
      refPrice: tokenPrices[key].price,
      metadata: tokensMetadata[key],
    })
  );
  return [arr, tokensList];
}

async function getLendPoolApyData(tokenInfos, pemTokenPrice) {
  const lendPools: Record<string, any> = await call(
    PEMBROCK_CONTRACT,
    'get_tokens',
    {
      account_id: PEMBROCK_CONTRACT,
    }
  );
  const lendPoolsApyData = [];

  for (let [token, lendPoolInfo] of Object.entries(lendPools)) {
    if (
      token === 'c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near'
    )
      continue;
    const tokenInfo = tokenInfos[token];

    const tokenPrice = new BigNumber(lendPoolInfo.total_supply)
      .multipliedBy(tokenInfo.price)
      .shiftedBy(-tokenInfo.decimal);

    const { totalLendAPY } = calculateLendTableData(
      {
        ...lendPoolInfo,
        metadata: tokensMetadata[token],
        refPrice: tokenInfo.price,
      },
      pemTokenPrice
    );

    lendPoolsApyData.push({
      pool: `${token}-lending`,
      chain: 'NEAR',
      project: 'pembrock-finance',
      symbol: tokensMetadata[token].symbol,
      poolMeta: 'Ref-Finance',
      apy: +totalLendAPY,
      tvlUsd: tokenPrice.toNumber(),
    });
  }
  return lendPoolsApyData;
}

async function getFarmPoolApyData(tokenInfos) {
  const [farms, tokens] = await getFormattedFarms(tokenInfos);
  const farmPoolsApyData = [];

  for (let farm of Object.values(farms)) {
    const token1 = tokensMetadata[farm['token1_id']];
    const token2 = tokensMetadata[farm['token2_id']];

    const leverage = 1000;

    const dataBorrowToken1 = calcFarmTableData(farm, true, leverage, tokens);
    const dataBorrowToken2 = calcFarmTableData(farm, false, leverage, tokens);

    const data =
      dataBorrowToken1.apy > dataBorrowToken2.apy
        ? dataBorrowToken1
        : dataBorrowToken2;

    farmPoolsApyData.push({
      pool: `ref-pool-${farm.ref_pool_id}-farming`,
      chain: 'NEAR',
      project: 'pembrock-finance',
      symbol: `${token1.symbol}-${token2.symbol}`,
      poolMeta: 'Ref-Finance',
      apy: +data.apy,
      tvlUsd: +data.tvl,
    });
  }

  return farmPoolsApyData;
}

async function getPemApy() {
  const tokenInfos = await commonCall(indexerUrl, 'list-token-price');
  const pemToken = tokenInfos[PEM_TOKEN];

  const lendPools = await getLendPoolApyData(tokenInfos, pemToken.price);
  const farmPools = await getFarmPoolApyData(tokenInfos);
  return [...lendPools, ...farmPools];
}

module.exports = {
  timetravel: false,
  apy: getPemApy,
  url: 'https://app.pembrock.finance/farm',
};
