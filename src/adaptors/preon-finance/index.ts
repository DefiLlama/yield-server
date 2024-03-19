const sdk = require("@defillama/sdk");
const utils = require('../utils');

interface ChainContracts {
  [chain: string]: {
    [contract: string]: string[];
  };
};

const chainContracts: ChainContracts = {
  arbitrum: {
    issued: ["0xC19669A405067927865B40Ea045a2baabbbe57f5"]
  },
  polygon: {
    issued: ["0xC19669A405067927865B40Ea045a2baabbbe57f5"]
  },
};

async function chainMinted(chain: string, decimals: number) {
    let balances = {} as any;
    for (let issued of chainContracts[chain].issued) {
        const {output: totalSupply} = await sdk.api.abi.call({
          abi: "erc20:totalSupply",
          target: issued,
          chain: chain,
        });
      sdk.util.sumSingleBalance(
        balances,
        "peggedUSD",
        totalSupply / 10 ** decimals,
      );
    }
    return balances;
}

const poolsFunction = async () => {
  const {peggedUSD: tvl} = (await chainMinted("arbitrum", 18))
  const starPool = {
    pool: '0xC19669A405067927865B40Ea045a2baabbbe57f5',
    chain: utils.formatChain('arbitrum'),
    project: 'preon-finance',
    symbol: utils.formatSymbol('STAR'),
    tvlUsd: tvl,
    apy: 0,
  };

  return [starPool]; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: true,
  misrepresentedTokens: false,
  url: 'https://www.preon.finance/',
  apy: poolsFunction
}; 
