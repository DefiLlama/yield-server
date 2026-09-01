exports.up = (pgm) => {
  pgm.addColumns('yield', {
    apyBaseBorrow: 'numeric',
    apyRewardBorrow: 'numeric',
    totalSupplyUsd: 'numeric',
    totalBorrowUsd: 'numeric',
  });
  pgm.addColumns('config', {
    ltv: 'numeric',
  });
};
