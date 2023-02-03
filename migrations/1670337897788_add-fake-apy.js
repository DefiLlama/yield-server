exports.up = (pgm) => {
  pgm.addColumns('yield', {
    apyRewardFake: 'numeric',
    apyRewardBorrowFake: 'numeric',
  });
};
