const axios = require('axios');
const { uint256 } = require('starknet');
const { call } = require('../../helper/starknet');
const { metricsAbi } = require('./abis/metricsAbi');
const { default: BigNumber } = require('bignumber.js');

const oracle =
  '0x07b05e8dc9c770b72befcf09599132093cf9e57becb2d1b3e89514e1f9bdf0ab';

const starknetFoundationIncentivesEndpoint =
  'https://kx58j6x5me.execute-api.us-east-1.amazonaws.com/starknet/fetchFile?file=prod-api/lending/lending_strk_grant.json';

const TOKENS = [
  {
    name: 'BTC',
    symbol: 'BTC',
    decimals: 8,
    minDeposit: '50000',
    maxDeposit: '100000000000',
    minLoan: '380000',
    maxLoan: '6600000',
    rToken: '0x1320a9910e78afc18be65e4080b51ecc0ee5c0a8b6cc7ef4e685e02b50e57ef',
    dToken: '0x2614c784267d2026042ab98588f90efbffaade8982567e93530db4ed41201cf',
    address:
      '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    CEXSymbol: 'BTCUSDT',
    pontis_key: '18669995996566340',
    mockPrice: 20000,
    ethereumAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    NETWORK_TOKEN_ADDRESS:
      '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    base_apr: '400',
    apr_at_optimal_ur: '2000',
    optimal_ur: '4500',
    apr_max: '20000',
  },
  {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
    minDeposit: '6250000000000000',
    maxDeposit: '100000000000000000000000',
    minLoan: '66000000000000000',
    maxLoan: '1040000000000000000',
    rToken: '0x436d8d078de345c11493bd91512eae60cd2713e05bcaa0bb9f0cba90358c6e',
    dToken: '0x1ef7f9f8bf01678dc6d27e2c26fb7e8eac3812a24752e6a1d6a49d153bec9f3',
    address:
      '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    CEXSymbol: 'ETHUSDT',
    pontis_key: '19514442401534788',
    mockPrice: 2000,
    ethereumAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    NETWORK_TOKEN_ADDRESS:
      '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    base_apr: '200',
    apr_at_optimal_ur: '1200',
    optimal_ur: '6000',
    apr_max: '10000',
  },
  {
    name: 'USDT',
    symbol: 'USDT',
    decimals: 6,
    minDeposit: '10000000',
    maxDeposit: '100000000000000',
    minLoan: '100000000',
    maxLoan: '1550000000',
    rToken: '0x5fa6cc6185eab4b0264a4134e2d4e74be11205351c7c91196cb27d5d97f8d21',
    dToken: '0x12b8185e237dd0340340faeb3351dbe53f8a42f5a9bf974ddf90ced56e301c7',
    address:
      '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
    CEXSymbol: null,
    pontis_key: '6148333044652921668',
    mockPrice: 1,
    ethereumAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    NETWORK_TOKEN_ADDRESS:
      '0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
    base_apr: '200',
    apr_at_optimal_ur: '1000',
    optimal_ur: '7500',
    apr_max: '10000',
  },
  {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6,
    minDeposit: '10000000',
    maxDeposit: '100000000000000',
    minLoan: '100000000',
    maxLoan: '1270000000',
    rToken: '0x3bcecd40212e9b91d92bbe25bb3643ad93f0d230d93237c675f46fac5187e8c',
    dToken: '0x21d8d8519f5464ec63c6b9a80a5229c5ddeed57ecded4c8a9dfc34e31b49990',
    address:
      '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    CEXSymbol: 'USDCUSDT',
    pontis_key: '6148332971638477636',
    mockPrice: 1,
    ethereumAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    NETWORK_TOKEN_ADDRESS:
      '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    base_apr: '200',
    apr_at_optimal_ur: '1000',
    optimal_ur: '7500',
    apr_max: '10000',
  },
  // {
  //   name: 'DAI',
  //   symbol: 'DAI',
  //   decimals: 18,
  //   minDeposit: '10000000000000000000',
  //   maxDeposit: '100000000000000000000000000',
  //   minLoan: '100000000000000000000',
  //   maxLoan: '1275000000000000000000',
  //   rToken: '0x19c981ec23aa9cbac1cc1eb7f92cf09ea2816db9cbd932e251c86a2e8fb725f',
  //   dToken: '0x7eeed99c095f83716e465e2c52a3ec8f47b323041ddc4f97778ac0393b7f358',
  //   address:
  //     '0x0da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3',
  //   CEXSymbol: 'USDTDAI',
  //   pontis_key: '19212080998863684',
  //   mockPrice: 1,
  //   ethereumAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
  //   NETWORK_TOKEN_ADDRESS:
  //     '0xda114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3',
  //   base_apr: '300',
  //   apr_at_optimal_ur: '1500',
  //   optimal_ur: '5000',
  //   apr_max: '15000',
  // },
  {
    name: 'STRK',
    symbol: 'STRK',
    decimals: 18,
    minDeposit: '10000000000000000000',
    maxDeposit: '500000000000000000000000',
    minLoan: '40000000000000000000',
    maxLoan: '400000000000000000000',
    rToken: '0x7514ee6fa12f300ce293c60d60ecce0704314defdb137301dae78a7e5abbdd7',
    dToken: '0x1bdbaaa456c7d6bbba9ff740af3cfcd40bec0e85cd5cefc3fbb05a552fd14df',
    address:
      '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    CEXSymbol: 'STRKUSDT',
    pontis_key: '6004514686061859652',
    mockPrice: 2,
    ethereumAddress: '0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766',
    NETWORK_TOKEN_ADDRESS:
      '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    base_apr: '200',
    apr_at_optimal_ur: '1500',
    optimal_ur: '5000',
    apr_max: '11000',
  },
];

const getTokenPrice = async (token) => {
  const networkTokenPair = `starknet:${token}`;
  return (
    await axios.get(`https://coins.llama.fi/prices/current/${networkTokenPair}`)
  ).data.coins[networkTokenPair].price;
};

const market= '0x548f38cb45720a101a1ec2edfaf608b47d2b39d137d0d3134087315f1b5f4a5'

async function apy() {
  const promises = 
    TOKENS.map(async (token, i) => {
      const priceInUsd = await getTokenPrice(token?.address);
      const res = await call({
        abi: metricsAbi?.get_protocol_stats,
        target:
          market,
        params: [token?.address],
        allAbi: [],
      });
      const borrow_rate=BigNumber(res?.borrow_rate.toString()).div(100).toNumber();
      const supply_rate=BigNumber(res?.supply_rate.toString()).div(100).toNumber()
      const totalDebt=BigNumber(res?.total_borrow.toString()).div(BigNumber(`1e${token.decimals}`))
      const totalSupply=BigNumber(res?.total_supply.toString()).div(BigNumber(`1e${token.decimals}`))
      const totalSupplyUsd=totalSupply.times(priceInUsd);
      const totalBorrowUsd=totalDebt.times(priceInUsd);
      return{
        pool:`${token?.dToken.toLowerCase()}`,
        chain:'Starknet',
        project:'hashstack',
        symbol:token?.name,
        tvlUsd:totalSupplyUsd.toNumber(),
        apyBase:supply_rate,
        apyBaseBorrow:borrow_rate,
        underlyingTokens:[token?.address],
        totalSupplyUsd:totalSupplyUsd.toNumber(),
        totalBorrowUsd:totalBorrowUsd.toNumber(),
        url:`https://app.hashstack.finance/market`
      }
    })
  return Promise.all(promises)
}

module.exports = {
  apy,
  url: 'https://app.hashstack.finance',
};
