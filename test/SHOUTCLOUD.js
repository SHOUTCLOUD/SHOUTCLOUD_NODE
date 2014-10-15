var should = require('chai').should(),
    _SHOUTCLOUD = require('../SHOUTCLOUD'),
    UPCASE = SHOUTCLOUD.UPCASE;

describe('#UPCASE', function() {
  it('converts "hello world" to "HELLO WORLD"', function() {
    UPCASE('hello world').should.equal('HELLO WORLD');
  });
});

describe('String#toUpperCase', function() {
  it('converts "hello world" to "HELLO WORLD"', function() {
   'hello world'.toUpperCase().should.equal('HELLO WORLD');
  });
});
