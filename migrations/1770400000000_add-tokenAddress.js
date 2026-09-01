exports.up = (pgm) => {
  pgm.addColumns('config', {
    token: 'text',
  });
};
