exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'veranta' WHERE project = 'avantis'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'avantis' WHERE project = 'veranta'`);
};
