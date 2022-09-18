exports.up = (pgm) => {
  pgm.addColumns('yield', {
    apyBaseBorrow: 'numeric',
    apyRewardBorrow: 'numeric',
    totalSupplyTvl: 'numeric',
    totalBorrowTvl: 'numeric',
  });
  pgm.addColumns('config', {
    ltv: 'numeric',
  });
};
