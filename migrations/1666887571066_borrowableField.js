exports.up = (pgm) => {
  pgm.addColumns('config', {
    borrowable: 'boolean',
  });
};
