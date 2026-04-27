// sToken to pool mapping - derived from sToken names on Symbiosis chain
// sToken address -> { chain, symbol, token (underlying), portal, decimals }
// The sToken name format is "Synthetic <Symbol> From <Chain>"

// Chain configuration: display name and optional price API chain override
// Only chains needing special handling are listed; others use defaults
const CHAIN_CONFIG = {
  ethereum: { display: 'Ethereum' },
  bsc: { display: 'Binance' },
  polygon: { display: 'Polygon' },
  avax: { display: 'Avalanche' },
  boba: { display: 'Boba' },
  telos: { display: 'Telos' },
  era: { display: 'zkSync Era' },
  arbitrum: { display: 'Arbitrum' },
  optimism: { display: 'Optimism' },
  arbitrum_nova: { display: 'Arbitrum Nova' },
  polygon_zkevm: { display: 'Polygon zkEVM' },
  linea: { display: 'Linea' },
  mantle: { display: 'Mantle' },
  base: { display: 'Base' },
  scroll: { display: 'Scroll' },
  manta: { display: 'Manta' },
  ftn: { display: 'Bahamut' },
  cronos: { display: 'Cronos' },
  rsk: { display: 'RSK' },
  xdai: { display: 'Gnosis' },
  tron: { display: 'Tron' },
  ton: { display: 'TON' },
  sei: { display: 'Sei' },
  cronos_zkevm: { display: 'Cronos zkEVM' },
  hyperliquid: { display: 'Hyperliquid' },
  gravity: { display: 'Gravity' },
  kava: { display: 'Kava' },
  zeta: { display: 'ZetaChain' },
  plasma: { display: 'Plasma' },
  morph: { display: 'Morph' },
  katana: { display: 'Katana' },
  metis: { display: 'Metis' },
  mode: { display: 'Mode' },
  blast: { display: 'Blast' },
  taiko: { display: 'Taiko' },
  fraxtal: { display: 'Fraxtal' },
  sonic: { display: 'Sonic' },
  abstract: { display: 'Abstract' },
  berachain: { display: 'Berachain' },
  unichain: { display: 'Unichain' },
  soneium: { display: 'Soneium' },
  zklink: { display: 'zkLink' },
  // opbnb: { display: 'opBNB', priceApi: 'op_bnb' },
};

