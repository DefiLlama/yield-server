const ETHEREUM_REF_POOL_UNDERLYINGS = {
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
};

const SUPPORTED_CHAIN_NAMES = {
  1: 'Ethereum',
  56: 'Binance',
  137: 'Polygon',
  250: 'Fantom',
  25: 'Cronos',
  108: 'ThunderCore',
  43114: 'Avalanche',
  321: 'Kucoin',
  42161: 'Arbitrum',
  10: 'Optimism',
  592: 'Astar',
  1285: 'Moonriver',
  8217: 'Klaytn',
  // 1111: 'Wemix',
  324: 'zkSync Era',
  1101: 'Polygon zkEVM',
};

const YPOOL_INFOS = {
  USDC: {
    1: {
      ypool: '0xdD8B0995Cc92c7377c7bce2A097EC70f45A192D5',
      ypoolToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
    56: {
      ypool: '0x27C12BCb4538b12fdf29AcB968B71dF7867b3F64',
      ypoolToken: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
    },
    137: {
      ypool: '0xf4137e5D07b476e5A30f907C3e31F9FAAB00716b',
      ypoolToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      decimals: 6,
    },
    25: {
      ypool: '0x44a54941E572C526a599B0ebe27A14A5BF159333',
      ypoolToken: '0xc21223249CA28397B4B6541dfFaEcC539BfF0c59',
      decimals: 6,
    },
    250: {
      ypool: '0x3A459695D49cD6B9637bC85B7ebbb04c5c3038c0',
      ypoolToken: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
      decimals: 6,
    },
    321: {
      ypool: '0xa274931559Fb054bF60e0C44355D3558bB8bC2E6',
      ypoolToken: '0x980a5AfEf3D17aD98635F6C5aebCBAedEd3c3430',
      decimals: 18,
    },
    42161: {
      ypool: '0x680ab543ACd0e52035E9d409014dd57861FA1eDf',
      ypoolToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      decimals: 6,
    },
    43114: {
      ypool: '0x21ae3E63E06D80c69b09d967d88eD9a98c07b4e4',
      ypoolToken: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      decimals: 6,
    },
    10: {
      ypool: '0x1e4992E1Be86c9d8ed7dcBFcF3665FE568dE98Ab',
      ypoolToken: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      decimals: 6,
    },
    1285: {
      ypool: '0x680ab543ACd0e52035E9d409014dd57861FA1eDf',
      ypoolToken: '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D',
      decimals: 6,
    },
    8217: {
      ypool: '0xB238d4339a44f93aBCF4071A9bB0f55D2403Fd84',
      ypoolToken: '0x754288077D0fF82AF7a5317C7CB8c444D421d103',
      decimals: 6,
    },
    324: {
      ypool: '0x75167284361c8D61Be7E4402f4953e2b112233cb',
      ypoolToken: '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4',
      decimals: 6,
    },
    1101: {
      ypool: '0x1acCfC3a45313f8F862BE7fbe9aB25f20A93d598',
      ypoolToken: '0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035',
      decimals: 6,
    },
    592: {
      ypool: '0xD236639F5B00BC6711aC799bac5AceaF788b2Aa3',
      ypoolToken: '0x6a2d262D56735DbA19Dd70682B39F6bE9a931D98',
      decimals: 6,
    },
    108: {
      ypool: '0x2641911948e0780e615A9465188D975Fa4A72f2c',
      ypoolToken: '0x22e89898A04eaf43379BeB70bf4E38b1faf8A31e',
      decimals: 6,
    },
    // wemix
  },
  USDT: {
    1: {
      ypool: '0x8e921191a9dc6832C1c360C7c7B019eFB7c29B2d',
      ypoolToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
    },
    56: {
      ypool: '0xD195070107d853e55Dad9A2e6e7E970c400E67b8',
      ypoolToken: '0x55d398326f99059fF775485246999027B3197955',
      decimals: 18,
    },
    137: {
      ypool: '0x3243278E0F93cD6F88FC918E0714baF7169AFaB8',
      ypoolToken: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
    },
    25: {
      ypool: '0x74A0EEA77e342323aA463098e959612d3Fe6E686',
      ypoolToken: '0x66e428c3f67a68878562e79A0234c1F83c208770',
      decimals: 6,
    },
    250: {
      ypool: '0xC255563d3Bc3Ed7dBbb8EaE076690497bfBf7Ef8',
      ypoolToken: '0x049d68029688eAbF473097a2fC38ef61633A3C7A',
      decimals: 6,
    },
    321: {
      ypool: '0xF526EFc174b512e66243Cb52524C1BE720144e8d',
      ypoolToken: '0x0039f574eE5cC39bdD162E9A88e3EB1f111bAF48',
      decimals: 18,
    },
    42161: {
      ypool: '0x7a483730AD5a845ED2962c49DE38Be1661D47341',
      ypoolToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
    },
    43114: {
      ypool: '0x3D2d1ce29B8bC997733D318170B68E63150C6586',
      ypoolToken: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
      decimals: 6,
    },
    10: {
      ypool: '0xF526EFc174b512e66243Cb52524C1BE720144e8d',
      ypoolToken: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      decimals: 6,
    },
    1285: {
      ypool: '0xF526EFc174b512e66243Cb52524C1BE720144e8d',
      ypoolToken: '0xB44a9B6905aF7c801311e8F4E76932ee959c663C',
      decimals: 6,
    },
    8217: {
      ypool: '0xF526EFc174b512e66243Cb52524C1BE720144e8d',
      ypoolToken: '0xceE8FAF64bB97a73bb51E115Aa89C17FfA8dD167',
      decimals: 6,
    },
    108: {
      ypool: '0x74A0EEA77e342323aA463098e959612d3Fe6E686',
      ypoolToken: '0x4f3C8E20942461e2c3Bdd8311AC57B0c222f2b82',
      decimals: 6,
    },
    592: {
      ypool: '0xF526EFc174b512e66243Cb52524C1BE720144e8d',
      ypoolToken: '0x3795C36e7D12A8c252A20C5a7B455f7c57b60283',
      decimals: 6,
    },
    // wemix
  },
  ETH: {
    1: {
      ypool: '0x57eA46759fed1B47C200a9859e576239A941df76',
      ypoolToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
    },
    56: {
      ypool: '0xa0ffc7eDB9DAa9C0831Cdf35b658e767ace33939',
      ypoolToken: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      decimals: 18,
    },
    137: {
      ypool: '0x29d91854B1eE21604119ddc02e4e3690b9100017',
      ypoolToken: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
    },
    250: {
      ypool: '0x5146ba1f786D41ba1E876b5Fd3aA56bD516Ed273',
      ypoolToken: '0x74b23882a30290451A17c44f4F05243b6b58C76d',
      decimals: 18,
    },
    25: {
      ypool: '0x8266B0c8eF1d70cC4b04F8E8F7508256c0E1200f',
      ypoolToken: '0xe44Fd7fCb2b1581822D0c862B68222998a0c299a',
      decimals: 18,
    },
    42161: {
      ypool: '0xd1ae4594E47C153ae98F09E0C9267FB74447FEa3',
      ypoolToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
    },
    43114: {
      ypool: '0xEFaaf68a9a8b7D93bb15D29c8B77FCe87Fcc91b8',
      ypoolToken: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
      decimals: 18,
    },
    10: {
      ypool: '0x91474Fe836BBBe63EF72De2846244928860Bce1B',
      ypoolToken: '0x4200000000000000000000000000000000000006',
      decimals: 18,
    },
    324: {
      ypool: '0x935283A00FBF8E40fd2f8C432A488F6ADDC8dB67',
      ypoolToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
    },
    1101: {
      ypool: '0x9fE77412aA5c6Ba67fF3095bBc534884F9a61a38',
      ypoolToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
    },
  },
};

const RPC_ENDPOINTS = {
  1: 'https://rpc.ankr.com/eth',
  56: 'https://rpc.ankr.com/bsc',
  137: 'https://rpc.ankr.com/polygon',
  250: 'https://rpc.ankr.com/fantom',
  25: 'https://rpc.vvs.finance',
  42161: 'https://endpoints.omniatech.io/v1/arbitrum/one/public',
  10: 'https://optimism.api.onfinality.io/public',
  108: 'https://mainnet-rpc.thundercore.com',
  43114: 'https://rpc.ankr.com/avalanche',
  321: 'https://rpc-mainnet.kcc.network',
  592: 'https://evm.astar.network',
  1285: 'https://rpc.api.moonriver.moonbeam.network',
  8217: 'https://rpc.ankr.com/klaytn',
  // 1111: 'Wemix',
  324: 'https://mainnet.era.zksync.io',
  1101: 'https://zkevm-rpc.com',
};

exports.chainSupported = (chainId) => {
  return chainId in SUPPORTED_CHAIN_NAMES;
};
exports.ethereumRefUnderlyingTokenAddress = (symbol) => {
  return ETHEREUM_REF_POOL_UNDERLYINGS[symbol];
};

exports.supportedChainName = (chainId) => {
  return SUPPORTED_CHAIN_NAMES[chainId];
};

exports.YPoolInfo = (symbol, chainId) => {
  return YPOOL_INFOS[symbol][chainId];
};

exports.RPCEndpoint = (chainId) => {
  return RPC_ENDPOINTS[chainId];
};
