exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'stablejack-v1' WHERE project = 'stable-jack-v1'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'stable-jack-v1' WHERE project = 'stablejack-v1'`);
};
