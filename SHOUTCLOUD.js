var http = require('httpsync');
var SHOUTCLOUD = module.exports = {
  UPCASE: function(inputString) {
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
    return resultObject["OUTPUT"];
  }
};

var ARE_WE_SHOUTING_RIGHT_NOW = false;
var YE_OLDE_TO_UPPER_CASE = String.prototype.toUpperCase;
String.prototype.toUpperCase = function() {
  var INPUT = this;
  if (ARE_WE_SHOUTING_RIGHT_NOW) {
    return YE_OLDE_TO_UPPER_CASE.CALL(INPUT);
  } else {
    ARE_WE_SHOUTING_RIGHT_NOW = true;
    RET_VAL = SHOUTCLOUD.UPCASE(INPUT);
    ARE_WE_SHOUTING_RIGHT_NOW = false;
    return RET_VAL;
  }
}


