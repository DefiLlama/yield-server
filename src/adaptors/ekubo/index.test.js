const ETH_CHAIN_ID = '0x1';
const STARKNET_CHAIN_ID = '0x534e5f4d41494e';
const ETH_ADDRESS = '0x0';
const EKUBO_ADDRESS = '0x04c46e830bb56ce22735d5d8fc9cb90309317d0f';

const ethToken = {
  chain_id: ETH_CHAIN_ID,
  name: 'Ether',
  symbol: 'ETH',
  decimals: 18,
  address: ETH_ADDRESS,
  usd_price: 2310.3264365204777,
};

const ekuboToken = {
  chain_id: ETH_CHAIN_ID,
  name: 'Ekubo Protocol',
  symbol: 'EKUBO',
  decimals: 18,
  address: EKUBO_ADDRESS,
  usd_price: 0.8936758003703835,
};

const pair = {
  chain_id: ETH_CHAIN_ID,
  token0: ETH_ADDRESS,
  token1: EKUBO_ADDRESS,
  volume0_24h: '931810538810305042',
  volume1_24h: '11828892519291022448316',
  fees0_24h: '153729662409413096',
  fees1_24h: '403598882952410969059',
  tvl0_total: '30405140735339393345',
  tvl1_total: '227161128808305189716433',
  tvl0_delta_24h: '-3223306989060742629',
  tvl1_delta_24h: '-955947067019096170934',
  depth0: '8571066288926275279',
  depth1: '27620395830647224117309',
  min_depth_percent: 0.06995424542672857,
};

const onePercentPool = {
  pool_id:
    '90445080438184236448110574732982001095829327492087868903191125170153638874587',
  fee: '184467440737095516',
  tick_spacing: 19802,
  core_address: '419158689850197445874348837295873',
  extension: '1214349190246432251686492843064261689358346620830',
  volume0_24h: '844193103298675366',
  volume1_24h: '11290524911189608756089',
  fees0_24h: '153729662409413096',
  fees1_24h: '403480711864748784550',
  tvl0_total: '24543972432150514700',
  tvl1_total: '210518756653798473661599',
  tvl0_delta_24h: '-3101064642161266409',
  tvl1_delta_24h: '-659641295373470558508',
  depth0: '8376756230684076009',
  depth1: '27120729037699129626960',
  depth_percent: 0.06995424542672857,
  stableswap_params: null,
  boosts: null,
};

const zeroFeePool = {
  pool_id:
    '12053805043834053410901916558343322500898273276412807550551192876125760852850',
  fee: '0',
  tick_spacing: null,
  core_address: '419158689850197445874348837295873',
  extension: '465245150363907239117452222836428538392328753712',
  volume0_24h: '87617435511629676',
  volume1_24h: '498977245547352188692',
  fees0_24h: '0',
  fees1_24h: '0',
  tvl0_total: '4850823578585413748',
  tvl1_total: '12676016991205506460980',
  tvl0_delta_24h: '-106838322493291191',
  tvl1_delta_24h: '273169977755478478020',
  depth0: '162533650504961434',
  depth1: '418061193714381651997',
  depth_percent: 0.06995424542672857,
  stableswap_params: { center_tick: 0, amplification: 0 },
  boosts: null,
};

function getMockData(url) {
  if (url.includes(`/tokens?chainId=1`)) {
    return Promise.resolve([ethToken, ekuboToken]);
  }

  if (url.includes(`/overview/pairs?chainId=1`)) {
    return Promise.resolve({ topPairs: [pair] });
  }

  if (
    url.includes(
      `/pair/1/${encodeURIComponent(ETH_ADDRESS)}/${encodeURIComponent(
        EKUBO_ADDRESS
      )}/pools`
    )
  ) {
    return Promise.resolve({ topPools: [zeroFeePool, onePercentPool] });
  }

  if (url.includes(`/campaigns?chainId=1`)) {
    return Promise.resolve({ campaigns: [] });
  }

  if (url.includes(`/tokens?chainId=${encodeURIComponent(BigInt(STARKNET_CHAIN_ID).toString())}`)) {
    return Promise.resolve([]);
  }

  if (
    url.includes(
      `/overview/pairs?chainId=${encodeURIComponent(BigInt(STARKNET_CHAIN_ID).toString())}`
    )
  ) {
    return Promise.resolve({ topPairs: [] });
  }

  if (url.includes(`/campaigns?chainId=${encodeURIComponent(BigInt(STARKNET_CHAIN_ID).toString())}`)) {
    return Promise.resolve({ campaigns: [] });
  }

  throw new Error(`Unexpected URL: ${url}`);
}

describe('Ekubo adapter', () => {
  test('includes the live EKUBO-ETH 1% pool and uses market depth for base APY', async () => {
    jest.resetModules();
    jest.doMock('../utils', () => ({
      getData: jest.fn((url) => getMockData(url)),
      formatAddress: (address) => String(address).toLowerCase(),
      padStarknetAddress: (address) => address,
      formatChain: (chain) => chain.charAt(0).toUpperCase() + chain.slice(1),
      keepFinite: (pool) =>
        Object.values(pool).every(
          (value) => typeof value !== 'number' || Number.isFinite(value)
        ),
    }));

    const { apy } = require('./index');
    const pools = await apy();

    expect(pools).toHaveLength(2);
    const pool = pools.find((entry) => entry.poolMeta === '1.00% fee | CL range 7.00%');

    expect(pool).toBeDefined();
    expect(pool).toMatchObject({
      project: 'ekubo',
      chain: 'Ethereum',
      symbol: 'ETH-EKUBO',
      tvlUsd: expect.any(Number),
      apyBase: expect.any(Number),
      poolMeta: '1.00% fee | CL range 7.00%',
    });
    expect(pool.underlyingTokens).toEqual([
      ETH_ADDRESS,
      EKUBO_ADDRESS,
    ]);
    expect(pool.apyBase).toBeGreaterThan(590);
    expect(pool.apyBase).toBeLessThan(610);
  });
});
