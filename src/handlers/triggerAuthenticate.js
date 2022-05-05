const superagent = require('superagent');
const SSM = require('aws-sdk/clients/ssm');

module.exports.handler = async (event) => {
  await updateBearerToken();
};

// updating auth0 bearer token and storing to SSM
const updateBearerToken = async () => {
  console.log(`UPDATE BEARER TOKEN at ${new Date()}`);
  const baseString = process.env.SSM_PATH;

  const ssm = new SSM();

  // read the parameters which are required for auth0 token generation
  let params = await ssm
    .getParameter({
      Name: `${baseString}/auth0parameters`,
      WithDecryption: true,
    })
    .promise();
  params = JSON.parse(params.Parameter.Value);

  // make a post request to the auth0 provider
  const data = {
    client_id: params.client_id,
    client_secret: params.client_secret,
    audience: params.audience,
    grant_type: params.grant_type,
  };
  const token = await superagent.post(params.auth0_post_request_url).send(data);

  // update new bearer token to SSM
  await ssm
    .putParameter({
      Name: `${baseString}/bearertoken`,
      Type: 'SecureString', // encrypt
      Value: token.body.access_token,
      Overwrite: true,
    })
    .promise();
};
