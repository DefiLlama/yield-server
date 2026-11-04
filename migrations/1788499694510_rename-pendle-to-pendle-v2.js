exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'pendle-v2' WHERE project = 'pendle'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'pendle' WHERE project = 'pendle-v2'`);
};
