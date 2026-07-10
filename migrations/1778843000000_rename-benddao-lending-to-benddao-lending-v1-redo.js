exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'benddao-lending-v1' WHERE project = 'benddao-lending'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'benddao-lending' WHERE project = 'benddao-lending-v1'`);
};
