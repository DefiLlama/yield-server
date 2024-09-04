const utils = require('../utils');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const chains = ['osmosis', 'neutron'];

const contractAddresses = {
  osmosis: {
    params: 'osmo1nlmdxt9ctql2jr47qd4fpgzg84cjswxyw6q99u4y4u4q6c2f5ksq7ysent',
    redBank: 'osmo1c3ljch9dfw5kf52nfwpxd2zmj2ese7agnx0p9tenkrryasrle5sqf3ftpg',
    oracle: 'osmo1mhznfr60vjdp2gejhyv2gax9nvyyzhd3z0qcwseyetkfustjauzqycsy2g',
  },
  neutron: {
    params:
      'neutron1x4rgd7ry23v2n49y7xdzje0743c5tgrnqrqsvwyya2h6m48tz4jqqex06x',
    redBank:
      'neutron1n97wnm7q6d2hrcna3rqlnyqw2we6k0l8uqvmyqq6gsml92epdu7quugyph',
    oracle:
      'neutron1dwp6m7pdrz6rnhdyrx5ha0acsduydqcpzkylvfgspsz60pj2agxqaqrr7g',
  },
};

const restEndpoints = {
  osmosis: 'https://osmosis-rest.cosmos-apis.com/?x-apikey=7e3642de',
  neutron: 'https://neutron-rest.cosmos-apis.com/?x-apikey=7e3642de',
};

const tokenApis = {
  osmosis: 'https://api.astroport.fi/api/tokens?chainId=osmosis-1',
  neutron: 'https://api.astroport.fi/api/tokens?chainId=neutron-1',
};

async function apy() {
  const apyData = [];
  const pageLimit = 5;
  const oracleDecimals = 6;

  chains.forEach(async (chain) => {
    let startAfter = null;
    const { params, redBank, oracle } = contractAddresses[chain];
    const api = restEndpoints[chain];
    const tokenInfos = await axios.get(tokenApis[chain]);

    do {
      const assetParams = await queryContract(api, params, {
        all_asset_params: { limit: pageLimit, start_after: startAfter },
      });

      if (assetParams.length === pageLimit)
        startAfter = assetParams[assetParams.length - 1].denom;
      else startAfter = null;

      await getApyDataForAsset(assetParams, chain);
    } while (startAfter);

    async function getApyDataForAsset(assetParams, chain) {
      await Promise.all(
        assetParams.forEach(async (params) => {
          const asset = tokenInfos.find(
            (token) => token.denom === params.denom
          );
          if (!asset) return;

          const marketInfo = await queryContract(api, redBank, {
            market: { denom: asset.denom },
          });
          const totalDepositInfo = await queryContract(api, params, {
            total_deposit: { denom: asset.denom },
          });
          const priceInfo = await queryContract(api, oracle, {
            price: { denom: asset.denom },
          });
          const amountScaled = marketInfo['debt_total_scaled'];
          const debtInfo = await queryContract(api, redBank, {
            underlying_debt_amount: {
              denom: asset.denom,
              amount_scaled: amountScaled,
            },
          });
          const priceDecimalsDifference =
            asset.decimals.toNumber() - oracleDecimals;
          const price = priceInfo.price.shiftedBy(priceDecimalsDifference);

          const totalSupplied = new BigNumber(
            totalDepositInfo.amount
          ).shiftedBy(-asset.decimals);
          const totalBorrowed = new BigNumber(marketInfo.debtInfo).shiftedBy(
            -asset.decimals
          );

          apyData.push({
            pool: `mars-${asset.denom}-${chain}`.toLowerCase(),
            chain: `${chain.charAt(0).toUpperCase()}${chain.slice(1)}`,
            project: 'mars-protocol',
            symbol: asset.symbol,
            tvlUsd: totalSupplied.minus(totalBorrowed).times(price).toString(),
            apyBase: utils.aprToApy(marketInfo.liquidity_rate * 100, 365),
            underlyingTokens: [asset.denom],
            totalSupplyUsd: totalSupplied.times(price).toString(),
            totalBorrowUsd: totalBorrowed.times(price).toString(),
            apyBaseBorrow: utils.aprToApy(marketInfo.borrow_rate * 100, 365),
            ltv: params.max_loan_to_value,
            url: 'https://app.marsprotocol.io/earn/',
            borrowable: params.red_bank.borrow_enabled,
          });
        })
      );
    }
  });

  return apyData;
}

async function queryContract(api, contract, data) {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }
  const encodedData = Buffer.from(data).toString('base64');
  const endpoint = `${api}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodedData}`;
  return await await utils.getData(endpoint);
}

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.marsprotocol.io/earn/',
};
