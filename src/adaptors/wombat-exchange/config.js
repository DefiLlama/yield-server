const baseUrl = `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id`;

module.exports = {
  bsc: {
    APR_ENDPOINT: `${baseUrl}/3jEHqbiN3BQn7pyMDzkDcBwm5EYFtpMpXaeryRDGPKA7`,
    BLOCK_ENDPOINT: `${baseUrl}/aFYiBZ2nkQVbv1HsKTQcPpWBxCAiJY4w4pG8RXaDxge`,
    WOM_ADDRESS: '0xAD6742A35fB341A9Cc6ad674738Dd8da98b94Fb1',
  },
  arbitrum: {
    APR_ENDPOINT: `${baseUrl}/5YPaz7z5iYgboKtoShdvZYPohUKtrDLibcLSLzaC424M`,
    BLOCK_ENDPOINT: `${baseUrl}/H51Q1HznwXnrEEMQrKoniHJ6VLz3zryYmb9XQ8T8BmqJ`,
    WOM_ADDRESS: '0x7b5eb3940021ec0e8e463d5dbb4b7b09a89ddf96',
  },
  avax: {
    APR_ENDPOINT: `${baseUrl}/CoQESay2omXqeXf2irxDoPnggR9ULC9SeM7jPeSNgEVT`,
    BLOCK_ENDPOINT: `${baseUrl}/ESjwguQU6CdSHnBT6jMniNHkj2dfAHRdFLB5eWwDe6jB`,
    WOM_ADDRESS: '0xa15E4544D141aa98C4581a1EA10Eb9048c3b3382',
  },
};
