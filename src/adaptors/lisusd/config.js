const toByte32 = (str) => {
  const hex = Buffer.from(str).toString('hex');
  return '0x' + hex.padEnd(64, '0');
};

const getIlks = (collateral) => {
  // Use custom ilkName if provided, otherwise generate from symbol
  return toByte32(collateral.ilkName || collateral.symbol);
};

module.exports = {
  collateralList: [
    {
      symbol: 'BNB',
      address: '0x92D8c63E893685Cced567b23916a8726b0CEF3FE',
      ilkName: 'ceABNBc',
    },
    {
      symbol: 'ETH',
      address: '0x6C813D1d114d0caBf3F82f9E910BC29fE7f96451',
      ilkName: 'cewBETH',
    },
    {
      symbol: 'slisBNB',
      address: '0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B',
      ilkName: 'SnBNB',
    },
    {
      symbol: 'BTCB',
      address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    },
    {
      symbol: 'wBETH',
      address: '0xa2E3356610840701BDf5611a53974510Ae27E2e1',
    },
    {
      symbol: 'weETH',
      address: '0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A',
    },
    {
      symbol: 'solvBTC',
      address: '0x4aae823a6a0b376De6A78e74eCC5b079d38cBCf7',
    },
    {
      symbol: 'SolvBTC.BBN',
      address: '0x1346b618dC92810EC74163e4c27004c921D446a5',
    },
    {
      symbol: 'STONE',
      address: '0x80137510979822322193fc997d400d5a6c747bf7',
    },
    {
      symbol: 'sUSDX',
      address: '0x7788A3538C5fc7F9c7C8A74EAC4c898fC8d87d92',
    },
    {
      symbol: 'pumpBTC',
      address: '0xc6F28a668b7c18F921ccBA4adc3D8db72BFF0FE2',
      originAddress: '0xf9C4FF105803A77eCB5DAE300871Ad76c2794fa4',
      ilkName: 'cePumpBTC',
    },
    {
      symbol: 'wstETH',
      address: '0x26c5e01524d2E6280A48F2c50fF6De7e52E9611C',
    },
    {
      symbol: 'USDT',
      address: '0x55d398326f99059fF775485246999027B3197955',
    },
    {
      symbol: 'FDUSD',
      address: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409',
    },
    {
      symbol: 'mBTC',
      address: '0x4510aa2b3efd13bBFD78C9BfdE764F224ecc7f50',
      ilkName: 'cemBTC',
      originAddress: '0x7c1cca5b25fa0bc9af9275fb53cba89dc172b878',
    },
    {
      symbol: 'mCAKE',
      address: '0x581fa684d0ec11ccb46b1d92f1f24c8a3f95c0ca',
      ilkName: 'mCAKE',
    },
    {
      symbol: 'mwBETH',
      address: '0x7dc91cbd6cb5a3e6a95eed713aa6bf1d987146c8',
    },
  ],
  getIlks,
};
