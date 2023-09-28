exports.up = (pgm) => {
  pgm.addColumns('yield', {
    apyBaseInception: 'numeric',
  });
};
