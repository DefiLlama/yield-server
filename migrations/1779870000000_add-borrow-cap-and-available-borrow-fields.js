exports.up = (pgm) => {
  pgm.addColumns('yield', {
    borrowCapUsd: 'numeric',
    availableBorrowUsd: 'numeric',
  });
};
