const axios = require('axios');
const { uint256 } = require('starknet');
const { call } = require('../../helper/starknet');
const { metricsAbi } = require('./abis/metricsAbi');
const { default: BigNumber } = require('bignumber.js');

const interestRateModel =
  '0x59a943ca214c10234b9a3b61c558ac20c005127d183b86a99a8f3c60a08b4ff';
const oracle =
  '0x07b05e8dc9c770b72befcf09599132093cf9e57becb2d1b3e89514e1f9bdf0ab';

const starknetFoundationIncentivesEndpoint =
  'https://kx58j6x5me.execute-api.us-east-1.amazonaws.com/starknet/fetchFile?file=prod-api/lending/lending_strk_grant.json';

const markets = {
  WBTC: {
    address:
      '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    decimals: 8,
    supplyTokens: [
      '0x0735d0f09a4e8bf8a17005fa35061b5957dcaa56889fc75df9e94530ff6991ea',
      '0x05b7d301fa769274f20e89222169c0fad4d846c366440afc160aafadd6f88f0c',
      '0x073132577e25b06937c64787089600886ede6202d085e6340242a5a32902e23e',
      '0x036b68238f3a90639d062669fdec08c4d0bdd09826b1b6d24ef49de6d8141eaa',
    ],
    debtToken:
      '0x0491480f21299223b9ce770f23a2c383437f9fbf57abc2ac952e9af8cdb12c97',
  },
  ETH: {
    address:
      '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    decimals: 18,
    supplyTokens: [
      '0x01fecadfe7cda2487c66291f2970a629be8eecdcb006ba4e71d1428c2b7605c7',
      '0x057146f6409deb4c9fa12866915dd952aa07c1eb2752e451d7f3b042086bdeb8',
      '0x07170f54dd61ae85377f75131359e3f4a12677589bb7ec5d61f362915a5c0982',
      '0x044debfe17e4d9a5a1e226dabaf286e72c9cc36abbe71c5b847e669da4503893',
    ],
    debtToken:
      '0x00ba3037d968790ac486f70acaa9a1cab10cf5843bb85c986624b4d0e5a82e74',
  },
  USDC: {
    address:
      '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    decimals: 6,
    supplyTokens: [
      '0x002fc2d4b41cc1f03d185e6681cbd40cced61915d4891517a042658d61cba3b1',
      '0x05dcd26c25d9d8fd9fc860038dcb6e4d835e524eb8a85213a8cda5b7fff845f6',
      '0x06eda767a143da12f70947192cd13ee0ccc077829002412570a88cd6539c1d85',
      '0x05f296e1b9f4cf1ab452c218e72e02a8713cee98921dad2d3b5706235e128ee4',
    ],
    debtToken:
      '0x063d69ae657bd2f40337c39bf35a870ac27ddf91e6623c2f52529db4c1619a51',
  },
  DAI: {
    address:
      '0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3',
    decimals: 18,
    supplyTokens: [
      '0x022ccca3a16c9ef0df7d56cbdccd8c4a6f98356dfd11abc61a112483b242db90',
      '0x04f18ffc850cdfa223a530d7246d3c6fc12a5969e0aa5d4a88f470f5fe6c46e9',
      '0x02b5fd690bb9b126e3517f7abfb9db038e6a69a068303d06cf500c49c1388e20',
      '0x005c4676bcb21454659479b3cd0129884d914df9c9b922c1c649696d2e058d70',
    ],
    debtToken:
      '0x066037c083c33330a8460a65e4748ceec275bbf5f28aa71b686cbc0010e12597',
  },
  USDT: {
    address:
      '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
    decimals: 6,
    supplyTokens: [
      '0x0360f9786a6595137f84f2d6931aaec09ceec476a94a98dcad2bb092c6c06701',
      '0x0453c4c996f1047d9370f824d68145bd5e7ce12d00437140ad02181e1d11dc83',
      '0x06669cb476aa7e6a29c18b59b54f30b8bfcfbb8444f09e7bbb06c10895bf5d7b',
      '0x0514bd7ee8c97d4286bd481c54aa0793e43edbfb7e1ab9784c4b30469dcf9313',
    ],
    debtToken:
      '0x024e9b0d6bc79e111e6872bb1ada2a874c25712cf08dfc5bcf0de008a7cca55f',
  },
  wstETH: {
    address:
      '0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2',
    decimals: 18,
    supplyTokens: [
      '0x00ca44c79a77bcb186f8cdd1a0cd222cc258bebc3bec29a0a020ba20fdca40e9',
      '0x009377fdde350e01e0397820ea83ed3b4f05df30bfb8cf8055d62cafa1b2106a',
      '0x07e2c010c0b381f347926d5a203da0335ef17aefee75a89292ef2b0f94924864',
      '0x05eb6de9c7461b3270d029f00046c8a10d27d4f4a4c931a4ea9769c72ef4edbb',
    ],
    debtToken:
      '0x0348cc417fc877a7868a66510e8e0d0f3f351f5e6b0886a86b652fcb30a3d1fb',
  },
  LORDS: {
    address:
      '0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49',
    decimals: 18,
    supplyTokens: [
      '0x0507eb06dd372cb5885d3aaf18b980c41cd3cd4691cfd3a820339a6c0cec2674',
      '0x0739760bce37f89b6c1e6b1198bb8dc7166b8cf21509032894f912c9d5de9cbd',
      '0x000d294e16a8d24c32eed65ea63757adde543d72bad4af3927f4c7c8969ff43d',
      '0x02530a305dd3d92aad5cf97e373a3d07577f6c859337fb0444b9e851ee4a2dd4',
    ],
    debtToken:
      '0x035778d24792bbebcf7651146896df5f787641af9e2a3db06480a637fbc9fff8',
  },
  STRK: {
    address:
      '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    decimals: 18,
    supplyTokens: [
      '0x026c5994c2462770bbf940552c5824fb0e0920e2a8a5ce1180042da1b3e489db',
      '0x07c2e1e733f28daa23e78be3a4f6c724c0ab06af65f6a95b5e0545215f1abc1b',
      '0x07c535ddb7bf3d3cb7c033bd1a4c3aac02927a4832da795606c0f3dbbc6efd17',
      '0x040f5a6b7a6d3c472c12ca31ae6250b462c6d35bbdae17bd52f6c6ca065e30cf',
    ],
    debtToken:
      '0x001258eae3eae5002125bebf062d611a772e8aea3a1879b64a19f363ebd00947',
  },
  nstSTRK: {
    address:
      '0x04619e9ce4109590219c5263787050726be63382148538f3f936c22aa87d2fc2',
    decimals: 18,
    supplyTokens: [
      '0x078a40c85846e3303bf7982289ca7def68297d4b609d5f588208ac553cff3a18',
      '0x067a34ff63ec38d0ccb2817c6d3f01e8b0c4792c77845feb43571092dcf5ebb5',
      '0x04b11c750ae92c13fdcbe514f9c47ba6f8266c81014501baa8346d3b8ba55342',
      '0x0142af5b6c97f02cac9c91be1ea9895d855c5842825cb2180673796e54d73dc5',
    ],
    debtToken:
      '0x0292be6baee291a148006db984f200dbdb34b12fb2136c70bfe88649c12d934b',
  },
  UNO: {
    address:
      '0x0719b5092403233201aa822ce928bd4b551d0cdb071a724edd7dc5e5f57b7f34',
    decimals: 18,
    supplyTokens: [
      '0x1325caf7c91ee415b8df721fb952fa88486a0fc250063eafddd5d3c67867ce7',
      '0x2a3a9d7bcecc6d3121e3b6180b73c7e8f4c5f81c35a90c8dd457a70a842b723',
      '0x6757ef9960c5bc711d1ba7f7a3bff44a45ba9e28f2ac0cc63ee957e6cada8ea',
      '0x7d717fb27c9856ea10068d864465a2a8f9f669f4f78013967de06149c09b9af',
    ],
    debtToken:
      '0x4b036839a8769c04144cc47415c64b083a2b26e4a7daa53c07f6042a0d35792',
  },
};

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

async function getProtocolStats() {
  const promises = Promise.all(
    TOKENS.map(async (token, i) => {
      const priceInUsd = await getTokenPrice(token?.address);

      const res = await call({
        abi: metricsAbi,
        target:
          '0x548f38cb45720a101a1ec2edfaf608b47d2b39d137d0d3134087315f1b5f4a5',
        params: [token?.address],
      });

      console.log(res, 'responsee');
    })
  );

  console.log(await promises, 'promises');
}

getProtocolStats();

// module.exports = {
//   apy,
//   url: 'https://app.hashstack.finance',
// };
