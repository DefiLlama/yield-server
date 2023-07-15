const axios = require('axios');
const ethers = require('ethers');
const superagent = require('superagent');
const {
  chainSupported,
  ethereumRefUnderlyingTokenAddress,
  supportedChainName,
  YPoolInfo,
  RPCEndpoint,
} = require('./config');
const { ContractABIs } = require('./abi');

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"

const getTokenBalance = (provider, tokenAddress, ownerAddress, decimals) => {
  const tokenContract = new ethers.Contract(tokenAddress, ContractABIs.miniERC20ABI, provider);
  return tokenContract.balanceOf(ownerAddress).then((balance) => {
    return balance / Math.pow(10, decimals);
  });
};

const main = async () => {
  const { data: resp } = await axios.get('https://api.xy.finance/ypool/stats/eachVault');
  if (!resp.isSuccess) {
    throw new Error('Failed to fetch data from XY Finance');
  }

  var pools = [];
  for (const [symbol, vaultInfo] of Object.entries(resp.eachYpoolVault)) {
    const refAddr = ethereumRefUnderlyingTokenAddress(symbol);
    const key = `ethereum:${refAddr}`;
    const priceRes = await superagent.get(
      `https://coins.llama.fi/prices/current/${key}`
    );
    const tokenPrice = priceRes.body.coins[key].price;
    for (const chainId of vaultInfo.supportedChains) {
      if (!chainSupported(chainId)) {
        continue;
      }

      const ypoolInfo = YPoolInfo(symbol, chainId);

      let ypoolLocked = 0;
      let provider = new ethers.providers.JsonRpcProvider(RPCEndpoint(chainId));
      if ( ypoolInfo.ypoolToken === NATIVE_TOKEN_ADDRESS ) {
        await provider.getBalance(ypoolInfo.ypool).then((balance) => {
          ypoolLocked = ethers.utils.formatEther(balance);
        });
      } else {
        ypoolLocked = await getTokenBalance(provider, ypoolInfo.ypoolToken, ypoolInfo.ypool, ypoolInfo.decimals);
      }

      const chainName = supportedChainName(chainId);
      pools.push({
        pool: `ypool-${ypoolInfo.ypool}-${chainName}`.toLowerCase(),
        chain: chainName,
        project: 'xy-finance',
        symbol: symbol,
        apyBase: Number(vaultInfo.dayAPY),
        apyBase7d: Number(vaultInfo.weekAPY),
        underlyingTokens: [ypoolInfo.ypoolToken],
        tvlUsd: Number(ypoolLocked) * tokenPrice,
      });
    }
  }
  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.xy.finance/pools',
};
