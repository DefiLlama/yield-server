const sdk = require('@defillama/sdk');
const masterChefV2ABIBNB = require('./abis/abi-master-chef-v2.json');
const masterChefABIPolygon = require('./abis/abi-master-chef-polygon.json');
exports.CHAINS = {
  bsc: {
    banana: '0x603c7f932ED1fc6575303D8Fb018fDCBb0f39a95',
    masterchef: '0x71354AC3c695dfB1d3f595AfA5D4364e9e06339B',
    feeRate: 0.0005,
    // apiUrl: 'https://bnb.apeswapgraphs.com/subgraphs/name/ape-swap/apeswap-subgraph',
    apiUrl: sdk.graph.modifyEndpoint('GH4Zt29mCApHwMfavNFw5ZdQDH3owc2Wq8DdU4hGPXYe'),
    callsName: {
      length: 'poolLength',
      alloc: 'totalAllocPoint',
      bananaPerSecond: 'bananaPerSecond',
      poolInfo: 'poolInfo',
    },
    abi: masterChefV2ABIBNB,
    lpToken: 'stakeToken',
    exclude: [
      '0x344a9C3a0961DA3Cd78A8f5A62Bd04A0358178be',
      '0x603c7f932ED1fc6575303D8Fb018fDCBb0f39a95',
      '0xA5818a82016cb07D0D9892736A2Abd1B47E78ea4',
      '0xeCabfEd917852D5951CAE753985aE23bd0489d3D',
      '0x8A49764C91718eF2b6264E54e1b6497CcC945D49',
      '0x703b40842eF1A81777e7696e37c335d32D094a80',
      '0x1e8732890dB1d070FC7D6befE0008e39C7953814',
    ],
  },
  polygon: {
    banana: '0x5d47baba0d66083c52009271faf3f50dcc01023c',
    masterchef: '0x54aff400858Dcac39797a81894D9920f16972D1D',
    feeRate: 0.0005,
    apiUrl: sdk.graph.modifyEndpoint('32BWziYZT6en9rVM9L3sDonnjHGtKvfsiJyMDv3T7Dx1'),
    callsName: {
      length: 'poolLength',
      alloc: 'totalAllocPoint',
      bananaPerSecond: 'bananaPerSecond',
      poolInfo: 'poolInfo',
    },
    abi: masterChefABIPolygon,
    lpToken: 'lpToken',
    exclude: ['0xe9699f65a4981035589727f448c3a642F0E19209'],
  },
  telos: {
    farmsUrl:
      'https://raw.githubusercontent.com/ApeSwapFinance/apeswap-lists/main/config/jungleFarms.json',
    apePriceGetterAddress: '0x29392EFEd565c13a0901Aeb88e32bf58EEb8a067',
  },
};
