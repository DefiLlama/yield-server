function lambdaResponse(body, {
    statusCode = 200,
    headers,
}={}) {
    const date = new Date();
    date.setMinutes(22);
    if(date < new Date()){ // we are past the :22 mark, roll over to next hour
        date.setHours(date.getHours() + 1)
    }
    const response = {
        statusCode,
        body: JSON.stringify(body),
        headers: {
            "Content-Type": "application/json",
            "Expires": date.toUTCString(),
            ...headers,
        }
    };
    return response;
}

module.exports={
    lambdaResponse
}