package main

import (
	"github.com/gopherjs/gopherjs/js"
	"honnef.co/go/js/xhr"
)

func main() {
	js.Global.Set("SHOUTCLOUD", map[string]interface{}{
		"UPCASE": UPCASE,
	})
}

func UPCASE(INPUT string) string {
	req := xhr.NewRequest("POST", "http://API.SHOUTCLOUD.IO/V1/SHOUT") //gopherjs:blocking
	req.Timeout = 5000
	req.SetRequestHeader("Content-Type", "application/json")
	// CONCATING STRINGS LIKE PHP3
	err := req.Send("{\"INPUT\":\"" + INPUT + "\"}") //gopherjs:blocking
	if err != nil {
		return "BORK BORK BORK"
	}

	body := req.ResponseText //gopherjs:blocking
	// TODO whatever JSON munging required
	return body
}
