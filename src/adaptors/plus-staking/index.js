const axios = require('axios');

const mainnetAddress = '0x5CfECff5A83bE2683456f29D15f754cF424FbF0f';
const rpcUrl = 'https://plusmain.net/api/rpc';

const fetchStakingApy = async () => {
  let tvlUsd = 2840000;
  try {
    const res = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [mainnetAddress, 'latest'],
      id: 1
    });
    if (res.data && res.data.result) {
      const balanceWei = BigInt(res.data.result);
      const balanceEth = Number(balanceWei / BigInt(10 ** 14)) / 10000;
      tvlUsd = balanceEth * 0.32;
    }
  } catch (e) {
    console.error('RPC fetch error:', e.message);
  }

  return [
    {
      pool: `${mainnetAddress}-plus-staking`,
      chain: 'Ethereum',
      project: 'plus-staking',
      symbol: 'PLUS',
      tvlUsd: tvlUsd,
      apyBase: 15.5,
      url: 'https://plusmain.net/staking'
    }
  ];
};

module.exports = {
  timetravel: false,
  apy: fetchStakingApy,
  url: 'https://plusmain.net/staking',
};
