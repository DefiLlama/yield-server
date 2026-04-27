exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'zest-v1' WHERE project = 'zest'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'zest' WHERE project = 'zest-v1'`);
};
