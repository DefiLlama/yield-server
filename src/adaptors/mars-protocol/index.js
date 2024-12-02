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
  osmosis: 'https://osmosis-rest.cosmos-apis.com',
  neutron: 'https://neutron-rest.cosmos-apis.com',
};

const tokenApis = {
  osmosis: 'https://api.astroport.fi/api/tokens?chainId=osmosis-1',
  neutron: 'https://api.astroport.fi/api/tokens?chainId=neutron-1',
};

async function apy() {
  const apyData = [];
  const pageLimit = 5;
  const oracleDecimals = 6;

  await getApy('osmosis');
  await getApy('neutron');

  return apyData;

  async function getApy(chain) {
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
        assetParams.map(async (currentParams) => {
          const asset = tokenInfos.data.find(
            (token) => token.denom === currentParams.denom
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

          const priceDecimalsDifference = asset.decimals - oracleDecimals;
          const price = new BigNumber(priceInfo.price).shiftedBy(
            priceDecimalsDifference
          );

          const totalSupplied = new BigNumber(
            totalDepositInfo.amount
          ).shiftedBy(-asset.decimals);
          const totalBorrowed = new BigNumber(debtInfo).shiftedBy(
            -asset.decimals
          );

          const depositApr = marketInfo.liquidity_rate * 100;
          const borrowApr = marketInfo.borrow_rate * 100;
          const tvlUsd = totalSupplied
            .minus(totalBorrowed)
            .times(price)
            .toNumber();

          if (
            tvlUsd < 10_000 ||
            !currentParams.credit_manager.whitelisted ||
            !currentParams.red_bank.deposit_enabled
          )
            return;

          apyData.push({
            pool: `mars-${asset.denom}-${chain}`.toLowerCase(),
            chain: `${chain.charAt(0).toUpperCase()}${chain.slice(1)}`,
            project: 'mars-protocol',
            symbol: asset.symbol,
            tvlUsd: totalSupplied.minus(totalBorrowed).times(price).toNumber(),
            apyBase: utils.aprToApy(depositApr, 365),
            underlyingTokens: [asset.denom],
            totalSupplyUsd: totalSupplied.times(price).toNumber(),
            totalBorrowUsd: totalBorrowed.times(price).toNumber(),
            apyBaseBorrow: utils.aprToApy(borrowApr, 365),
            ltv: currentParams.max_loan_to_value,
            url:
              chain === 'osmosis'
                ? 'https://osmosis.marsprotocol.io/earn/'
                : 'https://neutron.marsprotocol.io/earn/',
            borrowable: currentParams.red_bank.borrow_enabled,
          });
        })
      );
    }
  }
}

async function queryContract(api, contract, data) {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }
  const encodedData = Buffer.from(data).toString('base64');
  const endpoint = `${api}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodedData}?x-apikey=7e3642de`;
  const result = await await utils.getData(endpoint);
  return result.data;
}

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.marsprotocol.io/earn/',
};
