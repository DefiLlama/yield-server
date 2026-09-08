exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = '1inch-swap' WHERE project = '1inch'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = '1inch' WHERE project = '1inch-swap'`);
};
