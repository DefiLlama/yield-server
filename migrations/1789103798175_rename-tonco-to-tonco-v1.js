exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'tonco-v1' WHERE project = 'tonco'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'tonco' WHERE project = 'tonco-v1'`);
};
