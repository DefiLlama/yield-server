const masterChefABIBNB = require('./abis/abi-master-chef.json');
const masterChefABIPolygon = require('./abis/abi-master-chef-polygon.json');
exports.CHAINS = {
    'bsc': {
        banana: '0x603c7f932ED1fc6575303D8Fb018fDCBb0f39a95',
        masterchef: '0x5c8D727b265DBAfaba67E050f2f739cAeEB4A6F9',
        block: {
            day: Math.floor((60 / 3) * 60 * 24),
            year: Math.floor((60 / 3) * 60 * 24 * 365),
        },
        feeRate: 0.0005,
        apiUrl: 'https://bnb.apeswapgraphs.com/subgraphs/name/ape-swap/apeswap-subgraph',
        callsName: {
            length: 'poolLength',
            alloc: 'totalAllocPoint',
            perBlock: 'cakePerBlock',
            poolInfo: 'poolInfo'
        },
        abi: masterChefABIBNB,
        exclude: [
            '0x344a9C3a0961DA3Cd78A8f5A62Bd04A0358178be',
            '0x603c7f932ED1fc6575303D8Fb018fDCBb0f39a95',
            '0xA5818a82016cb07D0D9892736A2Abd1B47E78ea4',
            '0xeCabfEd917852D5951CAE753985aE23bd0489d3D',
            '0x8A49764C91718eF2b6264E54e1b6497CcC945D49',
            '0x703b40842eF1A81777e7696e37c335d32D094a80',
          ]
    },
    'polygon': {
        banana: '0x5d47baba0d66083c52009271faf3f50dcc01023c',
        masterchef: '0x54aff400858Dcac39797a81894D9920f16972D1D',
        block: {
            day: Math.floor((60 / 3) * 60 * 24),
            year: Math.floor((60 / 3) * 60 * 24 * 365),
        },
        feeRate: 0.0005,
        apiUrl: 'https://api.thegraph.com/subgraphs/name/prof-sd/as-matic-graft',
        callsName: {
            length: 'poolLength',
            alloc: 'totalAllocPoint',
            perBlock: 'bananaPerSecond',
            poolInfo: 'poolInfo'
        },
        abi: masterChefABIPolygon,
        exclude: []
    },
    'telos': {
        farmsUrl: 'https://raw.githubusercontent.com/ApeSwapFinance/apeswap-lists/main/config/jungleFarms.json',
        apePriceGetterAddress: '0x29392EFEd565c13a0901Aeb88e32bf58EEb8a067'
    }
}