const app = require('./app');
const { startHealthPing } = require('./healthPing');

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  startHealthPing();
});
