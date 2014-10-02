
module.exports = {
  UPCASE: function(inputString) {
    var http = require('httpsync');
    var OUTPUT = null;

    var postData = JSON.stringify({
      "INPUT" : inputString
    });

    var postOptions = {
        url: "http://API.SHOUTCLOUD.IO/V1/SHOUT",
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        },
        timeout: 5
    };

    var postReq = http.request(postOptions);
    postReq.write(postData);
    var response = postReq.end();

    var resultObject = JSON.parse(response.data);
    OUTPUT = resultObject["OUTPUT"];

    return OUTPUT;
  }
};
