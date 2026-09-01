const sdk = require('@defillama/sdk');

module.exports = {
  bsc: {
    APR_ENDPOINT: sdk.graph.modifyEndpoint(
      '3jEHqbiN3BQn7pyMDzkDcBwm5EYFtpMpXaeryRDGPKA7'
    ),
    WOM_ADDRESS: '0xAD6742A35fB341A9Cc6ad674738Dd8da98b94Fb1',
  },
  arbitrum: {
    APR_ENDPOINT: sdk.graph.modifyEndpoint(
      '5YPaz7z5iYgboKtoShdvZYPohUKtrDLibcLSLzaC424M'
    ),
    WOM_ADDRESS: '0x7b5eb3940021ec0e8e463d5dbb4b7b09a89ddf96',
  },
  avax: {
    APR_ENDPOINT: sdk.graph.modifyEndpoint(
      'CoQESay2omXqeXf2irxDoPnggR9ULC9SeM7jPeSNgEVT'
    ),
    WOM_ADDRESS: '0xa15E4544D141aa98C4581a1EA10Eb9048c3b3382',
  },
};
