exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'gauntlet' WHERE project = 'aera-v3'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'aera-v3' WHERE project = 'gauntlet'`);
};
