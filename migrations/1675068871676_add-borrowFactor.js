exports.up = (pgm) => {
  pgm.addColumns('config', {
    borrowFactor: 'numeric',
  });
};
