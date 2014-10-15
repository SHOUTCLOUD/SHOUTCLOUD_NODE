SHOUTCLOUD.js: SHOUTCLOUD.go
	gopherjs build SHOUTCLOUD.go

test: SHOUTCLOUD.js
	./node_modules/.bin/mocha --reporter spec

 .PHONY: test
