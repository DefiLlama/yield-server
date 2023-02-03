const fs = require('fs');

function main(){
    const adapters = fs
      .readdirSync('./src/adaptors')
      .filter((el) => !el.includes('js') && el !== '.DS_Store' && !el.includes('package')).map(t=>`"${t}"`).join(",")
    fs.writeFileSync("./src/adaptors/list.js", "module.exports = [" + adapters + "]")
}

main()