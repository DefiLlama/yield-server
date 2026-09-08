exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'sentora-curator' WHERE project = 'sentora'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'sentora' WHERE project = 'sentora-curator'`);
};
