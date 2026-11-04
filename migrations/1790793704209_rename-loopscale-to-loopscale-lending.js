exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'loopscale-lending' WHERE project = 'loopscale'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'loopscale' WHERE project = 'loopscale-lending'`);
};
