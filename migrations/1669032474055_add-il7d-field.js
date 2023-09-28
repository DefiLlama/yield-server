exports.up = (pgm) => {
  pgm.addColumns('yield', {
    il7d: 'numeric',
  });
};