module.exports = {
  CHAIN_CONFIG,
  // sToken to pool mapping - maps sToken address to underlying pool info
  // Key: sToken address (lowercase), Value: pool configuration
  sTokenPools: {
    // === STABLECOINS ===

    // Manta USDC
    '0x55519d93513dd0271dd041cee49389a1a6c7e881': {
      chain: 'manta',
      symbol: 'USDC',
      token: '0xb73603C5d87fA094B7314C74ACE2e64D165016fb',
      portal: '0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4',
      decimals: 6,
    },
    // Arbitrum One USDC
    '0xc317169a336b484f65b0ab4a794bbe66a7491e83': {
      chain: 'arbitrum',
      symbol: 'USDC',
      token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      portal: '0x01A3c8E513B758EBB011F7AFaf6C37616c9C24d9',
      decimals: 6,
    },
    // Tron USDT
    '0x4e7498c4db259065b73d21c81a5b41cadbec7d4d': {
      chain: 'tron',
      symbol: 'USDT',
      token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      portal: 'TVgY3ayqTGUoe7th84ZNL5peVfRNdLFDjf',
      decimals: 6,
      isTron: true,
    },
    // Ethereum USDC
    '0xfaeb87361cb1925afdd1967bd896f0c8feacb890': {
      chain: 'ethereum',
      symbol: 'USDC',
      token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      portal: '0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8',
      decimals: 6,
    },
    // BSC USDC
    '0x076cb7beee7d1507de7b964c29cbc849acad5022': {
      chain: 'bsc',
      symbol: 'USDC',
      token: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      portal: '0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4',
      decimals: 18,
    },
    // Base USDbC
    '0xfbe80e8c3fbff0bc314b33d1c6185230ac319309': {
      chain: 'base',
      symbol: 'USDbC',
      token: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      portal: '0xEE981B2459331AD268cc63CE6167b446AF4161f8',
      decimals: 6,
    },
    // Avalanche USDC
    '0xd67c69abae457729fe2c03649a7f83a2dd8eb885': {
      chain: 'avax',
      symbol: 'USDC',
      token: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      portal: '0xE75C7E85FE6ADd07077467064aD15847E6ba9877',
      decimals: 6,
    },
    // Plasma USDT0
    '0xeb24dcb196ac5b93e1600e2de66d07eec13ed243': {
      chain: 'plasma',
      symbol: 'USDT0',
      token: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // ZetaChain USDC.ETH
    '0x82f331a1740a0d1ae4549d9d571396b25b6c33bc': {
      chain: 'zeta',
      symbol: 'USDC.ETH',
      token: '0x0cbe0dF132a6c6B4a2974Fa1b7Fb953CF0Cc798a',
      portal: '0x8a7F930003BedD63A1ebD99C5917FD6aE7E3dedf',
      decimals: 6,
    },
    // Cronos USDC
    '0xb84f68bfa9ba0d1ab8c6ffe7429951629ec9ed1c': {
      chain: 'cronos',
      symbol: 'USDC',
      token: '0xc21223249CA28397B4B6541dfFaEcC539BfF0c59',
      portal: '0xE75C7E85FE6ADd07077467064aD15847E6ba9877',
      decimals: 6,
    },
    // Optimism USDC.e
    '0xf17b21b78c1422afac2ca88886463b4c28d3d520': {
      chain: 'optimism',
      symbol: 'USDC.e',
      token: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Linea USDC
    '0x6e8ae8b7735ff7eb4145ad881087dc14fb494d45': {
      chain: 'linea',
      symbol: 'USDC',
      token: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Rootstock USDT0
    '0x7a4cc805464b69c077dabadd48841e91134b988d': {
      chain: 'rsk',
      symbol: 'USDT0',
      token: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
      portal: '0x5aa5f7f84ed0e5db0a4a85c3947ea16b53352fd4',
      decimals: 6,
    },
    // Katana USDC
    '0x95716ec1002cd8999169febfcd41d647e5c2ffff': {
      chain: 'katana',
      symbol: 'USDC',
      token: '0x203A662b0BD271A6ed5a60EdFbd04bFce608FD36',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Cronos zkEVM USDC
    '0x9d3dbda42c15de4cf60ad3eec78a0aa239399b1e': {
      chain: 'cronos_zkevm',
      symbol: 'USDC',
      token: '0xaa5b845F8C9c047779bEDf64829601d8B264076c',
      portal: '0x2E818E50b913457015E1277B43E469b63AC5D3d7',
      decimals: 6,
    },
    // Polygon USDC.e
    '0xaf11a323741fc0670a6de095794f61ee9c52b622': {
      chain: 'polygon',
      symbol: 'USDC.e',
      token: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      portal: '0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8',
      decimals: 6,
    },
    // HyperEVM USDC
    '0x872b42a47519fb1d39c2a1bf98151b85e7f73bd4': {
      chain: 'hyperliquid',
      symbol: 'USDC',
      token: '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Morph USDC
    '0xd518ff6a6122d1ed4f193cefd7c361f52b5a6cb6': {
      chain: 'morph',
      symbol: 'USDC',
      token: '0xe34c91815d7fc18A9e2148bcD4241d0a5848b693',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Arbitrum Nova USDC
    '0xf84d80134ff1566502801db28a62d1888c3f80a7': {
      chain: 'arbitrum_nova',
      symbol: 'USDC',
      token: '0x750ba8b76187092B0D1E87E28daaf484d1b5273b',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Gnosis USDC.e
    '0xcfe415238cb13029b9d574bdf635d7d7d6571e63': {
      chain: 'xdai',
      symbol: 'USDC.e',
      token: '0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Mantle USDC
    '0xf87516b6665553d700e67a158d68bc627408dc08': {
      chain: 'mantle',
      symbol: 'USDC',
      token: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Sei USDC
    '0x90caf0f3fe4ae3282f8f97a2aa691b0cb8d48c13': {
      chain: 'sei',
      symbol: 'USDC',
      token: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Kava USDT
    '0xf08f72715f85b768c8d77a0d7f09f74238f7933a': {
      chain: 'kava',
      symbol: 'USDT',
      token: '0x919C1c267BC06a7039e03fcc2eF738525769109c',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Scroll USDC
    '0x23a8a10664068012c5046f32925083b5ac25aac3': {
      chain: 'scroll',
      symbol: 'USDC',
      token: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4',
      portal: '0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4',
      decimals: 6,
    },
    // zkSync Era USDC.e
    '0x1ac827dbaa75b2ac5c32b746748b73a0f7b0af7e': {
      chain: 'era',
      symbol: 'USDC.e',
      token: '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4',
      portal: '0x4f5456d4d0764473DfCA1ffBB8524C151c4F19b9',
      decimals: 6,
    },
    // Boba Ethereum USDC
    '0xc12670ddc913ec6d551afc8cdf186b9e4ebaa832': {
      chain: 'boba',
      symbol: 'USDC',
      token: '0x66a2A913e447d6b4BF33EFbec43aAeF87890FBbc',
      portal: '0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8',
      decimals: 6,
    },
    // Polygon zkEVM USDC
    '0x39d3625d07fe1b9267ef7f7891d27f3c9d39dd2e': {
      chain: 'polygon_zkevm',
      symbol: 'USDC',
      token: '0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },
    // Bahamut USDT
    '0x41e1525f93b3a9c70a7824e6c16ca6b944180a6a': {
      chain: 'ftn',
      symbol: 'USDT',
      token: '0xDeF886C55a79830C47108eeb9c37e78a49684e41',
      portal: '0x318C2B9a03C37702742C3d40C72e4056e430135A',
      decimals: 6,
    },
    // Telos USDC
    '0x66281ee570b0e59715eeb198c0921b0728459d09': {
      chain: 'telos',
      symbol: 'USDC',
      token: '0xe6E5f3d264117E030C21920356641DbD5B3d660c',
      portal: '0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8',
      decimals: 6,
    },
    // Gravity USDC.e
    '0x7649eeea77e9464019392d5ab40d4862435b3bd2': {
      chain: 'gravity',
      symbol: 'USDC.e',
      token: '0xFbDa5F676cB37624f28265A144A48B0d6e87d3b6',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 6,
    },

    // === ETH POOLS ===

    // Ethereum WETH
    '0x7477490b64b64d9d014d4003afb053cbf62689e1': {
      chain: 'ethereum',
      symbol: 'WETH',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      portal: '0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8',
      decimals: 18,
    },
    // BSC ETH
    '0x3c4454b723c0144f9e30ef7cc2f419cc88051d45': {
      chain: 'bsc',
      symbol: 'WETH',
      token: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      portal: '0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4',
      decimals: 18,
    },
    // Polygon WETH
    '0xb1691b61e8369b79e4d9fd6dec55ac31e34009ba': {
      chain: 'polygon',
      symbol: 'WETH',
      token: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      portal: '0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8',
      decimals: 18,
    },
    // Arbitrum One WETH
    '0xb8d63ff43b72c481c8ccd77d5c03092b63c81b34': {
      chain: 'arbitrum',
      symbol: 'WETH',
      token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      portal: '0x01A3c8E513B758EBB011F7AFaf6C37616c9C24d9',
      decimals: 18,
    },
    // Arbitrum Nova WETH
    '0x06a0c3d0cf4b12412f48e1746bd440842a14375a': {
      chain: 'arbitrum_nova',
      symbol: 'WETH',
      token: '0x722E8BdD2ce80A4422E880164f2079488e115365',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Base WETH
    '0x7b7ad875f336ffd27a3872b243c025e60a028732': {
      chain: 'base',
      symbol: 'WETH',
      token: '0x4200000000000000000000000000000000000006',
      portal: '0xEE981B2459331AD268cc63CE6167b446AF4161f8',
      decimals: 18,
    },
    // Manta WETH
    '0x4c9edbc90e9006ac909ae7090c51c69dde1b7c3b': {
      chain: 'manta',
      symbol: 'WETH',
      token: '0x0Dc808adcE2099A9F62AA87D9670745AbA741746',
      portal: '0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4',
      decimals: 18,
    },
    // Mantle WETH
    '0x0c16952c588f859e797c7c9497304db0f5239c51': {
      chain: 'mantle',
      symbol: 'WETH',
      token: '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Optimism WETH
    '0x7a74c122831e1221b32162569f95ff1d01e099de': {
      chain: 'optimism',
      symbol: 'WETH',
      token: '0x4200000000000000000000000000000000000006',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // zkSync Era WETH
    '0xce5cafcf82fdb326e03378750c272efabafb1d7f': {
      chain: 'era',
      symbol: 'WETH',
      token: '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91',
      portal: '0x4f5456d4d0764473DfCA1ffBB8524C151c4F19b9',
      decimals: 18,
    },
    // Linea WETH
    '0x840531da82e31b4ff535bc8f3a16f6f0c48b3861': {
      chain: 'linea',
      symbol: 'WETH',
      token: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Scroll WETH
    '0x7792fc1975f324fd3a4cc4ca8186087d73ffb9fc': {
      chain: 'scroll',
      symbol: 'WETH',
      token: '0x5300000000000000000000000000000000000004',
      portal: '0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4',
      decimals: 18,
    },
    // Polygon zkEVM WETH
    '0xd687ff0122669ce5a0be89143a9b926ba9a72df3': {
      chain: 'polygon_zkevm',
      symbol: 'WETH',
      token: '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Gnosis WETH
    '0x97b1c455d59373059f8fa92dea00e7399ff3f5cc': {
      chain: 'xdai',
      symbol: 'WETH',
      token: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Metis WETH
    '0x7520d0d46d2027745e3837103e9eb2bb372a869d': {
      chain: 'metis',
      symbol: 'WETH',
      token: '0x420000000000000000000000000000000000000A',
      portal: '0xd8db4fb1fEf63045A443202d506Bcf30ef404160',
      decimals: 18,
    },
    // Mode WETH
    '0xe7671ec0e57322d254159e0595c2f6b179038203': {
      chain: 'mode',
      symbol: 'WETH',
      token: '0x4200000000000000000000000000000000000006',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Blast WETH
    '0x5de7bb0e90e4d3860762b1e90758b839b056130f': {
      chain: 'blast',
      symbol: 'WETH',
      token: '0x4300000000000000000000000000000000000004',
      portal: '0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4',
      decimals: 18,
    },
    // Taiko WETH
    '0xf834ad6385c3cfacee18593bbde4e65a0f29ea32': {
      chain: 'taiko',
      symbol: 'WETH',
      token: '0xA51894664A773981C6C112C43ce576f315d5b1B6',
      portal: '0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4',
      decimals: 18,
    },
    // Fraxtal WETH
    '0xbe535cc7270864e30851578ca0a24aa15795d35c': {
      chain: 'fraxtal',
      symbol: 'WETH',
      token: '0xA8a59D73388D0c4344a7b0Ba287ddb654227c38a',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Sonic WETH
    '0x9f2f60bade978bbea32e4e2f282c86c0c2874ff5': {
      chain: 'sonic',
      symbol: 'WETH',
      token: '0x50c42dEAcD8Fc9773493ED674b675bE577f2634b',
      portal: '0xE75C7E85FE6ADd07077467064aD15847E6ba9877',
      decimals: 18,
    },
    // Abstract WETH
    '0xe1ff01476d1693881c85a23c65f9522579eb8398': {
      chain: 'abstract',
      symbol: 'WETH',
      token: '0x3439153EB7AF838Ad19d56E1571FBD09333C2809',
      portal: '0x8Dc71561414CDcA6DcA7C1dED1ABd04AF474D189',
      decimals: 18,
    },
    // Berachain WETH
    '0x3c210c8b287cfdbc71c1ccf06ee84c7926276835': {
      chain: 'berachain',
      symbol: 'WETH',
      token: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Unichain WETH
    '0x73bbd1031ac1265eb1b2db33372d58444b6f63e3': {
      chain: 'unichain',
      symbol: 'WETH',
      token: '0x4200000000000000000000000000000000000006',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Soneium WETH
    '0x3bbde4396811f8643a3c1e98fb4cffc74ae01fb0': {
      chain: 'soneium',
      symbol: 'WETH',
      token: '0x4200000000000000000000000000000000000006',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // Katana WETH
    '0x3d20098e8ed873e04f19731d96aaaffa2ac2e760': {
      chain: 'katana',
      symbol: 'WETH',
      token: '0xEE7D8BCFb72bC1880D0Cf19822eB0A2e6577aB62',
      portal: '0x292fC50e4eB66C3f6514b9E402dBc25961824D62',
      decimals: 18,
    },
    // zkLink WETH
    '0x8bbeaa343ee881a85758595648aa67a41e661c6d': {
      chain: 'zklink',
      symbol: 'WETH',
      token: '0x8280a4e7D5B3B658ec4580d3Bc30f5e50454F169',
      portal: '0x8Dc71561414CDcA6DcA7C1dED1ABd04AF474D189',
      decimals: 18,
    },

    // === OTHER TOKENS ===

    // BSC SIS
    '0xd747f3c877eb2736c06dd9a852480058a24e01ce': {
      chain: 'bsc',
      symbol: 'SIS',
      token: '0xF98b660AdF2ed7d9d9D9dAACC2fb0CAce4F21835',
      portal: '0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4',
      decimals: 18,
    },

    // TON USDT - 3.58% APR                                                                             
    // '0x8d8ce7bf0c7f7a368bb92087fc9d474d2dffc072': {                                                  
    //   chain: 'ton',
    //   symbol: 'USDT',
    //   token: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
    //   portal: 'EQBZh9CpLZyNlwI7am0PHpVy8T8zdJxAhlG3m3xMi0BoVaUh',
    //   decimals: 6,
    //   isTon: true,
    // },                 
  },
};
