const sdk = require('@defillama/sdk');

module.exports = {
  bsc: {
    APR_ENDPOINT: sdk.graph.modifyEndpoint(
      '3jEHqbiN3BQn7pyMDzkDcBwm5EYFtpMpXaeryRDGPKA7'
    ),
    BLOCK_ENDPOINT: sdk.graph.modifyEndpoint(
      'aFYiBZ2nkQVbv1HsKTQcPpWBxCAiJY4w4pG8RXaDxge'
    ),
    WOM_ADDRESS: '0xAD6742A35fB341A9Cc6ad674738Dd8da98b94Fb1',
  },
  arbitrum: {
    APR_ENDPOINT: sdk.graph.modifyEndpoint(
      '5YPaz7z5iYgboKtoShdvZYPohUKtrDLibcLSLzaC424M'
    ),
    BLOCK_ENDPOINT: sdk.graph.modifyEndpoint(
      'H51Q1HznwXnrEEMQrKoniHJ6VLz3zryYmb9XQ8T8BmqJ'
    ),
    WOM_ADDRESS: '0x7b5eb3940021ec0e8e463d5dbb4b7b09a89ddf96',
  },
  avax: {
    APR_ENDPOINT: sdk.graph.modifyEndpoint(
      'CoQESay2omXqeXf2irxDoPnggR9ULC9SeM7jPeSNgEVT'
    ),
    BLOCK_ENDPOINT: sdk.graph.modifyEndpoint(
      'ESjwguQU6CdSHnBT6jMniNHkj2dfAHRdFLB5eWwDe6jB'
    ),
    WOM_ADDRESS: '0xa15E4544D141aa98C4581a1EA10Eb9048c3b3382',
  },
};
