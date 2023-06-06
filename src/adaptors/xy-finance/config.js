const ETHEREUM_REF_POOL_UNDERLYINGS = {
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
}

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
}

const YPOOL_ADDRESSES = {
  USDC: {
    1: {
      ypoolToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
    56: {
      ypoolToken: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    },
    137: {
      ypoolToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    },
    25: {
      ypoolToken: '0xc21223249CA28397B4B6541dfFaEcC539BfF0c59',
    },
    250: {
      ypoolToken: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
    },
    321: {
      ypoolToken: '0x980a5AfEf3D17aD98635F6C5aebCBAedEd3c3430',
    },
    42161: {
      ypoolToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    },
    43114: {
      ypoolToken: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    },
    10: {
      ypoolToken: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    },
    1285: {
      ypoolToken: '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D',
    },
    8217: {
      ypoolToken: '0x754288077D0fF82AF7a5317C7CB8c444D421d103',
    },
    324: {
      ypoolToken: '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4',
    },
    1101: {
      ypoolToken: '0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035',
    },
    592: {
      ypoolToken: '0x6a2d262D56735DbA19Dd70682B39F6bE9a931D98',
    },
    108: {
      ypoolToken: '0x22e89898A04eaf43379BeB70bf4E38b1faf8A31e',
    }
    // wemix
  },
  USDT: {
    1: {
      ypoolToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    },
    56: {
      ypoolToken: '0x55d398326f99059fF775485246999027B3197955',
    },
    137: {
      ypoolToken: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
    25: {
      ypoolToken: '0x66e428c3f67a68878562e79A0234c1F83c208770',
    },
    250: {
      ypoolToken: '0x049d68029688eAbF473097a2fC38ef61633A3C7A',
    },
    321: {
      ypoolToken: '0x0039f574eE5cC39bdD162E9A88e3EB1f111bAF48',
    },
    42161: {
      ypoolToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
    43114: {
      ypoolToken: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    },
    10: {
      ypoolToken: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    },
    1285: {
      ypoolToken: '0xB44a9B6905aF7c801311e8F4E76932ee959c663C',
    },
    8217: {
      ypoolToken: '0xceE8FAF64bB97a73bb51E115Aa89C17FfA8dD167',
    },
    108: {
      ypoolToken: '0x4f3C8E20942461e2c3Bdd8311AC57B0c222f2b82',
    },
    592: {
      ypoolToken: '0x4f3C8E20942461e2c3Bdd8311AC57B0c222f2b82',
    }
    // wemix
  },
  ETH: {
    1: {
      ypoolToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    56: {
      ypoolToken: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    },
    137: {
      ypoolToken: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    },
    250: {
      ypoolToken: '0x74b23882a30290451A17c44f4F05243b6b58C76d',
    },
    25: {
      ypoolToken: '0xe44Fd7fCb2b1581822D0c862B68222998a0c299a',
    },
    42161: {
      ypoolToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    43114: {
      ypoolToken: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
    },
    10: {
      ypoolToken: '0x4200000000000000000000000000000000000006',
    },
    324: {
      ypoolToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    1101: {
      ypoolToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
  },
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

exports.ypoolTokenAddress = (symbol, chainId) => {
  return YPOOL_ADDRESSES[symbol][chainId].ypoolToken;
};
