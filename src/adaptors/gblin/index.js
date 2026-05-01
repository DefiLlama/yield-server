const utils = require('../utils');

const GBLIN_V5 = '0x38DcDB3A381677239BBc652aed9811F2f8496345';

const getApy = async () => {
  // Recuperiamo i dati del TVL dalla tua dashboard o direttamente on-chain
  // In questo caso usiamo l'API di DefiLlama che già legge il tuo TVL per semplicità
  const protocolData = await utils.getData('https://api.llama.fi/protocol/gblin');
  const tvl = protocolData.tvl[protocolData.tvl.length - 1].totalLiquidityUSD;

  // DefiLlama richiede un valore APY. Poiché GBLIN cresce col volume, 
  // qui definiamo la pool che gli utenti vedranno.
  return [{
    pool: `${GBLIN_V5}-base`.toLowerCase(),
    chain: utils.formatChain('base'),
    project: 'gblin',
    symbol: 'GBLIN',
    tvlUsd: tvl,
    apyBase: 0.05, // Rappresenta la fee di apprezzamento fissa ad ogni acquisto
    underlyingTokens: [
      '0x4200000000000000000000000000000000000006', // WETH
      '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', // cbBTC
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // USDC
    ],
    poolMeta: 'Treasury-backed Appreciation Model',
    url: 'https://gblin.digital/'
  }];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://gblin.digital/',
};
