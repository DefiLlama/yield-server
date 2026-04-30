const axios = require('axios');
const sdk = require('@defillama/sdk');
const { keepFinite, getPrices } = require('../utils');

const MELLOW_API = 'https://api.mellow.finance/v1/vaults';

const ETH_NULL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const THQ_BASE = '0x0b2558bdBC7FFEC0f327fB3579c23daBD1699706';

const TQETH_VAULT = '0xDbC81B33A23375A90c8Ba4039d5738CB6f56fE8d';
const TQETH_TOKEN = '0x4076D217fAA2813165235b4f0D9C03B67bfF9355'; // shareManager = tqETH ERC20
const STHQ_VAULT = '0xbe515939fBA844A7063f119225012B072cE40D0c'; // vault itself is sTHQ ERC20

const oracleAbi = {
  inputs: [{ name: 'asset', type: 'address' }],
  name: 'getReport',
  outputs: [
    { name: 'priceD18', type: 'uint224' },
    { name: 'timestamp', type: 'uint32' },
    { name: 'isSuspicious', type: 'bool' },
  ],
  stateMutability: 'view',
  type: 'function',
};

// TVL = totalShares / priceD18(ETH) * ethPriceUsd
// priceD18 is the oracle's exchange rate: shares = deposit * priceD18 / 1e18
// So 1 share = 1e18 / priceD18 ETH, and total ETH = totalShares * 1e18 / priceD18
const getTqethTvl = async () => {
  const [shareManagerRes, oracleRes] = await Promise.all([
    sdk.api.abi.call({
      target: TQETH_VAULT,
      abi: 'address:shareManager',
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: TQETH_VAULT,
      abi: 'address:oracle',
      chain: 'ethereum',
    }),
  ]);

  const [totalSharesRes, reportRes, pricesRes] = await Promise.all([
    sdk.api.abi.call({
      target: shareManagerRes.output,
      abi: 'function totalShares() view returns (uint256)',
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: oracleRes.output,
      abi: oracleAbi,
      params: [ETH_NULL],
      chain: 'ethereum',
    }),
    getPrices([WETH], 'ethereum'),
  ]);

  const totalShares = BigInt(totalSharesRes.output);
  const priceD18 = BigInt(reportRes.output.priceD18);
  const ethPrice = pricesRes.pricesByAddress[WETH.toLowerCase()];

  const tvlWei = (totalShares * 10n ** 18n) / priceD18;
  const tvlEth = Number(tvlWei) / 1e18;

  return tvlEth * ethPrice;
};

const getSthqTvl = async () => {
  const balance = (
    await sdk.api.abi.call({
      target: THQ_BASE,
      abi: 'erc20:balanceOf',
      params: [STHQ_VAULT],
      chain: 'base',
    })
  ).output;

  const { pricesByAddress } = await getPrices([THQ_BASE], 'base');
  const thqPrice = pricesByAddress[THQ_BASE.toLowerCase()] || 0;

  return (Number(balance) / 1e18) * thqPrice;
};

const apy = async () => {
  const [{ data }, tqethTvl, sthqTvl] = await Promise.all([
    axios.get(MELLOW_API),
    getTqethTvl(),
    getSthqTvl(),
  ]);

  const pools = [];

  // tqETH pool
  const tqethVault = data.find((v) => v.id === 'ethereum-tqeth');
  if (tqethVault) {
    pools.push({
      pool: `${TQETH_VAULT.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project: 'theoriq-alphavault-eth',
      symbol: 'tqETH',
      tvlUsd: tqethTvl,
      apyBase: tqethVault.apy || 0,
      underlyingTokens: [WETH],
      token: TQETH_TOKEN,
      url: 'https://infinity.theoriq.ai/vault',
    });
  }

  // sTHQ pool
  const sthqVault = data.find((v) => v.id === 'theoriq-staking-pool');
  if (sthqVault && sthqVault.apy != null) {
    pools.push({
      pool: `${STHQ_VAULT.toLowerCase()}-base`,
      chain: 'Base',
      project: 'theoriq-alphavault-eth',
      symbol: 'sTHQ',
      tvlUsd: sthqTvl,
      apyBase: sthqVault.apy || 0,
      underlyingTokens: [THQ_BASE],
      token: STHQ_VAULT,
      url: 'https://infinity.theoriq.ai/vault',
    });
  }

  return pools.filter((p) => keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://infinity.theoriq.ai/vault',
};
