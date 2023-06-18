const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { windAndCheck,lpAbi,ercAbi } = require('./abi');

const CHAIN = 'kava';

const PROJECT_NAME = 'scrub-invest';

const vaults = {
  USDC: '0xcd017B495DF1dE2DC8069b274e2ddfBB78561176',
  USDT: '0x88555c4d8e53ffB223aB5baDe0B5e6B2Cd3966c4',
  DAI: '0xB4Ba7ba722eacAE8f1e4c6213AF05b5E8B27dbdB',
  KAVA: '0xB9774bB2A18Af59Ec9bf86dCaeC07473A2D2F230',
  WETH: '0x3CcA2C0d433E00433082ba16e968CA11dA6Dc156',
  "BEAR/WBTC": "0x4402Cf5433D57266563979654d20887AcE672393",
  "TIGER/USDC": "0xa2355f35Ab85f1771FB1085a0e5b2599B8F47457",
  "LION/USDC": "0x2c1C6aaB89272d07B7f78bFe93eefb6D2631Cf94",
  "MARE/USDC": "0x070110b0cAd64833b1a6a9E86337A4e4eE786607",
  "VARA/USDC": "0xE04539bD52618B7d197Be54B3e4D80732082906E",
  "VARA/WKAVA": "0xEa892552BD31A20F42ceb3476D6A280c405883d0",
  "LION/DEXI": "0xcf4673F714183C42DADc1B42DAC21BE09cfc3684",
  "axlUSDC/USDC": "0xef7541FCa94988fA423bC418a854f7967f83a3E0",
  "WKAVA/WETH": "0x43Ac7f627e41EBDa7515FEaCa425306AaB9cB602",
  "TORE/WKAVA": "0x438c996F8c2ff18b9B7e01449443A8523b2B82E5",
};
const tokens = [
  {
    name: 'USDC',
    decimals: 6,
    address: '0xfA9343C3897324496A05fC75abeD6bAC29f8A40f',
    tokens: ["0xfA9343C3897324496A05fC75abeD6bAC29f8A40f"]
  },
  {
    name: 'USDT',
    decimals: 6,
    address: '0xB44a9B6905aF7c801311e8F4E76932ee959c663C',
    tokens: ["0xB44a9B6905aF7c801311e8F4E76932ee959c663C"]

  },
  {
    name: 'DAI',
    decimals: 18,
    address: '0x765277eebeca2e31912c9946eae1021199b39c61',
    tokens: ["0x765277eebeca2e31912c9946eae1021199b39c61"]

  },
  {
    name: 'KAVA',
    decimals: 18,
    address: '0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b',
    tokens: ["0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b"]

  },
  {
    name: 'WETH',
    decimals: 18,
    address: '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D',
    tokens: ["0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D"]

  },
  {
    name: "BEAR/WBTC",
    decimals: 18,
    address: "0xeA848151ACB1508988e56Ee7689F004df2B15ced",
    tokens: ["0x38481Fdc1aF61E6E72E0Ff46F069315A59779C65","0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b"],
    lp:true
  },
  {
    name: "TIGER/USDC",
    decimals: 18,
    address: "0x7f8ed7d31795dc6f5fc5f6685b11419674361501",
    tokens: ["0x471F79616569343e8e84a66F342B7B433b958154","0xfA9343C3897324496A05fC75abeD6bAC29f8A40f"],
    lp:true

  },
  {
    name: "LION/USDC",
    decimals: 18,
    address: "0x09d6561b3795ae237e42f7adf3dc83742e10a2e8",
    tokens: ["0x990e157fC8a492c28F5B50022F000183131b9026","0xfA9343C3897324496A05fC75abeD6bAC29f8A40f"],
    lp:true
  },
  {
    name: "MARE/USDC",
    decimals: 18,
    address: "0x0e1bc1939d977c676cd38cff4b7e411c32b6d3ce",
    tokens: ["0xd86C8d4279CCaFbec840c782BcC50D201f277419","0xfA9343C3897324496A05fC75abeD6bAC29f8A40f"],
    lp:true

  },
  {
    name: "VARA/USDC",
    decimals: 18,
    address: "0x9bf1e3ee61cbe5c61e520c8beff45ed4d8212a9a",
    tokens: ["0xE1da44C0dA55B075aE8E2e4b6986AdC76Ac77d73","0xfA9343C3897324496A05fC75abeD6bAC29f8A40f"],
    lp:true

  },
  {
    name: "VARA/WKAVA",
    decimals: 18,
    address: "0x7d8100072ba0e4da8dc6bd258859a5dc1a452e05",
    tokens: ["0xE1da44C0dA55B075aE8E2e4b6986AdC76Ac77d73","0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b"],
    lp:true

  },
  {
    name: "axlUSDC/USDC",
    decimals: 18,
    address: "0x7a08708E06A118F2B22C9000A990155bdEdC31d1",
    tokens: ["0xfA9343C3897324496A05fC75abeD6bAC29f8A40f","0xfA9343C3897324496A05fC75abeD6bAC29f8A40f"],
    lp:true
  },
  {
    name: "WKAVA/WETH",
    decimals: 18,
    address: "0xB593E0A2e93864fF5F75689dADE29f5F6DEc64EF",
    tokens: ["0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b","0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D"],
    lp:true

    
  },
  {
    name: "LION/DEXI",
    decimals: 18,
    address: "0x7098c06cd97079742278F637D3EFE4Ce39e19A86",
    tokens: ["0x990e157fC8a492c28F5B50022F000183131b9026","0xD22a58f79e9481D1a88e00c343885A588b34b68B"],
    lp:true

  },
  {
    name: "TORE/WKAVA",
    decimals: 18,
    address: "0x1ae83a1b9Ee963213d1e3Ff337F92930582d304f",
    tokens: ["0x8549724fcC84ee9ee6c7A676F1Ba2Cc2f43AAF5B","0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b"],
    lp:true
  },
];
const getOutput = ({ output }) => output.map(({ output }) => output);

