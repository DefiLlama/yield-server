const sdk = require('@defillama/sdk');
const API_APY_URL = (chainId) => `https://api.killswitch.finance/ksw2/apy?chain=${chainId}`;
const API_TVL_URL = 'https://api.killswitch.finance/ksw/tvl';
const utils = require('../utils');
const POOL_ONE_TOKEN = {
  'bsc': [
    'apeswap.0x603c7f932ed1fc6575303d8fb018fdcbb0f39a95',
    'belt.0x51bd63f240fb13870550423d208452ca87c44444',
    'belt.0x9cb73f20164e399958261c289eb5f9846f4d1404',
    'belt.0xa8bb71facdd46445644c277f9499dd22f6f0a30c',
    'belt.0xaa20e8cb61299df2357561c2ac2e1172bc68bc25',
    'definix.0x070a9867ea49ce7afc4505817204860e823489fe',
    'definix.0x0f02b1f5af54e04fb6dd6550f009ac2429c4e30d',
    'evry.0xc2d4a3709e076a7a3487816362994a78ddaeabb6',
    'foodcourtv2.0x084bb94e93891d74579b54ab63ed24c4ef9cd5ef',
    'killswitch.0x270178366a592ba598c2e9d2971da65f7baa7c86',
    'luckylion.0xc3d912863152e1afc935ad0d42d469e7c6b05b77',
    'pancake.0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
    'samoyed.0xbdb44df0a914c290dfd84c1eaf5899d285717fdc'
  ],
  'aurora':[],
  'kcc': [],
};

const mapChainId = {
  'kcc': 321,
  'aurora': 1313161554,
  'bsc': 56,
};

const mapChain = {
  'bsc': 'binance',
  'aurora': 'aurora',
  'kcc': 'kcc',
};

const tokenAbi = (name) => {
  return {
    inputs: [],
    name: name,
    outputs: [
      {
        internalType: 'contract IERC20',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  };
};

const getTokenSymbol = async (pair, tokenAddress, chain) => {
  const [tokenSymbol, tokenDecimals] = await Promise.all(
    ['erc20:symbol'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain,
        requery: true,
      })
    )
  );
  return {
    lpToken: pair,
    pairName: tokenSymbol.output.map(e => e.output).join('-'),
    token0: {
      address: tokenAddress[0],
      symbol: tokenSymbol.output[0].output,
    },
    token1: {
      address: tokenAddress[1],
      symbol: tokenSymbol.output[1].output,
    }
  };
};

async function getApyByChain(chain, dataTvl) {
  const dataApy = await utils.getData(API_APY_URL(mapChainId[chain]));
  const lpTokens = Object.keys(dataTvl.data[chain])
    .filter(e => dataTvl.data[chain][e] !== '0')
    .filter(e => !POOL_ONE_TOKEN[chain].includes(e));

  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: tokenAbi(method),
        calls: lpTokens.map((address) => ({
          target: address.split('.')[1],
        })),
        chain: chain,
        requery: true,
      })
    )
  );

  const tokens0 = underlyingToken0.output.map((res) => res.output);
  const tokens1 = underlyingToken1.output.map((res) => res.output);
  const pools = await Promise.all(
    lpTokens.map((pool, i) =>
      getTokenSymbol(lpTokens[i], [tokens0[i], tokens1[i]], chain).then((pair) => {
        const _pool = {
          pool: pair.lpToken + `-${chain}`,
          chain: utils.formatChain(mapChain[chain]),
          project: 'killswitch',
          symbol: pair.pairName,
          tvlUsd: Number(dataTvl.data[chain][pool] || 0),
          apy: Number(dataApy[pool]?.apy || 0) * 100,
        };
        return _pool;
      })
    )
  );
  return pools.filter(e => e.apy !== 0);
};

async function apy() {
  const dataTvl = await utils.getData(API_TVL_URL);
  const bscApr = await getApyByChain('bsc', dataTvl);
  const auroraApr = await getApyByChain('aurora', dataTvl);
  const kccApr = await getApyByChain('kcc', dataTvl);
  return [...bscApr, ...auroraApr, ...kccApr];
}

module.exports = {
  timetravel: false,
  apy
};
