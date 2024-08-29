const blacklistedLendingPools = {
  ethereum: [
    /* No token prices */
    '0x3e5b7929c71b4d6fe88c3577382786d6169005d7',
    '0x4849bb3f7fcad49437f3107a578e063677424302',
    '0x81ec6e89fd4e45c90ce77c9abbea3629f649c4e9',
    '0x8dcba0b75c1038c4babbdc0ff3bd9a8f6979dd13',
    '0xa00d47b4b304792eb07b09233467b690db847c91',
    '0xe46456153cf0e767528f4a4cd3b613d5c4101e48',
    '0xefa2e1e46b83d572d01521c4c64845b0227b6314',
    '0xf28e099827cb05c9c35397859b4b626218c5a1cc',
  ],
  polygon: [
    /* very old pools ignore */
    '0x1e987756305c6506a8687e6ceb85872c48ceaa3b',
    '0x2bb779ce585a19a202ccc6e583968431b3f15ea8',
    '0x5c796c3cee0ca11e21f707bc3dfea8edda6b197d',
    '0x63489c42530234b8f5d1124d2e671129be32b3b5',
    '0xb343cc2378dcff9a6f81b4eee3d8ecdc88560f6a',
    '0xb957d5a232eebd7c4c4b0a1af9f2043430304e65',
    '0xc1b384610a90513ea599bb15fefa3d5bffb2a790',
    '0xec07dd093007aae16508f76c07d26217b7db9f1b',
    '0x2cbc4487f0b489d554b72b2e7f9679c3cd1efbc2',
    '0x06d3ae1cfe7d3d27b8b9f541e2d76e5f33778923',
    '0x242dd049be49e795cd60f0da812deef7cf4104dc',
    '0x7166f0509bd1deedf90e42046025d929078089b4',
    '0x6817f1adf8fc29f5cf23ba814cee18120f5e88b7',
  ],
  fantom: [
    '0x65151e7a82c4415a73756608e2c66b39a57dca12'.toLowerCase(),
    '0x16875107bb3ce4b0c120c95b3b8d3f94d799c0ef'.toLowerCase(),
  ],
  scroll: [
    /* deployed with the univ2 not staked so ignore these */
    '0x838D141BdBECeAA2EB1C576b6a4309f26f795CF2'.toLowerCase(), // tkn/chi
    '0xFFCe6dB18f18D711EF7Bf45b501A6b652b44bC43'.toLowerCase(), // zen/chi
    '0xD448ac2A2d9C85010459E5f5Bf81931E5Bc40EC3'.toLowerCase(), // chi/weth
    '0x7f0997bC0ee78553DDAb736d945b7Ba10Fe38B2E'.toLowerCase(), // wbtc/weth
  ],
  arbitrum: [
    /* Exclude IMX/WETH pool on sushi */
    '0xb7e5e74b52b9ada1042594cfd8abbdee506cc6c5',
    /* No token prices */
    '0x15ed28e9396fa906b2a2bca0c729d7cced7c646e',
    '0xcc5c1540683aff992201d8922df44898e1cc9806',
    '0x01a464e2bf76bd4a3a50073026ff2335584d67d8',
    '0x1c1ccd7199afb175b425e9a1a910a3326f73faa3',
    '0x3d5fcbed1c9b6c9b0f6dea1ded55b161a6efef31',
    '0x4b28550846405a7825247f54070b568c2ece3eeb',
    '0xcf49f93ff15b0ab9d336f1d5c8697f12d95012c4',
  ],
};

const blacklistedBorrowables = {
  polygon: [
    /* No token prices */
    '0x3e5b7929c71b4d6fe88c3577382786d6169005d7',
    '0x4849bb3f7fcad49437f3107a578e063677424302',
  ],
};

module.exports = {
  blacklistedLendingPools,
  blacklistedBorrowables,
};
