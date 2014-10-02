var should = require('chai').should(),
    SHOUTCLOUD = require('../SHOUTCLOUD'),
    UPCASE = SHOUTCLOUD.UPCASE;

describe('#UPCASE', function() {
  it('converts "hello world" to "HELLO WORLD"', function() {
    UPCASE('hello world').should.equal('HELLO WORLD');
  });
});
