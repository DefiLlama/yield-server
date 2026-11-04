exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'coffer' WHERE project = 'cube'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'cube' WHERE project = 'coffer'`);
};
