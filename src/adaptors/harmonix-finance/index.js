const axios = require('axios');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils')

// ABI for totalValueLocked function
const totalValueLockedABI = {
  "inputs": [],
  "name": "totalValueLocked",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
};

// Mapping of chain names to chain IDs
const chains = {
  ethereum: 'ethereum',
  arbitrum_one: 'arbitrum',
  hyperevm: 'hyperevm',
  base: 'base',
};

const getTvl = async (contractAddress, chain) => {
  try {
    const tvl = await sdk.api.abi.call({
      target: contractAddress,
      abi: totalValueLockedABI,
      chain
    });
    return tvl.output;
  } catch (error) {
    throw new Error(`Failed to fetch TVL from contract ${contractAddress} on chain ${chain} : ${error.message}`);
  }
};

const assets = {
  arbitrum: {
    eth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    wbtc: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    rseth: '0x4186BFC76E2E237523CBC30FD220FE055156b41F',
    link: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
    uni: '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0'
  },
  ethereum: {
    eth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    rseth: '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7',
  },
  hyperevm: {
    hype: '0x0000000000000000000000000000000000000000',
  }
};

const getApy = async () => {
  const response = await axios.get('https://api.harmonix.fi/api/v1/vaults/', {
    headers: {
      'accept': 'application/json'
    }
  });

  const pools = await Promise.all(response.data.map(async vault => {
    return Promise.all(vault.vaults.map(async v => {
      const chainId = chains[v.network_chain];
      let tvlUsd = 0

      if (chainId === 'hyperevm') {
        const provider = new ethers.providers.JsonRpcProvider("https://rpc.hyperliquid.xyz/evm");

        const contractAddress = "0xe9d69CdD6Fe41e7B621B4A688C5D1a68cB5c8ADc";
        const abi = [
          "function getPriceUnsafe(bytes32) view returns (tuple(int64, uint64, int32, uint256))"
        ];

        const priceFeed = "0x4279e31cc369bbcc2faf022b382b080e32a8e689ff20fbc530d2a603eb6cd98b";

      
        const contract = new ethers.Contract(contractAddress, abi, provider);
        const [price, conf, expo, timestamp] = await contract.getPriceUnsafe(priceFeed);
        const normalizedPrice = Number(price) * 10 ** expo;
        
      
        tvlUsd = normalizedPrice * v.tvl;
    
      }
      else {
        const tvl = await getTvl(v.contract_address, chainId);
        tvlUsd = tvl; // Default to the fetched TVL
        // Convert TVL to USDC if vault_currency is not USDC
        if (v.vault_currency !== 'USDC') {
          const tokenKey = `${chainId}:${assets[chainId][v.vault_currency.toLowerCase()]}`
          const priceData = await axios.get(`https://coins.llama.fi/prices/current/${tokenKey}`);
          const tokenPrice = priceData.data.coins[`${tokenKey}`]?.price;
          if (tokenPrice) {
            if (v.vault_currency === 'ETH') {
              tvlUsd = (tvl / 1e18) * tokenPrice;
            } else if (v.vault_currency === 'WBTC') {
              tvlUsd = (tvl / 1e8) * tokenPrice;
            } else {
              tvlUsd = (tvl / 1e6) * tokenPrice;
            }
          } else {
            throw new Error(`Price for ${v.vault_currency} not found.`);
          }
        }
        else {
          tvlUsd /= 1e6
        }  
      }

      return {
        pool: v.contract_address, // unique identifier for the pool
        chain: chainId || null, // map chain name to chain ID
        project: 'harmonix-finance', // project slug
        symbol: utils.formatSymbol(v.vault_currency), // format the symbol
        tvlUsd, // total value locked in USD
        apyBase: v.apy, // APY from the vault
        apyReward: 0, // hardcoded for now
        rewardTokens: [], // hardcoded for now
        url: `https://app.harmonix.fi/vaults/${v.slug}`, // URL to the vault
        underlyingTokens: assets[chainId][v.underlying_asset.toLowerCase()] ? [assets[chainId][v.underlying_asset.toLowerCase()]] : [], // underlying asset
      };
    }));
  }));

  return pools.flat(); // flatten the array of pools
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.harmonix.fi/vaults/', // Link to page with pools
};
