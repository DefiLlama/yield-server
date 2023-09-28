const chains = {
  ethereum: {
    url: 'https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-v2/latest/gn',
    rewardToken: '0x888888435FDe8e7d4c54cAb67f206e4199454c60',
    usesGauges: true,
    stakingPools: [
      {
        name: 'dfx-cadc-usdc-v2',
        asssimilatorAddress: '0x7611f64BDB95077C9e9e6f9ad9A1E7AbfBD2B4A7',
        curveAddress: '0xDA9dcc7fd51F0D9Aa069a82647A5F3ba594edAED',
        stakingAddress: '0xBE5869c78668B2c49C571005f3754a92472D9E1b',
      },
      {
        name: 'dfx-euroc-usdc-v2',
        asssimilatorAddress: '0xf8053A18bd7A608e54E3694fe042702CA560D1a3',
        curveAddress: '0x8cd86fbC94BeBFD910CaaE7aE4CE374886132c48',
        stakingAddress: '0x1e07D4dad0614A811A12BDCD66016f48c6942A60',
      },
      {
        name: 'dfx-xsgd-usdc-v2',
        asssimilatorAddress: '0xF866ACa6DC860e088045CbB5ee9ea48744eE2b48',
        curveAddress: '0xACC5Dca0B684f444bC6b4be30B95Ca7D928A4B9c',
        stakingAddress: '0xE7006808E855F3707Ec58bDfb66A096A7a6155e1',
      },
      {
        name: 'dfx-nzds-usdc-v2',
        asssimilatorAddress: '0xAb44c9482Db0FE517705D6dF72f949d5EeA91C3F',
        curveAddress: '0xc147cee0F6BB0e56240868c9f53aE916D3b86073',
        stakingAddress: '0x45C38b5126eB70e8B0A2c2e9FE934625641bF063',
      },
      {
        name: 'dfx-tryb-usdc-v2',
        asssimilatorAddress: '0x978E49F33E2c07A4D1918E95B58aC13F61ee8aa4',
        curveAddress: '0x38F818fCd57F8A1782bBCC1C90CB0FD03e7f0bd1',
        stakingAddress: '0xb0de1886dD949b5DBFB9feBF7ba283f5Ff87c7EB',
      },
      {
        name: 'dfx-gyen-usdc-v2',
        asssimilatorAddress: '0x4b0d7530F5Ab428abac06fa92163F00de89f7D27',
        curveAddress: '0x9aFD65013770525E43a84e49c87B3015C2C32517',
        stakingAddress: '0xA2Bc5552A5A083E78ec820A91e97933133255572',
      },
      {
        name: 'dfx-xidr-usdc-v2',
        asssimilatorAddress: '0xEe499d42a88aF0AE665347d3e797515A56a4E799',
        curveAddress: '0xb7dB2F8d25C51A26799bE6765720c3C6D84CD2f2',
        stakingAddress: '0x520B0284bCD3Fb0BA427Df1fCd1DE444c7c676A5',
      },
      {
        name: 'dfx-gbpt-usdc-v2',
        asssimilatorAddress: '0xf10D0EAEA98Bd5aed3654848a2C0EF7D837C114b',
        curveAddress: '0x7d1bA2c18CbDE0D790Cc1d626F0c70b3c13C9eec',
        stakingAddress: '0xB41ab47a724fB24f1DC0e57380411C7FC5cDD00B',
      },
    ],
  },
  polygon: {
    url: 'https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-v2-polygon/latest/gn',
    usesGauges: false,
    stakingPools: [
      {
        name: 'dfx-cadc-usdc-v2',
        curveAddress: '0x6691FA63aa1d7E422Dc5D19C9B04F25909fdE966',
        stakingAddress: '0xBA6F70c3dBcf712FA946A0C527c57eF7B654E2D5',
      },
      {
        name: 'dfx-eurs-usdc-v2',
        curveAddress: '0x2385D7aB31F5a470B1723675846cb074988531da',
        stakingAddress: '0xa1fcb23ce4f0aAEA0DE82B2a34c86fcC17D259Fd',
      },
      {
        name: 'dfx-ngnc-usdc-v2',
        curveAddress: '0x7B95c61f05E9720b778e81d8794F0F5dCa704d1a',
        stakingAddress: '0x210B640328D7089F67fdaa2CC0bad944fb8328F4',
      },
      {
        name: 'dfx-xsgd-usdc-v2',
        curveAddress: '0xBc408da6A7237682c8672eF7a66AFF09a9069b15',
        stakingAddress: '0x6f1b9BbD779286B39A19BB6aFBA914354365169c',
      },
      {
        name: 'dfx-tryb-usdc-v2',
        curveAddress: '0xAAb708fBd208Ac262821E229ded16234277b2B13',
        stakingAddress: '0x6E87a3B9E0A9de58b3C5FA81c93461E82Ee04e7b',
      },
    ],
  },
  arbitrum: {
    url: 'https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-v2-arbi/latest/gn',
    usesGauges: false,
    stakingPools: [
      {
        name: 'dfx-cadc-usdc-v2',
        curveAddress: '0xcd8a5ea5c44a231cb42f13056f55c65af32cb565',
        stakingAddress: '0x4c8411c5bba98223297388798d6d04ea6da7728a',
      },
      {
        name: 'dfx-gyen-usdc-v2',
        curveAddress: '0x3c3BAdFBF97EC7CaEBFf761694DD642F2C8B11E8',
        stakingAddress: '0xc63C6Bfe1E7EfCcfADcb2Eb4a0FD3B1b0e659e55',
      },
    ],
  },
};

const gaugesUrl =
  'https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-ve/0.0.6/gn';

module.exports = {
  chains,
  gaugesUrl,
};
