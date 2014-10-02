
module.exports = {
  UPCASE: function(inputString) {
    var http = require('http');
    var OUTPUT = null;
    var done = false;

    var postData = JSON.stringify({
      "INPUT" : inputString
    });

    var postOptions = {
        host: 'API.SHOUTCLOUD.IO',
        port: '80',
        path: '/V1/SHOUT',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };

    var postReq = http.request(postOptions, function(res) {
      res.setEncoding('utf8');

      res.on('data', function(data) {
        process.stdout.write(data);
        responseString += data;
      });

      res.on('end', function() {
        var resultObject = JSON.parse(responseString);
        OUTPUT = resultObject["OUTPUT"];
        done = true;
      });

      res.on('error', function(e) {
        // TODO: handle error.
        done = true;
        process.stdout.write(e);
      });
    });

    postReq.on('error', function(e) {
      // TODO: handle error.
      done = true;
      process.stdout.write(e);
    });

    postReq.write(postData);
    postReq.end();

    while (!done) {
    }

    return OUTPUT;
  }
};
