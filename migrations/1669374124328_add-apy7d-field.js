exports.up = (pgm) => {
  pgm.addColumns('yield', {
    apyBase7d: 'numeric',
  });
};
