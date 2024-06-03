const sdk = require('@defillama/sdk');
const axios = require('axios');
const VAMM_ABI_JSON = require('./vamm.abi.json');
const { BigNumber } = require('ethers');

const API_BASE = 'https://mainnet-efb9f.web.app/apy';
const HIF = '0x870850A72490379f60A4924Ca64BcA89a6D53a9d';
const HUSD = '0x5c6FC0AaF35A55E7a43Fff45575380bCEdb5Cbc2';
const AVAX_VAMM = '0x269Cd1827fCa5c4d3c7748C45708806c026052FE';
const CHAIN = 'avax';
const WAVAX = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';

const main = async () => {
  const {
    data: { hour: makerApy },
  } = await axios.get(`${API_BASE}/maker/AVAX-PERP`);

  const priceKey = `avax:${WAVAX}`;
  const { data: prices } = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  const avaxPrice = prices.coins[priceKey].price;
  const TEN = BigNumber.from(10);

  const [vammHusdBalance, vammAvaxBalance] = await Promise.all([
    sdk.api.abi
      .call({
        target: AVAX_VAMM,
        abi: VAMM_ABI_JSON.find((x) => x.name === 'balances'),
        params: [0],
        chain: CHAIN,
      })
      .then((x) => BigNumber.from(x.output).div(TEN.pow(6)).toNumber()),
    sdk.api.abi
      .call({
        target: AVAX_VAMM,
        abi: VAMM_ABI_JSON.find((x) => x.name === 'balances'),
        params: [1],
        chain: CHAIN,
      })
      .then((x) =>
        BigNumber.from(x.output)
          .div(TEN.pow(18))
          .mul(Math.floor(avaxPrice * 100))
          .div(100)
          .toNumber()
      ),
  ]);

  const avaxMakerPool = {
    pool: `maker-AVAX`,
    apy: +makerApy,
    symbol: `AVAX-hUSD-USDC`,
    tvlUsd: vammAvaxBalance + vammHusdBalance,
  };

  const {
    data: { hour: hifApy },
  } = await axios.get(`${API_BASE}/insurance`);
  const husdBalance = await sdk.api.erc20.balanceOf({
    target: HUSD,
    owner: HIF,
    chain: 'avax',
    decimals: 6,
  });

  const hifPool = {
    pool: 'HIF',
    apy: +hifApy,
    symbol: 'USDC',
    tvlUsd: +husdBalance.output,
  };

  const allPools = [avaxMakerPool, hifPool];

  return allPools.map((pool) => ({
    ...pool,
    chain: 'Avalanche',
    project: 'hubble-exchange',
  }));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.hubble.exchange',
};
