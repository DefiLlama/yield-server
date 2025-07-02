const fetch = require('node-fetch');
const curve = require('../curve-dex');
const { default: BigNumber } = require('bignumber.js');

const chainIdMap = {
  146: 'Sonic',
  250: 'Fantom',
  42161: 'Arbitrum',
}

const poolsUrls = {
  "0x6579758e9e85434450d638cfbea0f2fe79856dda": "https://curve.finance/#/arbitrum/pools/factory-twocrypto-57/deposit",
  "0x38dd6b3c096c8cbe649fa0039cc144f333be8e61": "https://curve.finance/#/sonic/pools/factory-stable-ng-2/deposit",
  "0x1028452e86ad0ae114a86b0b041af5110ff1f0b5": "https://curve.finance/#/sonic/pools/factory-stable-ng-106/deposit",
  "0xd80bd4cddce4e0bf10ffd2e3e54e1702f2b67960": "https://curve.finance/#/sonic/pools/factory-twocrypto-29/deposit",
  "0x06a2e1521afde7f7dc30d351dcf04408042f536e": "https://curve.finance/#/fantom/pools/factory-twocrypto-53/deposit",
  "0xdadd23929ca8efcbc43aaf8f677d426563cc40d7": "https://curve.finance/#/arbitrum/pools/factory-tricrypto-38/deposit",
  "0x9ccaabd2610d467b1f76c8aacec4f567ec61d78e": "https://curve.finance/#/sonic/pools/factory-stable-ng-87/deposit",
  "0xa4948da3f2007193dd7404278fed15d48c617417": "https://curve.finance/#/sonic/pools/factory-stable-ng-94/deposit",
  "0xa5a5da9c386855b199b8928cbb59c7ac6505ba89": "https://curve.finance/#/sonic/pools/factory-stable-ng-89/deposit",
  "0x6f6522261f89d988d5f5caa5e4e658344517b114": "https://curve.finance/#/sonic/pools/factory-stable-ng-90/deposit",
  "0xeb427d3cc29ec4c49e48fccc580b11f15d7d096d": "https://curve.finance/#/sonic/pools/factory-stable-ng-92/deposit",
  "0x24479a0d48849781b4386ed91fdd84241673ab1e": "https://curve.finance/#/sonic/pools/factory-stable-ng-86/deposit",
  "0x71868ed5316714ed6ae89bd8e4836016216930db": "https://curve.finance/#/sonic/pools/factory-stable-ng-105/deposit",
  "0x8bb9b3e45fa6b4bf4bbb66ad09f485c5509a0e4c": "https://curve.finance/#/sonic/pools/factory-stable-ng-95/deposit",
  "0xe5a0813a7de6abd8599594e84cb23e4a6d9d9800": "https://curve.finance/#/sonic/pools/factory-stable-ng-98/deposit",
  "0x1008358eecb59723391fba0f8a6b36c5346dab2d": "https://curve.finance/#/sonic/pools/factory-stable-ng-100/deposit",
  "0x13882f7f207329db487ce99839c26392a233d97b": "https://curve.finance/#/sonic/pools/factory-stable-ng-91/deposit",
  "0x601538c805ea9d83a49c132f18417db9666f69d5": "https://curve.finance/#/sonic/pools/factory-stable-ng-96/deposit",
  "0x759a32b417bb471da76cf41ca2ea42f4e0b143eb": "https://curve.finance/#/sonic/pools/factory-stable-ng-97/deposit",
  "0x424757a5169e1f3b45436c9b2e5421dc39dc4897": "https://curve.finance/#/sonic/pools/factory-stable-ng-88/deposit",
  "0xe16ab7fb5d2c7c1b69f7ce58d390b78ab59e44ae": "https://curve.finance/#/taiko/pools/factory-stable-ng-6/deposit",
  "0xdbb986d7fef61260c7f9a443e62e8a91974c5e3d": "https://curve.finance/#/sonic/pools/factory-stable-ng-93/deposit",
  "0x440bcab62d629ba60ca56b80e565636e0c404e60": "https://curve.finance/#/sonic/pools/factory-stable-ng-73/deposit",
  "0xdac15649b025ba0047718512111c34096e9545e8": "https://curve.finance/#/sonic/pools/factory-stable-ng-71/deposit",
  "0x435a160ef111ad0aa0867bece7b85cb77dce3c8a": "https://curve.finance/#/sonic/pools/factory-stable-ng-75/deposit",
  "0x90135d7300c690d786fa8fea071cd4c2ed080d16": "https://curve.finance/#/sonic/pools/factory-stable-ng-76/deposit",
  "0xf159c51297306839b7d44cbb5cb9360e4623ae5a": "https://curve.finance/#/sonic/pools/factory-stable-ng-70/deposit",
  "0x2b0911095350785fb32a557d1d2e3b36a9bb9252": "https://curve.finance/#/sonic/pools/factory-stable-ng-81/deposit",
  "0x4fe12cf68147e902f4ccd8a3d4c13e89fba92384": "https://curve.finance/#/sonic/pools/factory-stable-ng-69/deposit",
  "0x4cdb45979d19da8632ea1d3459cb18258854b285": "https://curve.finance/#/sonic/pools/factory-stable-ng-104/deposit",
  "0x20c2e44bbbea698da4a4cb687514e66385996639": "https://curve.finance/#/sonic/pools/factory-stable-ng-77/deposit",
  "0x2e97cf8da26ce3858950dd85b8f69e39ebd251f5": "https://curve.finance/#/sonic/pools/factory-stable-ng-85/deposit",
  "0x9e63e5d31fd0136290ef99b3cac4515f346fef1c": "https://curve.finance/#/sonic/pools/factory-stable-ng-80/deposit",
  "0x024cc841cd7fe4e7dd7253676c688146599923cf": "https://curve.finance/#/sonic/pools/factory-stable-ng-84/deposit",
  "0x6988d6eec3ca7d24c0358bab8018787117325c2b": "https://curve.finance/#/sonic/pools/factory-stable-ng-79/deposit",
  "0xaa186960df95495084ef1ddc40a3bdac22b0d343": "https://curve.finance/#/sonic/pools/factory-stable-ng-82/deposit",
  "0xb7bb92ff0ec68e6d79a238174e42c12ff5ef2b00": "https://curve.finance/#/sonic/pools/factory-stable-ng-83/deposit",
  "0xd9bf67d8a5d698a028160f62480d456801f0b4b1": "https://curve.finance/#/sonic/pools/factory-stable-ng-74/deposit",
  "0xa17aa5ee656849221c8d9d062894e1145cbda864": "https://curve.finance/#/taiko/pools/factory-stable-ng-5/deposit",
  "0xf821404ac19ac1786caca7e3e12658d72ece885e": "https://curve.finance/#/sonic/pools/factory-stable-ng-72/deposit",
  "0x1c404afffba0e70426dc601aeaa6205eca8c9078": "https://curve.finance/#/sonic/pools/factory-stable-ng-61/deposit",
  "0x538a5534543752d5abbc8cd11760f8be3625e7b1": "https://curve.finance/#/sonic/pools/factory-stable-ng-63/deposit",
  "0x1894a7203faa464f7afa3b8c319a3cac8beb6cda": "https://curve.finance/#/sonic/pools/factory-stable-ng-66/deposit",
  "0x5fa5168497db4ec1964b3208c18cb6157e5652e4": "https://curve.finance/#/sonic/pools/factory-stable-ng-65/deposit",
  "0x09679c768d17b52bfa059010475f9a0bdb0d6fea": "https://curve.finance/#/sonic/pools/factory-stable-ng-60/deposit",
  "0x9b78e02ddddda4117ddf6be8a0fbd15c45907895": "https://curve.finance/#/sonic/pools/factory-stable-ng-68/deposit",
  "0xee05755051e8b1ccf85747a83d0ef8b00f161180": "https://curve.finance/#/sonic/pools/factory-stable-ng-67/deposit",
  "0x7b823067ece11047f83f48647110e7a777e2bf5a": "https://curve.finance/#/sonic/pools/factory-stable-ng-62/deposit",
  "0xdb0a43327626c0e3e87ce936bc0cdf2ee9475c22": "https://curve.finance/#/sonic/pools/factory-stable-ng-64/deposit",
  "0xf1232a1ab5661abdd6e02c6d8ac9940a23bb0b84": "https://curve.finance/#/sonic/pools/factory-stable-ng-25/deposit",
  "0x346704605c72d9f5f9f02d651e5a3dcce6964f3d": "https://curve.finance/#/sonic/pools/factory-stable-ng-26/deposit",
  "0xd0edf0b0d4c56fc9f229a359979d283350ba944e": "https://curve.finance/#/sonic/pools/factory-twocrypto-22/deposit",
}
const getGauges = async () => {
  try {
    const response = await fetch('https://eywa-bot-api-service.eywa.fi/gauges/0x0000000000000000000000000000000000000000', {
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(response.status);
    }
    
    const jsonData = await response.json();
    
    if (!jsonData.data) {
      return [];
    }
    
    return jsonData.data;

  } catch (error) {
    console.error(error);
    return [];
  }
};

const merkl = async () => {
  try {
    const response = await fetch('https://api.merkl.xyz/v4/opportunities?mainProtocolId=crosscurve', {
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(response.status);
    }
    
    const merklData = await response.json();
        
    return Object.values(merklData);
  } catch (error) {
    console.error(error);
    return [];
  }
}

const resolveMerklPool = (merklData, address) => {
  const data = merklData.find((pool) => pool.campaigns.active[0]?.campaignParameters?.targetToken?.toLowerCase() === address && pool.status === 'live');

  if (!data)
    return;

  // if (data.status === 'live') {
    return data;
  // }

  // return merklData.find((pool) => pool.platform === data.platform && pool.status === 'live');
}

// Main Function
const main = async () => {
  try {
    const gauges = await getGauges();
    const addresses = Object.keys(gauges).map((address) => address.toLowerCase());
    const curveData = await curve.apy();
    const merklData = await merkl();

    const pools = await Promise.all(addresses.map(async (address) => {
      const curvePool = curveData.find((pool) => pool.pool.split('-').at(0).toLowerCase() === address);
      const merklPool = merklData.find(data => data.explorerAddress.toLowerCase() === address);
      const gauge = gauges[address];
      const url = poolsUrls[address] || 'https://app.crosscurve.fi/farm'
      const rewardTokens = []

      if (Array.isArray(curvePool?.rewardTokens)) {
        rewardTokens.push(...curvePool.rewardTokens)
      }

      if (merklPool?.rewardsRecord?.breakdowns.length) {
        rewardTokens.push(...merklPool.rewardsRecord.breakdowns.map(reward => reward.token.address.toLowerCase()))
      }

      const underlyingTokens = []

      if (Array.isArray(curvePool?.underlyingTokens)) {
        underlyingTokens.push(...curvePool.underlyingTokens)
      }
      if (merklPool?.tokens) {
        underlyingTokens.push(...merklPool.tokens.map(token => token.address.toLowerCase()))
      }

      let tvlUsd;

      if (address === '0x38dd6b3c096c8cbe649fa0039cc144f333be8e61') {
        const req = await fetch('https://eywa-bot-api-service.eywa.fi/pools-data');
        const res = await req.json();
        tvlUsd = res.data.pools.find(pool => pool.address === '0x38dd6b3c096c8cbe649fa0039cc144f333be8e61').tvl
        if (merklPool?.platform) {merklPool.platform = 'xCRV'}
      } else {
        tvlUsd = new BigNumber(curvePool?.tvlUsd || 0).plus(merklPool?.tvlUsd || 0).toNumber()
      }

      const apyBase = curvePool?.apyBase || 0
      const apyReward = new BigNumber(curvePool?.apyReward || 0)
      .plus(new BigNumber(1).div(gauge.totalDeposited.boosted).multipliedBy(merklPool?.dailyRewards || 0).multipliedBy(365).multipliedBy(100)).toNumber()

      return {
        pool: address,
        chain: curvePool?.chain || chainIdMap[merklPool?.chainId],
        project: 'crosscurve',
        symbol: curvePool?.symbol || merklPool?.platform,
        apyBase,
        apyReward,
        tvlUsd,
        rewardTokens: Array.from(new Set(rewardTokens.map( address => address.toLowerCase()))),
        underlyingTokens: Array.from(new Set(underlyingTokens.map( address => address.toLowerCase()))),
        url,
      };
    }));
    return pools.filter(i => i.symbol)
  } catch (error) {
    console.log(error)
  }
}

module.exports = {
  timetravel: false,
  apy: main,
};
