exports.up = (pgm) => {
  pgm.addColumns('yield', {
    pricePerShare: 'numeric',
  });
};
