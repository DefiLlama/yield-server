const axios = require('axios');
const { uint256 } = require('starknet');
const { call } = require('../../helper/starknet');
const { assetTokenAbi } = require('./abis/AssetToken');
const { interestRateModelAbi } = require('./abis/InterestRateModel');
const { default: BigNumber } = require('bignumber.js');

const interestRateModel =
  '0x59a943ca214c10234b9a3b61c558ac20c005127d183b86a99a8f3c60a08b4ff';
const oracle =
  '0x07b05e8dc9c770b72befcf09599132093cf9e57becb2d1b3e89514e1f9bdf0ab';
const markets = [
  {
    name: 'WBTC',
    address:
      '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    decimals: 8,
    supplyTokens: [
      '0x0735d0f09a4e8bf8a17005fa35061b5957dcaa56889fc75df9e94530ff6991ea',
      '0x05b7d301fa769274f20e89222169c0fad4d846c366440afc160aafadd6f88f0c',
      '0x073132577e25b06937c64787089600886ede6202d085e6340242a5a32902e23e',
      '0x036b68238f3a90639d062669fdec08c4d0bdd09826b1b6d24ef49de6d8141eaa',
    ],
    debtToken:
      '0x0491480f21299223b9ce770f23a2c383437f9fbf57abc2ac952e9af8cdb12c97',
  },
  {
    name: 'ETH',
    address:
      '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    decimals: 18,
    supplyTokens: [
      '0x01fecadfe7cda2487c66291f2970a629be8eecdcb006ba4e71d1428c2b7605c7',
      '0x057146f6409deb4c9fa12866915dd952aa07c1eb2752e451d7f3b042086bdeb8',
      '0x07170f54dd61ae85377f75131359e3f4a12677589bb7ec5d61f362915a5c0982',
      '0x044debfe17e4d9a5a1e226dabaf286e72c9cc36abbe71c5b847e669da4503893',
    ],
    debtToken:
      '0x00ba3037d968790ac486f70acaa9a1cab10cf5843bb85c986624b4d0e5a82e74',
  },
  {
    name: 'USDC',
    address:
      '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    decimals: 6,
    supplyTokens: [
      '0x002fc2d4b41cc1f03d185e6681cbd40cced61915d4891517a042658d61cba3b1',
      '0x05dcd26c25d9d8fd9fc860038dcb6e4d835e524eb8a85213a8cda5b7fff845f6',
      '0x06eda767a143da12f70947192cd13ee0ccc077829002412570a88cd6539c1d85',
      '0x05f296e1b9f4cf1ab452c218e72e02a8713cee98921dad2d3b5706235e128ee4',
    ],
    debtToken:
      '0x063d69ae657bd2f40337c39bf35a870ac27ddf91e6623c2f52529db4c1619a51',
  },
  {
    name: 'DAI',
    address:
      '0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3',
    decimals: 18,
    supplyTokens: [
      '0x022ccca3a16c9ef0df7d56cbdccd8c4a6f98356dfd11abc61a112483b242db90',
      '0x04f18ffc850cdfa223a530d7246d3c6fc12a5969e0aa5d4a88f470f5fe6c46e9',
      '0x02b5fd690bb9b126e3517f7abfb9db038e6a69a068303d06cf500c49c1388e20',
      '0x005c4676bcb21454659479b3cd0129884d914df9c9b922c1c649696d2e058d70',
    ],
    debtToken:
      '0x066037c083c33330a8460a65e4748ceec275bbf5f28aa71b686cbc0010e12597',
  },
  {
    name: 'USDT',
    address:
      '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
    decimals: 6,
    supplyTokens: [
      '0x0360f9786a6595137f84f2d6931aaec09ceec476a94a98dcad2bb092c6c06701',
      '0x0453c4c996f1047d9370f824d68145bd5e7ce12d00437140ad02181e1d11dc83',
      '0x06669cb476aa7e6a29c18b59b54f30b8bfcfbb8444f09e7bbb06c10895bf5d7b',
      '0x0514bd7ee8c97d4286bd481c54aa0793e43edbfb7e1ab9784c4b30469dcf9313',
    ],
    debtToken:
      '0x024e9b0d6bc79e111e6872bb1ada2a874c25712cf08dfc5bcf0de008a7cca55f',
  },
];

async function getTokenPrice(token) {
  const networkTokenPair = `starknet:${token}`;
  return (
    await axios.get(`https://coins.llama.fi/prices/current/${networkTokenPair}`)
  ).data.coins[networkTokenPair].price;
}

async function getApys(debtToken) {
  const state = await call({
    abi: interestRateModelAbi.getInterestState,
    target: interestRateModel,
    params: [debtToken],
    allAbi: [
      interestRateModelAbi.Uint256,
      interestRateModelAbi.InterestStateEntity,
    ],
  });
  return [
    BigNumber(uint256.uint256ToBN(state.lendingRate).toString())
      .times(100)
      .div(1e18)
      .toNumber(),
    BigNumber(uint256.uint256ToBN(state.borrowingRate).toString())
      .times(100)
      .div(1e18)
      .toNumber(),
  ];
}

async function getSupply(tokens) {
  const supplies = await Promise.all(
    tokens.map(
      async (token) =>
        await call({
          abi: assetTokenAbi.totalSupply,
          target: token,
        })
    )
  );
  return supplies
    .reduce(
      (acc, supply) => BigNumber(acc).plus(supply.toString()),
      BigNumber(0)
    )
    .toNumber();
}

async function apy() {
  return Promise.all(
    markets.map(
      async ({ name, address, decimals, supplyTokens, debtToken }) => {
        const price = await getTokenPrice(address);
        const totalSupply = await getSupply(supplyTokens);
        const totalBorrow = await getSupply([debtToken]);
        const totalSupplyUsd = (totalSupply * price) / 10 ** decimals;
        const totalBorrowUsd = (totalBorrow * price) / 10 ** decimals;
        const [lendingApy, borrowApy] = await getApys(debtToken);

        return {
          pool: debtToken.toLowerCase(),
          project: 'nostra-mainnet',
          symbol: name,
          chain: 'Starknet',
          apyBase: lendingApy,
          tvlUsd: totalSupplyUsd - totalBorrowUsd,
          underlyingTokens: [address],
          apyBaseBorrow: borrowApy,
          totalSupplyUsd,
          totalBorrowUsd,
          url: `https://app.nostra.finance/asset/${name}`,
        };
      }
    )
  );
}

module.exports = {
  apy,
  url: 'https://app.nostra.finance',
};
