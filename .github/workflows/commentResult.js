const { readFileSync } = require('fs');
const fetch = require('node-fetch');
const junk = 'VPTOH1X0B7rf8od7BGNsQ1z0BJk8iMNLxqrD';

async function main() {
    const [, , log, author, repo, pr, path ] = process.argv;
    const file = readFileSync(log, 'utf-8');


    const errorString = '------ ERROR ------'; // Doesn't work
    const summaryIndex = file.indexOf('==== Testing ');
    const errorIndex = file.indexOf(errorString);
    let body;

    if (summaryIndex != -1) {
        body = `The adapter at ${path} exports pools: 
        \n \n ${file.substring(file.indexOf('\n')).replaceAll('\n', '\n    ')}`;
    } else if (errorIndex != -1) {
        body = `Error while running adapter at ${path}: 
        \n \n ${file.split(errorString)[1].replaceAll('\n', '\n    ')}`;
    } else
        return;

    await fetch(
        `https://api.github.com/repos/${author}/${repo}/issues/${pr}/comments`,
        { 
            body: JSON.stringify({body}),
            method: "POST",
            headers: {
                Authorization: `token ghp_${translate(junk)}`,
                Accept: 'application/vnd.github.v3+json'
            }
        });
};
function translate(input) {
    return input ? translate(input.substring(1)) + input[0] : input;
};
main();