exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'usual-usd0' WHERE project = 'usual'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'usual' WHERE project = 'usual-usd0'`);
};