const unwrapLP = async (chain, lpTokens) => {
  const [tokens, getReserves, totalSupply] = await Promise.all(
    ['tokens', 'getReserves', 'totalSupply'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpAbi.find(({ name }) => name === method),
        calls: lpTokens.map((token) => ({
          target: token,
        })),
        chain,
      })
    )
  ).then((data) => data.map(getOutput));
  const token0Addresses = tokens.map((token) => token[0]);
  const token1Addresses = tokens.map((token) => token[1]);
  const token0 = tokens.map((token) => `${chain}:${token[0]}`);
  const token1 = tokens.map((token) => `${chain}:${token[1]}`);
  const token0Decimals = (
    await sdk.api.abi.multiCall({
      abi: ercAbi.find(({ name }) => name === "decimals"),
      calls: token0Addresses.map((token) => ({
        target: token,
      })),
      chain,
    })
  ).output.map((decimal) => Math.pow(10, Number(decimal.output)));

  const token1Decimals = (
    await sdk.api.abi.multiCall({
      abi: ercAbi.find(({ name }) => name === "decimals"),
      calls: token1Addresses.map((token) => ({
        target: token,
      })),
      chain,
    })
  ).output.map((decimal) => Math.pow(10, Number(decimal.output)));
  console.log("Decimals",token0Decimals, token1Decimals);

  const token0Price = await getPrices(token0);
  const token1Price = await getPrices(token1);
  console.log("Token Prices", token0Price, token1Price);
  const lpMarkets = lpTokens.map((lpToken) => {
    return { lpToken };
  });

  lpMarkets.map((token, i) => {
    if(isNaN(token0Price[token0Addresses[i].toLowerCase()])) {
      token.lpPrice =
      2*
       ( (getReserves[i]._reserve1 / token1Decimals[i]) *
          token1Price[token1Addresses[i].toLowerCase()]) /
      (totalSupply[i] / 1e18);
    }
    else if(isNaN(token1Price[token1Addresses[i].toLowerCase()])) {
      token.lpPrice =
      2*
       ( (getReserves[i]._reserve0 / token0Decimals[i]) *
          token0Price[token1Addresses[i].toLowerCase()]) /
      (totalSupply[i] / 1e18);
    } else {
    
    token.lpPrice =
      (((getReserves[i]._reserve0 / token0Decimals[i]) *
        token0Price[token0Addresses[i].toLowerCase()] )+
       ( (getReserves[i]._reserve1 / token1Decimals[i]) *
          token1Price[token1Addresses[i].toLowerCase()])) /
      (totalSupply[i] / 1e18);
    }
      console.log("LP Price Info", token.lpPrice, token0Decimals[i], token1Decimals[i], totalSupply[i], getReserves[i]._reserve0, getReserves[i]._reserve1,token0Addresses[i].toLowerCase(),token1Addresses[i].toLowerCase(), token0Price[token0Addresses[i].toLowerCase()], token1Price[token1Addresses[i].toLowerCase()])
  });

  const lpPrices = {};
  lpMarkets.map((lp) => {
    lpPrices[lp.lpToken.toLowerCase()] = lp.lpPrice ;
  });

  return lpPrices;
};

const getInfos = async () => {
  return await (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: Object.entries(vaults).map((vault) => ({
        target: vault[1],
        params: ['0x0000000000000000000000000000000000000001'],
      })),
      abi: windAndCheck.find(({ name }) => name === 'getUserInfo'),
    })
  ).output.map(({ output }) => output);
};

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price ?? 1,
    }),
    {}
  );

  return pricesByAddress;
};
const convertAPR2APY = (apr) => {
  return (apy = ((apr / (365 * 72) + 1) ** (365 * 72) - 1) * 100);
};

const calcApy = async () => {
  const pricesTokens = await getPrices(
    tokens.filter(
      (token) => !token.lp
    ).map((token) => token.address).map((token) => `${CHAIN}:` + token)
  );
  const lpPrices = await unwrapLP(
    CHAIN,
    tokens.filter(
      (token) => token.lp === true
    ).map((token) => token.address)
  );
  const prices = {
    ...pricesTokens,
    ...lpPrices,
  };
  console.log("LP Prices", lpPrices)
  console.log("Prices", prices)
  const infos = await getInfos();
  
  console.log(infos);
  const pools = tokens.map((token, i) => {
    const symbol = token.name;
    const tokenAddress = token.address;
    const tokxens = token.tokens;
    const vaultAddress = vaults[symbol]?.toLowerCase();

    const decimals = token.decimals;
    let price = prices[tokenAddress.toLowerCase()];
   
    const info = infos[i];
    console.log(info);
    const tvlUsd = ((token.lp?info.totalCollateral ?? 0 :info.totalSupplied ?? 0) / 10 ** decimals) * price;
    const apyBase = convertAPR2APY((info.lastAPR ?? 0) / 1e6);

    return {
      pool: vaultAddress,
      chain: CHAIN,
      project: PROJECT_NAME,
      symbol,
      tvlUsd,
      apyBase,
      underlyingTokens:tokxens,
      rewardTokens: [tokenAddress],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: calcApy,
  url: 'https://invest.scrub.money',
};
