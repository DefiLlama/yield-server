exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'morpho-blue' WHERE project = 'morpho-v1'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'morpho-v1' WHERE project = 'morpho-blue'`);
};
