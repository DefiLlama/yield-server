const axios = require('axios');
const { uint256 } = require('starknet');
const { call } = require('../../helper/starknet');
const { assetTokenAbi } = require('./abis/AssetToken');
const { interestRateModelAbi } = require('./abis/InterestRateModel');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const interestRateModel =
  '0x59a943ca214c10234b9a3b61c558ac20c005127d183b86a99a8f3c60a08b4ff';
const oracle =
  '0x07b05e8dc9c770b72befcf09599132093cf9e57becb2d1b3e89514e1f9bdf0ab';
const markets = {
  WBTC: {
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
  ETH: {
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
  USDC: {
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
  DAI: {
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
  USDT: {
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
  wstETH: {
    address:
      '0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2',
    decimals: 18,
    supplyTokens: [
      '0x00ca44c79a77bcb186f8cdd1a0cd222cc258bebc3bec29a0a020ba20fdca40e9',
      '0x009377fdde350e01e0397820ea83ed3b4f05df30bfb8cf8055d62cafa1b2106a',
      '0x07e2c010c0b381f347926d5a203da0335ef17aefee75a89292ef2b0f94924864',
      '0x05eb6de9c7461b3270d029f00046c8a10d27d4f4a4c931a4ea9769c72ef4edbb',
    ],
    debtToken:
      '0x0348cc417fc877a7868a66510e8e0d0f3f351f5e6b0886a86b652fcb30a3d1fb',
  },
  LORDS: {
    address:
      '0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49',
    decimals: 18,
    supplyTokens: [
      '0x0507eb06dd372cb5885d3aaf18b980c41cd3cd4691cfd3a820339a6c0cec2674',
      '0x0739760bce37f89b6c1e6b1198bb8dc7166b8cf21509032894f912c9d5de9cbd',
      '0x000d294e16a8d24c32eed65ea63757adde543d72bad4af3927f4c7c8969ff43d',
      '0x02530a305dd3d92aad5cf97e373a3d07577f6c859337fb0444b9e851ee4a2dd4',
    ],
    debtToken:
      '0x035778d24792bbebcf7651146896df5f787641af9e2a3db06480a637fbc9fff8',
  },
  STRK: {
    address:
      '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    decimals: 18,
    supplyTokens: [
      '0x026c5994c2462770bbf940552c5824fb0e0920e2a8a5ce1180042da1b3e489db',
      '0x07c2e1e733f28daa23e78be3a4f6c724c0ab06af65f6a95b5e0545215f1abc1b',
      '0x07c535ddb7bf3d3cb7c033bd1a4c3aac02927a4832da795606c0f3dbbc6efd17',
      '0x040f5a6b7a6d3c472c12ca31ae6250b462c6d35bbdae17bd52f6c6ca065e30cf',
    ],
    debtToken:
      '0x001258eae3eae5002125bebf062d611a772e8aea3a1879b64a19f363ebd00947',
  },
  nstSTRK: {
    address:
      '0x04619e9ce4109590219c5263787050726be63382148538f3f936c22aa87d2fc2',
    decimals: 18,
    supplyTokens: [
      '0x078a40c85846e3303bf7982289ca7def68297d4b609d5f588208ac553cff3a18',
      '0x067a34ff63ec38d0ccb2817c6d3f01e8b0c4792c77845feb43571092dcf5ebb5',
      '0x04b11c750ae92c13fdcbe514f9c47ba6f8266c81014501baa8346d3b8ba55342',
      '0x0142af5b6c97f02cac9c91be1ea9895d855c5842825cb2180673796e54d73dc5',
    ],
    debtToken:
      '0x0292be6baee291a148006db984f200dbdb34b12fb2136c70bfe88649c12d934b',
  },
  UNO: {
    address:
      '0x0719b5092403233201aa822ce928bd4b551d0cdb071a724edd7dc5e5f57b7f34',
    decimals: 18,
    supplyTokens: [
      '0x1325caf7c91ee415b8df721fb952fa88486a0fc250063eafddd5d3c67867ce7',
      '0x2a3a9d7bcecc6d3121e3b6180b73c7e8f4c5f81c35a90c8dd457a70a842b723',
      '0x6757ef9960c5bc711d1ba7f7a3bff44a45ba9e28f2ac0cc63ee957e6cada8ea',
      '0x7d717fb27c9856ea10068d864465a2a8f9f669f4f78013967de06149c09b9af',
    ],
    debtToken:
      '0x4b036839a8769c04144cc47415c64b083a2b26e4a7daa53c07f6042a0d35792',
  },
  NSTR: {
    address:
      '0x00c530f2c0aa4c16a0806365b0898499fba372e5df7a7172dc6fe9ba777e8007',
    decimals: 18,
    supplyTokens: [
      '0x2b674ffda238279de5550d6f996bf717228d316555f07a77ef0a082d925b782',
      '0x6f8ad459c712873993e9ffb9013a469248343c3d361e4d91a8cac6f98575834',
      '0x2589fc11f60f21af6a1dda3aeb7a44305c552928af122f2834d1c3b1a7aa626',
      '0x46ab56ec0c6a6d42384251c97e9331aa75eb693e05ed8823e2df4de5713e9a4',
    ],
    debtToken:
      '0x3e0576565c1b51fcac3b402eb002447f21e97abb5da7011c0a2e0b465136814',
  },
};
const starknetFoundationIncentivesEndpoint =
  'https://kx58j6x5me.execute-api.us-east-1.amazonaws.com/starknet/fetchFile?file=prod-api/lending/lending_strk_grant.json';

async function getTokenPrice(token) {
  const networkTokenPair = `starknet:${token}`;
  return (
    await axios.get(`https://coins.llama.fi/prices/current/${networkTokenPair}`)
  ).data.coins[networkTokenPair]?.price;
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

async function getStarknetFoundationIncentives() {
  const { data } = await axios.get(starknetFoundationIncentivesEndpoint);
  return data['Nostra'];
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
  const incentives = await getStarknetFoundationIncentives();

  const pools = await Promise.all(
    Object.entries(markets).map(
      async ([name, { address, decimals, supplyTokens, debtToken }]) => {
        const price = await getTokenPrice(address);
        const totalSupply = await getSupply(supplyTokens);
        const totalBorrow = await getSupply([debtToken]);
        const totalSupplyUsd = (totalSupply * price) / 10 ** decimals;
        const totalBorrowUsd = (totalBorrow * price) / 10 ** decimals;
        const [lendingApy, borrowApy] = await getApys(debtToken);
        const tokenIncentive = incentives[name];

        return {
          pool: debtToken.toLowerCase(),
          project: 'nostra-money-market',
          symbol: name,
          chain: 'Starknet',
          apyBase: lendingApy,
          apyReward:
            tokenIncentive && tokenIncentive.length > 0
              ? 100 *
                tokenIncentive[tokenIncentive.length - 1]['strk_grant_apr_nrs']
              : 0,
          rewardTokens: tokenIncentive ? [markets.STRK.address] : [],
          tvlUsd: totalSupplyUsd - totalBorrowUsd,
          underlyingTokens: [address],
          apyBaseBorrow: borrowApy,
          totalSupplyUsd,
          totalBorrowUsd,
          url: `https://app.nostra.finance/lend-borrow/${name}/deposit`,
        };
      }
    )
  );
  return pools.filter((i) => utils.keepFinite(i));
}

module.exports = {
  apy,
  url: 'https://app.nostra.finance',
};
