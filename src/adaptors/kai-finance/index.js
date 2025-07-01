const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const BigNumber = require('bignumber.js');

const RPC_URL = 'https://fullnode.mainnet.sui.io'

const VAULTS = [
  {
    id: '0x7a2f75a3e50fd5f72dfc2f8c9910da5eaa3a1486e4eb1e54a825c09d82214526',
    coinType: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN', // wUSDC
  },
  {
    id: '0x0fce8baed43faadf6831cd27e5b3a32a11d2a05b3cd1ed36c7c09c5f7bcb4ef4',
    coinType: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', // wUSDT
  },
  {
    id: '0x16272b75d880ab944c308d47e91d46b2027f55136ee61b3db99098a926b3973c',
    coinType: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI', // SUI
  },
  {
    id: '0x3e8a6d1e29d2c86aed50d6055863b878a7dd382de22ea168177c80c1d7150061',
    coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', // USDC
  },
  {
    id: '0xbfcab5f22e253be0768e2cc5e75e170c5266edf7b68c813af0d676e84285681c',
    coinType: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', // USDT
  },
  {
    id: '0x02ec915b35fb958ca9a7d94e57d7254513ff711832ba8aebfc0ac3395152260b',
    coinType: '0x960b531667636f39e85867775f52f6b1f220a058c4de786905bdf761e06a56bb::usdy::USDY' // USDY
  },
  {
    id: '0x6e58792dccbaa1d1d708d9a847a7c5b3f90c7878d1b76fd79afa48d31063bca6',
    coinType: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP' // DEEP
  },
]

async function getCoinInfos(coinTypes) {
  const usdcType = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
  const response = await fetch(`https://coins.llama.fi/prices/current/${coinTypes.map(c=>`sui:${c}`).join(',')}`)

  const json = await response.json();
  return coinTypes.map(coinType => json.coins[`sui:${coinType}`]);
}

async function getApyData() {
  const vaultIds = VAULTS.map(vault => vault.id);
  const coinTypes = VAULTS.map(vault => vault.coinType);

  const [vaultsResponse, coinInfos] = await Promise.all([axios.post(RPC_URL, {
    jsonrpc: "2.0",
    id: 1,
    method: "sui_multiGetObjects",
    params: [
      vaultIds,
        {
          showContent: true,
        }
      ]
    }),
    getCoinInfos(coinTypes)
  ]);

  const apyData = [];
  for (let i = 0; i < vaultsResponse.data.result.length; i++) {
    const vaultInfo = VAULTS[i];
    const vaultResponse = vaultsResponse.data.result[i];
    const coinInfo = coinInfos[i]

    const vaultData = vaultResponse.data.content.fields;
    const tlp = vaultData.time_locked_profit.fields;

    let tvl = BigNumber(vaultData.free_balance)
    for (const strategy of vaultData.strategies.fields.contents) {
      tvl = tvl.plus(BigNumber(strategy.fields.value.fields.borrowed))
    }
    const tvlUsd = tvl.div(10 ** coinInfo.decimals).times(coinInfo.price).toNumber();

    const now = Date.now() / 1000;
    let unlockPerSecond = new BigNumber(tlp.unlock_per_second)
    if (now > Number(tlp.final_unlock_ts_sec)) {
      unlockPerSecond = new BigNumber(0)
    }

    let apr
    const unlockPerYear = unlockPerSecond.times(365 * 24 * 60 * 60);
    if (tvl.gt(0)) {
      apr = unlockPerYear.div(tvl).toNumber()
    } else {
      apr = 0
    }
    const apy = utils.aprToApy(apr * 100)

    apyData.push({
      pool: vaultInfo.id,
      chain: utils.formatChain('sui'),
      project: 'kai-finance',
      symbol: coinInfo.symbol,
      apy,
      tvlUsd,
    })
  }

  return apyData;
};

module.exports = {
  timetravel: false,
  apy: getApyData,
  url: 'https://kai.finance',
};