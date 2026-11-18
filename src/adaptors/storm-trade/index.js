const sdk = require('@defillama/sdk');
const utils = require('../utils');

const ton = sdk.chains.ton;

const TON_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
const WINDOW_DAYS = 7;
const YEAR = 365 * 24 * 60 * 60;

const VAULTS = [
  { address: '0:33e9e84d7cbefff0d23b395875420e3a1ecb82e241692be89c7ea2bd27716b77', name: 'USDT', asset: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe' },
  { address: '0:e926764ff3d272c73ddeb836975c5521c025ad68e7919a25094e2de3198805f1', name: 'TON', asset: TON_ADDRESS },
  { address: '0:06f3f073c255a49aa6fdcc89abf512638e065908b30e4173fd3d1d01d4f607bd', name: 'NOT', asset: '0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc' },
  { address: '0:f29d17a209e2bcc652916d802ba69e23cb366e17afad61f8453343b9ba53ace4', name: 'jUSDT', asset: '0:729c13b6df2c07cbf0a06ab63d34af454f3d320ec1bcd8fb5c6d24d0806a17c2' },
  { address: '0:c4f862706efb41ea606b437e5ff847555db8ef493169543b26eb359cbef26faf', name: 'USDe', asset: '0:086fa2a675f74347b08dd4606a549b8fdb98829cb282bc1949d3b12fbaed9dcc' },
  { address: '0:fa87bdeb3c237eb2b6daf71b35095011b31fbc7115de332c148af3887d5c73d9', name: 'tgUSD', asset: '0:89ec04b13a423a5ace4187c27be1765b457f3ceb58c5813653e360d7bfbd7e50' },
];

// get_vault_data stack: [1] LP rate (1e9 = 1), [3] free balance, [4] locked balance
const vaultData = async (address, seqno) => {
  const res = await ton.toncenterPost({
    path: 'runGetMethod',
    body: { address, method: 'get_vault_data', stack: [], seqno },
  });
  if (!res?.ok || res.result.exit_code !== 0) {
    throw new Error(`get_vault_data ${address}: ${JSON.stringify(res)}`);
  }
  const num = (i) => Number(BigInt(res.result.stack[i][1]));
  return { rate: num(1), balance: num(3) + num(4) };
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const then = now - WINDOW_DAYS * 86400;
  const { number: pastSeqno } = await ton.getBlockAtTimestamp({ timestamp: then });

  const priceKeys = VAULTS.map((v) => `ton:${v.asset}`);
  const prices = await utils.getPriceApiCoins(priceKeys);

  const pools = [];
  for (const vault of VAULTS) {
    try {
      const current = await vaultData(vault.address);
      const past = await vaultData(vault.address, pastSeqno);
      const price = prices[`ton:${vault.asset}`]?.price;
      if (!price) {
        console.error(`storm-trade: no price for ${vault.name}`);
        continue;
      }
      pools.push({
        pool: `${vault.address}-ton`.toLowerCase(),
        chain: 'Ton',
        project: 'storm-trade',
        symbol: vault.name === 'TON' ? 'GRAM' : vault.name,
        tvlUsd: (current.balance / 1e9) * price,
        apyBase:
          (Math.pow(current.rate / past.rate, YEAR / (now - then)) - 1) * 100,
        underlyingTokens: [vault.asset],
        url: `https://app.storm.tg/vault/${vault.name}`,
      });
    } catch (e) {
      console.error(`storm-trade: ${vault.name} failed: ${e.message}`);
    }
  }
  return pools.filter((p) => p.tvlUsd > 0);
};

module.exports = {
  protocolId: '3883',
  apyWindowDays: WINDOW_DAYS,
  timetravel: false,
  apy,
  url: 'https://storm.tg/',
};
