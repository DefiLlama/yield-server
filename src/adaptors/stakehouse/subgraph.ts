const { request, gql } = require('graphql-request');

const SUBGRAPH_URL ='https://api.thegraph.com/subgraphs/name/stakehouse-dev/stakehouse-protocol';

const totaldETHMinted = gql`
  {
    stakeHouses {
      dETHMintedWithinHouse
    }
  }
`;

const getTotaldETHMinted = async () => {
  let totalDETHMintedAmt = await request(SUBGRAPH_URL, totaldETHMinted);
  console.log(totalDETHMintedAmt);
  return totalDETHMintedAmt;
};

module.exports = {
  getTotaldETHMinted
};
