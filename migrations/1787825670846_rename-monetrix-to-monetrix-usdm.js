exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'monetrix-usdm' WHERE project = 'monetrix'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'monetrix' WHERE project = 'monetrix-usdm'`);
};
