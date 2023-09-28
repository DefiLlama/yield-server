const MODIFIED = parse(process.env.MODIFIED);
const ADDED = parse(process.env.ADDED);
const fileSet = new Set();

[...MODIFIED, ...ADDED].forEach((file) => {
  const [root0, root1, dir] = file.split('/');
  if (
    root0 === 'src' &&
    root1 === 'adaptors' &&
    dir !== 'test.js' &&
    dir !== 'utils.js' &&
    dir !== 'package.json' &&
    dir !== 'package-lock.json'
  )
    fileSet.add(dir);
});

console.log(JSON.stringify([...fileSet]));

function parse(data) {
  return data.replace('[', '').replace(']', '').split(',');
}
