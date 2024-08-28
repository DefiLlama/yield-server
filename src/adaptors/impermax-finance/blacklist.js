const blacklistedPools = {
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
};

module.exports = {
  blacklistedPools,
};
