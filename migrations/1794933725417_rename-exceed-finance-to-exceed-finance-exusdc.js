exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'exceed-finance-exusdc' WHERE project = 'exceed-finance'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'exceed-finance' WHERE project = 'exceed-finance-exusdc'`);
};
