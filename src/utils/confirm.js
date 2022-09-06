const readline = require('readline');

module.exports.confirm = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      if (ans !== 'yes') {
        rl.close();
        console.log('Exiting');
        process.exit(1);
      } else {
        rl.close();
        resolve(ans);
      }
    })
  );
};
