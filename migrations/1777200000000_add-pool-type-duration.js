exports.up = (pgm) => {
  pgm.addColumns('config', {
    type: 'text',
    duration: 'numeric',
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('config', ['type', 'duration']);
};
