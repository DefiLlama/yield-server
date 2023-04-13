module.exports = {
    bsc: {
        booster: "0x561050ffb188420d2605714f84eda714da58da69",
        wmx: "0xa75d9ca2a0a1D547409D82e1B06618EC284A2CeD",
        wmxwom: "0x0415023846Ff1C6016c4d9621de12b24B2402979",
        wom: "0xAD6742A35fB341A9Cc6ad674738Dd8da98b94Fb1",
        pancake: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
        busd: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
        endpoint_pool_map: {
            '0x2Ea772346486972E7690219c190dAdDa40Ac5dA4': '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
            '0x8df1126de13bcfef999556899F469d64021adBae': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            '0xB0219A90EF6A24a237bC038f7B7a6eAc5e01edB0': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            '0x05f727876d7C123B9Bb41507251E2Afd81EAD09A': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            '0x4dFa92842d05a790252A7f374323b9C86D7b7E12': '0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5',
            '0x312Bc7eAAF93f1C60Dc5AfC115FcCDE161055fb0': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
            '0x0520451B19AD0bb00eD35ef391086A692CFC74B2': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
            '0x48f6A8a0158031BaF8ce3e45344518f1e69f2A14': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
            '0x8ad47d7ab304272322513eE63665906b64a49dA2': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
            '0x277E777F7687239B092c8845D4d2cd083a33C903': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',

        }, //pool->ept map equivalent to lens settings
        lens_usd_stables: ['0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
            '0x55d398326f99059fF775485246999027B3197955',
            '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
            '0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5',
            '0x90C97F71E18723b0Cf0dfa30ee176Ab653E89F40',
            '0x14016E85a25aeb13065688cAFB43044C2ef86784',
            '0x4268B8F0B87b6Eae5d897996E6b845ddbD99Adf3',
            '0xFa4BA88Cf97e282c505BEa095297786c16070129',
            '0x0A3BB08b3a15A19b4De82F8AcFc862606FB69A2D',
            '0xd17479997F34dd9156Deef8F95A52D81D265be9c'],
        lens_misc_ept: ['0xAD6742A35fB341A9Cc6ad674738Dd8da98b94Fb1', '0xa75d9ca2a0a1D547409D82e1B06618EC284A2CeD',
            '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'],
        bribepools: ['0x4eb829fb1d7c9d14a214d26419bff94776853b91',
            '0x24373cf57213874c989444d9712780d4cd7ee0bd',
            '0x1623955a87dc65b19482864d7a1f7213f0e3e04a',
            '0x5623ebb81b9a10ad599baca9a309f2c409fc498c',
            '0xa140a78a0a2c4d7b2478c61c8f76f36e0c774c0f',
            '0x20099484b891d3daf50c5bcf7bae885c50778eef',
            '0x0161ab396d0e0441851c0b6a66de98e660d2cfcc',
            '0x5fc1fcbb9cf1018a3af3b86ab9115e360589d0b7',
            '0xaffeba56472e2067069e54343c3afa74a6a2af6e',
            '0x6cf9e6662c269fdfe269d0c52ec1a01e8d51f987',
            '0x844998cc12e87391c3405d73e4972d6c691f95bb',
            '0x32abdf44b89efd0dd68d6688344083bb9be9a332',
            '0xa26756a4962953f62f8e44d1aef83c121ae2f133',
            '0x0caf10050f0af729416f4d52ab87b8bc43943e23',
            '0xb8cd9d6f471ba2ff46dd4d16f63e5cc1c53020a1',
            '0xb4df346bdc7180b0808af9238e782f9a3d885203',
            '0xb18910a744dd35322f2cde65cd00a5ca716e1601'
        ],
        manual_eps: { '0xB0B195aEFA3650A6908f15CdaC7D92F8a5791B0B': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
        tvl_corr: 1 //obsolete
  },
  arbitrum: {
      booster: "0x4181E561b42fDaD14c68b0794c215DeB9Bc80c8F",
      wmx: "0x5190f06eacefa2c552dc6bd5e763b81c73293293",
      wmxwom: "0xEfF2B1353Cdcaa2C3279C2bfdE72120c7FfB5E24",
      wom: '0x7B5EB3940021Ec0e8e463D5dBB4B7B09a89DDF96',
      pancake: "0xc873fEcbd354f5A56E00E710B90EF4201db2448d", //actually a camelot swap, but doesn't really matter
      busd: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      endpoint_pool_map: {
          '0x20D7ee728900848752FA280fAD51aF40c47302f1': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      }, //pool->ept map equivalent to lens settings
      lens_usd_stables: ['0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
          '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
          '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
          '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
          '0xB0B195aEFA3650A6908f15CdaC7D92F8a5791B0B'
       ],
      lens_misc_ept: ['0x5190F06EaceFA2C552dc6BD5e763b81C73293293', '0x7B5EB3940021Ec0e8e463D5dBB4B7B09a89DDF96',],
      manual_eps: {},
      tvl_corr: '1' //obsolete
  },
};
