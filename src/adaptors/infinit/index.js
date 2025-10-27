const axios = require('axios');
const utils = require('../utils');
const sdk = require('@defillama/sdk');

const API_BASE_URL = 'https://api.infinit.tech/nexus/strategy';
const CHAINS_API_URL = 'https://api.llama.fi/chains';

const zeroAddress = '0x0000000000000000000000000000000000000000'

const fetchChainInfos = async () => {
  const response = await axios.get(CHAINS_API_URL);
  return response.data;
};

const fetchStrategies = async () => {
  const response = await axios.get(API_BASE_URL);
  const strategies = response.data.strategies.filter((s) => s.status ===  "ACTIVE");
  return strategies;
};

const fetchStrategyDetails = async (strategyId) => {
  const response = await axios.get(`${API_BASE_URL}/${strategyId}`);
  return response.data;
};

const extractApyBase = (yields, strategyId) => {
  const apys = yields.filter((y) => y.type === 'APY').map((y) => y.value);
  
  if (apys.length > 1) {
    throw new Error(`Expected 0 or 1 APY base, got ${apys.length}`);
  }
  
  return apys.length > 0 ? apys[0] : 0;
};

const getChainInfo = (chainId, chainInfos) => {
  const chainInfo = chainInfos.find((c) => c.chainId === chainId);
  if (!chainInfo) {
    throw new Error(`ChainInfo not found for chainId: ${chainId}`);
  }
  return chainInfo
};


const getApy = async () => {
  const [chainInfos, strategies] = await Promise.all([
    fetchChainInfos(),
    fetchStrategies(),
  ]);

  const poolPromises = strategies.map(async (strategy) => 
    {
      try {
        const strategyId = strategy.strategyId;
        const strategyInfo = await fetchStrategyDetails(strategyId);
        
        if (!strategyInfo) {
          throw new Error(`Strategy not found for strategyId: ${strategyId}`);
        }
    
        const apyBase = extractApyBase(strategyInfo.yields, strategyId);
        
        const userInput = strategyInfo.userInputs.planInput['1'].amount.info;
        const chainInfo = getChainInfo(userInput.chainId, chainInfos);
        const chain = chainInfo.name.toLowerCase();
        const tokenAddress = userInput.address;
        const underlyingTokens = [tokenAddress];

        // handle bsc chain id for llama sdk
        const llamaChain = userInput.chainId === 56 ? 'bsc' : chain

        const symbol = tokenAddress === zeroAddress ? chainInfo.tokenSymbol : (await sdk.api.abi.call({
          target: tokenAddress,
          abi: 'erc20:symbol',
          chain: llamaChain,
        })).output;


        return {
          pool: `${strategyInfo.strategyName} (${strategy.strategyId})`,
          project: 'infinit',
          symbol,
          chain,
          tvlUsd: strategyInfo.tvl ?? 0,
          apyBase,
          underlyingTokens,
          url: `${API_BASE_URL}/${strategyId}`,
        };
      } catch (error) {
        console.error(`Error processing strategy ${strategy.strategyId}:`, error.message);
        return null;
      }
    }
  );
  
  const pools = await Promise.all(poolPromises);
  
  // Filter out failed strategies (null values)
  return pools.filter((pool) => pool !== null);
};

module.exports = {
  apy: getApy,
  url: 'https://app.infinit.tech',
};