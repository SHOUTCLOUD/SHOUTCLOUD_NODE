"use strict";
(function() {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else {
  console.log("warning: no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $reflect, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length), i;
  for (i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(method) {
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $subslice = function(slice, low, high, max) {
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = slice.$length - low;
  s.$capacity = slice.$capacity - low;
  if (high !== undefined) {
    s.$length = high - low;
  }
  if (max !== undefined) {
    s.$capacity = max - low;
  }
  return s;
};

var $sliceToArray = function(slice) {
  if (slice.$length === 0) {
    return [];
  }
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length), i;
  for (i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "", i;
  for (i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(null, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, i, j = 0;
  for (i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "", i;
  for (i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length), i;
  for (i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length), i;
  $internalCopy(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copy = function(dst, src, type) {
  var i;
  switch (type.kind) {
  case "Array":
    $internalCopy(dst, src, 0, 0, src.length, type.elem);
    return true;
  case "Struct":
    for (i = 0; i < type.fields.length; i++) {
      var field = type.fields[i];
      var name = field[0];
      if (!$copy(dst[name], src[name], field[3])) {
        dst[name] = src[name];
      }
    }
    return true;
  default:
    return false;
  }
};

var $internalCopy = function(dst, src, dstOffset, srcOffset, n, elem) {
  var i;
  if (n === 0) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case "Array":
  case "Struct":
    for (i = 0; i < n; i++) {
      $copy(dst[dstOffset + i], src[srcOffset + i], elem);
    }
    return;
  }

  for (i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  $copy(clone, src, type);
  return clone;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero, i;
      for (i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $internalCopy(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (a === b) {
    return true;
  }
  var i;
  switch (type.kind) {
  case "Float32":
    return $float32IsEqual(a, b);
  case "Complex64":
    return $float32IsEqual(a.$real, b.$real) && $float32IsEqual(a.$imag, b.$imag);
  case "Complex128":
    return a.$real === b.$real && a.$imag === b.$imag;
  case "Int64":
  case "Uint64":
    return a.$high === b.$high && a.$low === b.$low;
  case "Ptr":
    if (a.constructor.Struct) {
      return false;
    }
    return $pointerIsEqual(a, b);
  case "Array":
    if (a.length != b.length) {
      return false;
    }
    var i;
    for (i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case "Struct":
    for (i = 0; i < type.fields.length; i++) {
      var field = type.fields[i];
      var name = field[0];
      if (!$equal(a[name], b[name], field[3])) {
        return false;
      }
    }
    return true;
  default:
    return false;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === null || b === null || a === undefined || b === undefined || a.constructor !== b.constructor) {
    return a === b;
  }
  switch (a.constructor.kind) {
  case "Func":
  case "Map":
  case "Slice":
  case "Struct":
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  case undefined: /* js.Object */
    return a === b;
  default:
    return $equal(a.$val, b.$val, a.constructor);
  }
};

var $float32IsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a === 0 || b === 0 || a === 1/0 || b === 1/0 || a === -1/0 || b === -1/0 || a !== a || b !== b) {
    return false;
  }
  var math = $packages["math"];
  return math !== undefined && math.Float32bits(a) === math.Float32bits(b);
};

var $sliceIsEqual = function(a, ai, b, bi) {
  return a.$array === b.$array && a.$offset + ai === b.$offset + bi;
};

var $pointerIsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a.$get === $throwNilPointerError || b.$get === $throwNilPointerError) {
    return a.$get === $throwNilPointerError && b.$get === $throwNilPointerError;
  }
  var old = a.$get();
  var dummy = new Object();
  a.$set(dummy);
  var equal = b.$get() === dummy;
  a.$set(old);
  return equal;
};

var $newType = function(size, kind, string, name, pkgPath, constructor) {
  var typ;
  switch(kind) {
  case "Bool":
  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8" :
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "String":
  case "UnsafePointer":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + this.$val; };
    break;

  case "Float32":
  case "Float64":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + $floatKey(this.$val); };
    break;

  case "Int64":
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case "Uint64":
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case "Complex64":
  case "Complex128":
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$real + "$" + this.$imag; };
    break;

  case "Array":
    typ = function(v) { this.$val = v; };
    typ.Ptr = $newType(4, "Ptr", "*" + string, "", "", function(array) {
      this.$get = function() { return array; };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.prototype.$key = function() {
        return string + "$" + Array.prototype.join.call($mapArray(this.$val, function(e) {
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.extendReflectType = function(rt) {
        rt.arrayType = new $reflect.arrayType.Ptr(rt, elem.reflectType(), undefined, len);
      };
      typ.Ptr.init(typ);
      Object.defineProperty(typ.Ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case "Chan":
    typ = function(capacity) {
      this.$val = this;
      this.$capacity = capacity;
      this.$buffer = [];
      this.$sendQueue = [];
      this.$recvQueue = [];
      this.$closed = false;
    };
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
      typ.nil = new typ(0);
      typ.nil.$sendQueue = typ.nil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; } };
      typ.extendReflectType = function(rt) {
        rt.chanType = new $reflect.chanType.Ptr(rt, elem.reflectType(), sendOnly ? $reflect.SendDir : (recvOnly ? $reflect.RecvDir : $reflect.BothDir));
      };
    };
    break;

  case "Func":
    typ = function(v) { this.$val = v; };
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.extendReflectType = function(rt) {
        var typeSlice = ($sliceType($ptrType($reflect.rtype.Ptr)));
        rt.funcType = new $reflect.funcType.Ptr(rt, variadic, new typeSlice($mapArray(params, function(p) { return p.reflectType(); })), new typeSlice($mapArray(results, function(p) { return p.reflectType(); })));
      };
    };
    break;

  case "Interface":
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.init = function(methods) {
      typ.methods = methods;
      typ.extendReflectType = function(rt) {
        var imethods = $mapArray(methods, function(m) {
          return new $reflect.imethod.Ptr($newStringPtr(m[1]), $newStringPtr(m[2]), m[3].reflectType());
        });
        var methodSlice = ($sliceType($ptrType($reflect.imethod.Ptr)));
        rt.interfaceType = new $reflect.interfaceType.Ptr(rt, new methodSlice(imethods));
      };
    };
    break;

  case "Map":
    typ = function(v) { this.$val = v; };
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.extendReflectType = function(rt) {
        rt.mapType = new $reflect.mapType.Ptr(rt, key.reflectType(), elem.reflectType(), undefined, undefined);
      };
    };
    break;

  case "Ptr":
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem) {
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
      typ.extendReflectType = function(rt) {
        rt.ptrType = new $reflect.ptrType.Ptr(rt, elem.reflectType());
      };
    };
    break;

  case "Slice":
    var nativeArray;
    typ = function(array) {
      if (array.constructor !== nativeArray) {
        array = new nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.make = function(length, capacity) {
      capacity = capacity || length;
      var array = new nativeArray(capacity), i;
      if (nativeArray === Array) {
        for (i = 0; i < capacity; i++) {
          array[i] = typ.elem.zero();
        }
      }
      var slice = new typ(array);
      slice.$length = length;
      return slice;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
      typ.extendReflectType = function(rt) {
        rt.sliceType = new $reflect.sliceType.Ptr(rt, elem.reflectType());
      };
    };
    break;

  case "Struct":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { $throwRuntimeError("hash of unhashable type " + string); };
    typ.Ptr = $newType(4, "Ptr", "*" + string, "", "", constructor);
    typ.Ptr.Struct = typ;
    typ.Ptr.prototype.$get = function() { return this; };
    typ.init = function(fields) {
      var i;
      typ.fields = fields;
      typ.Ptr.extendReflectType = function(rt) {
        rt.ptrType = new $reflect.ptrType.Ptr(rt, typ.reflectType());
      };
      /* nil value */
      typ.Ptr.nil = Object.create(constructor.prototype);
      typ.Ptr.nil.$val = typ.Ptr.nil;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        Object.defineProperty(typ.Ptr.nil, field[0], { get: $throwNilPointerError, set: $throwNilPointerError });
      }
      /* methods for embedded fields */
      for (i = 0; i < typ.methods.length; i++) {
        var m = typ.methods[i];
        if (m[4] != -1) {
          (function(field, methodName) {
            typ.prototype[methodName] = function() {
              var v = this.$val[field[0]];
              return v[methodName].apply(v, arguments);
            };
          })(fields[m[4]], m[0]);
        }
      }
      for (i = 0; i < typ.Ptr.methods.length; i++) {
        var m = typ.Ptr.methods[i];
        if (m[4] != -1) {
          (function(field, methodName) {
            typ.Ptr.prototype[methodName] = function() {
              var v = this[field[0]];
              if (v.$val === undefined) {
                v = new field[3](v);
              }
              return v[methodName].apply(v, arguments);
            };
          })(fields[m[4]], m[0]);
        }
      }
      /* reflect type */
      typ.extendReflectType = function(rt) {
        var reflectFields = new Array(fields.length), i;
        for (i = 0; i < fields.length; i++) {
          var field = fields[i];
          reflectFields[i] = new $reflect.structField.Ptr($newStringPtr(field[1]), $newStringPtr(field[2]), field[3].reflectType(), $newStringPtr(field[4]), i);
        }
        rt.structType = new $reflect.structType.Ptr(rt, new ($sliceType($reflect.structField.Ptr))(reflectFields));
      };
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch(kind) {
  case "Bool":
  case "Map":
    typ.zero = function() { return false; };
    break;

  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8" :
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "UnsafePointer":
  case "Float32":
  case "Float64":
    typ.zero = function() { return 0; };
    break;

  case "String":
    typ.zero = function() { return ""; };
    break;

  case "Int64":
  case "Uint64":
  case "Complex64":
  case "Complex128":
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case "Chan":
  case "Ptr":
  case "Slice":
    typ.zero = function() { return typ.nil; };
    break;

  case "Func":
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case "Interface":
    typ.zero = function() { return $ifaceNil; };
    break;

  case "Array":
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len), i;
      for (i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case "Struct":
    typ.zero = function() { return new typ.Ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.kind = kind;
  typ.string = string;
  typ.typeName = name;
  typ.pkgPath = pkgPath;
  typ.methods = [];
  var rt = null;
  typ.reflectType = function() {
    if (rt === null) {
      rt = new $reflect.rtype.Ptr(size, 0, 0, 0, 0, $reflect.kinds[kind], undefined, undefined, $newStringPtr(string), undefined, undefined);
      rt.jsType = typ;

      var methods = [];
      if (typ.methods !== undefined) {
        var i;
        for (i = 0; i < typ.methods.length; i++) {
          var m = typ.methods[i];
          var t = m[3];
          methods.push(new $reflect.method.Ptr($newStringPtr(m[1]), $newStringPtr(m[2]), t.reflectType(), $funcType([typ].concat(t.params), t.results, t.variadic).reflectType(), undefined, undefined));
        }
      }
      if (name !== "" || methods.length !== 0) {
        var methodSlice = ($sliceType($ptrType($reflect.method.Ptr)));
        rt.uncommonType = new $reflect.uncommonType.Ptr($newStringPtr(name), $newStringPtr(pkgPath), new methodSlice(methods));
        rt.uncommonType.jsType = typ;
      }

      if (typ.extendReflectType !== undefined) {
        typ.extendReflectType(rt);
      }
    }
    return rt;
  };
  return typ;
};

var $Bool          = $newType( 1, "Bool",          "bool",           "bool",       "", null);
var $Int           = $newType( 4, "Int",           "int",            "int",        "", null);
var $Int8          = $newType( 1, "Int8",          "int8",           "int8",       "", null);
var $Int16         = $newType( 2, "Int16",         "int16",          "int16",      "", null);
var $Int32         = $newType( 4, "Int32",         "int32",          "int32",      "", null);
var $Int64         = $newType( 8, "Int64",         "int64",          "int64",      "", null);
var $Uint          = $newType( 4, "Uint",          "uint",           "uint",       "", null);
var $Uint8         = $newType( 1, "Uint8",         "uint8",          "uint8",      "", null);
var $Uint16        = $newType( 2, "Uint16",        "uint16",         "uint16",     "", null);
var $Uint32        = $newType( 4, "Uint32",        "uint32",         "uint32",     "", null);
var $Uint64        = $newType( 8, "Uint64",        "uint64",         "uint64",     "", null);
var $Uintptr       = $newType( 4, "Uintptr",       "uintptr",        "uintptr",    "", null);
var $Float32       = $newType( 4, "Float32",       "float32",        "float32",    "", null);
var $Float64       = $newType( 8, "Float64",       "float64",        "float64",    "", null);
var $Complex64     = $newType( 8, "Complex64",     "complex64",      "complex64",  "", null);
var $Complex128    = $newType(16, "Complex128",    "complex128",     "complex128", "", null);
var $String        = $newType( 8, "String",        "string",         "string",     "", null);
var $UnsafePointer = $newType( 4, "UnsafePointer", "unsafe.Pointer", "Pointer",    "", null);

var $nativeArray = function(elemKind) {
  return ({ Int: Int32Array, Int8: Int8Array, Int16: Int16Array, Int32: Int32Array, Uint: Uint32Array, Uint8: Uint8Array, Uint16: Uint16Array, Uint32: Uint32Array, Uintptr: Uint32Array, Float32: Float32Array, Float64: Float64Array })[elemKind] || Array;
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var string = "[" + len + "]" + elem.string;
  var typ = $arrayTypes[string];
  if (typ === undefined) {
    typ = $newType(12, "Array", string, "", "", null);
    typ.init(elem, len);
    $arrayTypes[string] = typ;
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, "Chan", string, "", "", null);
    typ.init(elem, sendOnly, recvOnly);
    elem[field] = typ;
  }
  return typ;
};

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var paramTypes = $mapArray(params, function(p) { return p.string; });
  if (variadic) {
    paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
  }
  var string = "func(" + paramTypes.join(", ") + ")";
  if (results.length === 1) {
    string += " " + results[0].string;
  } else if (results.length > 1) {
    string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
  }
  var typ = $funcTypes[string];
  if (typ === undefined) {
    typ = $newType(4, "Func", string, "", "", null);
    typ.init(params, results, variadic);
    $funcTypes[string] = typ;
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var string = "interface {}";
  if (methods.length !== 0) {
    string = "interface { " + $mapArray(methods, function(m) {
      return (m[2] !== "" ? m[2] + "." : "") + m[1] + m[3].string.substr(4);
    }).join("; ") + " }";
  }
  var typ = $interfaceTypes[string];
  if (typ === undefined) {
    typ = $newType(8, "Interface", string, "", "", null);
    typ.init(methods);
    $interfaceTypes[string] = typ;
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = { $key: function() { return "nil"; } };
var $error = $newType(8, "Interface", "error", "error", "", null);
$error.init([["Error", "Error", "", $funcType([], [$String], false)]]);

var $Map = function() {};
(function() {
  var names = Object.getOwnPropertyNames(Object.prototype), i;
  for (i = 0; i < names.length; i++) {
    $Map.prototype[names[i]] = undefined;
  }
})();
var $mapTypes = {};
var $mapType = function(key, elem) {
  var string = "map[" + key.string + "]" + elem.string;
  var typ = $mapTypes[string];
  if (typ === undefined) {
    typ = $newType(4, "Map", string, "", "", null);
    typ.init(key, elem);
    $mapTypes[string] = typ;
  }
  return typ;
};


var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $ptrType = function(elem) {
  var typ = elem.Ptr;
  if (typ === undefined) {
    typ = $newType(4, "Ptr", "*" + elem.string, "", "", null);
    typ.init(elem);
    elem.Ptr = typ;
  }
  return typ;
};

var $stringPtrMap = new $Map();
var $newStringPtr = function(str) {
  if (str === undefined || str === "") {
    return $ptrType($String).nil;
  }
  var ptr = $stringPtrMap[str];
  if (ptr === undefined) {
    ptr = new ($ptrType($String))(function() { return str; }, function(v) { str = v; });
    $stringPtrMap[str] = ptr;
  }
  return ptr;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.Struct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $sliceType = function(elem) {
  var typ = elem.Slice;
  if (typ === undefined) {
    typ = $newType(12, "Slice", "[]" + elem.string, "", "", null);
    typ.init(elem);
    elem.Slice = typ;
  }
  return typ;
};

var $structTypes = {};
var $structType = function(fields) {
  var string = "struct { " + $mapArray(fields, function(f) {
    return f[1] + " " + f[3].string + (f[4] !== "" ? (" \"" + f[4].replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
  }).join("; ") + " }";
  if (fields.length === 0) {
    string = "struct {}";
  }
  var typ = $structTypes[string];
  if (typ === undefined) {
    typ = $newType(0, "Struct", string, "", "", function() {
      this.$val = this;
      var i;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        var arg = arguments[i];
        this[field[0]] = arg !== undefined ? arg : field[3].zero();
      }
    });
    /* collect methods for anonymous fields */
    var i, j;
    for (i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field[1] === "") {
        var methods = field[3].methods;
        for (j = 0; j < methods.length; j++) {
          var m = methods[j].slice(0, 6).concat([i]);
          typ.methods.push(m);
          typ.Ptr.methods.push(m);
        }
        if (field[3].kind === "Struct") {
          var methods = field[3].Ptr.methods;
          for (j = 0; j < methods.length; j++) {
            typ.Ptr.methods.push(methods[j].slice(0, 6).concat([i]));
          }
        }
      }
    }
    typ.init(fields);
    $structTypes[string] = typ;
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === "Interface"), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else if (type.string === "js.Object") {
    ok = true;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethods = value.constructor.methods;
      var typeMethods = type.methods;
      for (var i = 0; i < typeMethods.length; i++) {
        var tm = typeMethods[i];
        var found = false;
        for (var j = 0; j < valueMethods.length; j++) {
          var vm = valueMethods[j];
          if (vm[1] === tm[1] && vm[2] === tm[2] && vm[3] === tm[3]) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm[1];
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.Ptr("", (value === $ifaceNil ? "" : value.constructor.string), type.string, missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  return returnTuple ? [value, true] : value;
};

var $coerceFloat32 = function(f) {
  var math = $packages["math"];
  if (math === undefined) {
    return f;
  }
  return math.Float32frombits(math.Float32bits(f));
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0, i;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0, i;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === 1/0 || n.$real === -1/0 || n.$imag === 1/0 || n.$imag === -1/0;
  var dinf = d.$real === 1/0 || d.$real === -1/0 || d.$imag === 1/0 || d.$imag === -1/0;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(0/0, 0/0);
  }
  if (ninf && !dinf) {
    return new n.constructor(1/0, 1/0);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(0/0, 0/0);
    }
    return new n.constructor(1/0, 1/0);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $deferFrames = [], $skippedDeferFrames = 0, $jumpToDefer = false, $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr) {
  if ($skippedDeferFrames !== 0) {
    $skippedDeferFrames--;
    throw jsErr;
  }
  if ($jumpToDefer) {
    $jumpToDefer = false;
    throw jsErr;
  }
  if (jsErr) {
    var newErr = null;
    try {
      $deferFrames.push(deferred);
      $panic(new $packages["github.com/gopherjs/gopherjs/js"].Error.Ptr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $deferFrames.pop();
    $callDeferred(deferred, newErr);
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  var call;
  try {
    while (true) {
      if (deferred === null) {
        deferred = $deferFrames[$deferFrames.length - 1 - $skippedDeferFrames];
        if (deferred === undefined) {
          if (localPanicValue.constructor === $String) {
            throw new Error(localPanicValue.$val);
          } else if (localPanicValue.Error !== undefined) {
            throw new Error(localPanicValue.Error());
          } else if (localPanicValue.String !== undefined) {
            throw new Error(localPanicValue.String());
          } else {
            throw new Error(localPanicValue);
          }
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        if (localPanicValue !== undefined) {
          $skippedDeferFrames++;
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(undefined, call[1]);
      if (r && r.$blocking) {
        deferred.push([r, []]);
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    if ($curGoroutine.asleep) {
      deferred.push(call);
      $jumpToDefer = true;
    }
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $nonblockingCall = function() {
  $panic(new $packages["runtime"].NotSupportedError.Ptr("non-blocking call to blocking function (mark call with \"//gopherjs:blocking\" to fix)"));
};
var $throw = function(err) { throw err; };
var $throwRuntimeError; /* set by package "runtime" */

var $dummyGoroutine = { asleep: false, exit: false, panicStack: [] };
var $curGoroutine = $dummyGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  args.push(true);
  var goroutine = function() {
    try {
      $curGoroutine = goroutine;
      $skippedDeferFrames = 0;
      $jumpToDefer = false;
      var r = fun.apply(undefined, args);
      if (r && r.$blocking) {
        fun = r;
        args = [];
        $schedule(goroutine, direct);
        return;
      }
      goroutine.exit = true;
    } catch (err) {
      if (!$curGoroutine.asleep) {
        goroutine.exit = true;
        throw err;
      }
    } finally {
      $curGoroutine = $dummyGoroutine;
      if (goroutine.exit) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        goroutine.asleep = true;
      }
      if (goroutine.asleep) {
        $awakeGoroutines--;
        if ($awakeGoroutines === 0 && $totalGoroutines !== 0 && $checkForDeadlock) {
          $panic(new $String("fatal error: all goroutines are asleep - deadlock!"));
        }
      }
    }
  };
  goroutine.asleep = false;
  goroutine.exit = false;
  goroutine.panicStack = [];
  $schedule(goroutine, direct);
};

var $scheduled = [], $schedulerLoopActive = false;
var $schedule = function(goroutine, direct) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }

  if (direct) {
    goroutine();
    return;
  }

  $scheduled.push(goroutine);
  if (!$schedulerLoopActive) {
    $schedulerLoopActive = true;
    setTimeout(function() {
      while (true) {
        var r = $scheduled.shift();
        if (r === undefined) {
          $schedulerLoopActive = false;
          break;
        }
        r();
      };
    }, 0);
  }
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  chan.$sendQueue.push(function() {
    $schedule(thisGoroutine);
    return value;
  });
  var blocked = false;
  var f = function() {
    if (blocked) {
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      return;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend());
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.constructor.elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine, value;
  var queueEntry = function(v) {
    value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  var blocked = false;
  var f = function() {
    if (blocked) {
      return value;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(); /* will panic because of closed channel */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.constructor.elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [], i;
  var selection = -1;
  for (i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var removeFromQueues = function() {
    for (i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  var blocked = false;
  var f = function() {
    if (blocked) {
      return selection;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};

var $needsExternalization = function(t) {
  switch (t.kind) {
    case "Bool":
    case "Int":
    case "Int8":
    case "Int16":
    case "Int32":
    case "Uint":
    case "Uint8":
    case "Uint16":
    case "Uint32":
    case "Uintptr":
    case "Float32":
    case "Float64":
      return false;
    case "Interface":
      return t !== $packages["github.com/gopherjs/gopherjs/js"].Object;
    default:
      return true;
  }
};

var $externalize = function(v, t) {
  switch (t.kind) {
  case "Bool":
  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8":
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "Float32":
  case "Float64":
    return v;
  case "Int64":
  case "Uint64":
    return $flatten64(v);
  case "Array":
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case "Func":
    if (v === $throwNilPointerError) {
      return null;
    }
    if (v.$externalizeWrapper === undefined) {
      $checkForDeadlock = false;
      var convert = false;
      var i;
      for (i = 0; i < t.params.length; i++) {
        convert = convert || (t.params[i] !== $packages["github.com/gopherjs/gopherjs/js"].Object);
      }
      for (i = 0; i < t.results.length; i++) {
        convert = convert || $needsExternalization(t.results[i]);
      }
      if (!convert) {
        return v;
      }
      v.$externalizeWrapper = function() {
        var args = [], i;
        for (i = 0; i < t.params.length; i++) {
          if (t.variadic && i === t.params.length - 1) {
            var vt = t.params[i].elem, varargs = [], j;
            for (j = i; j < arguments.length; j++) {
              varargs.push($internalize(arguments[j], vt));
            }
            args.push(new (t.params[i])(varargs));
            break;
          }
          args.push($internalize(arguments[i], t.params[i]));
        }
        var result = v.apply(this, args);
        switch (t.results.length) {
        case 0:
          return;
        case 1:
          return $externalize(result, t.results[0]);
        default:
          for (i = 0; i < t.results.length; i++) {
            result[i] = $externalize(result[i], t.results[i]);
          }
          return result;
        }
      };
    }
    return v.$externalizeWrapper;
  case "Interface":
    if (v === $ifaceNil) {
      return null;
    }
    if (t === $packages["github.com/gopherjs/gopherjs/js"].Object || v.constructor.kind === undefined) {
      return v;
    }
    return $externalize(v.$val, v.constructor);
  case "Map":
    var m = {};
    var keys = $keys(v), i;
    for (i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case "Ptr":
    var o = {}, i;
    for (i = 0; i < t.methods.length; i++) {
      var m = t.methods[i];
      if (m[2] !== "") { /* not exported */
        continue;
      }
      (function(m) {
        o[m[1]] = $externalize(function() {
          return v[m[0]].apply(v, arguments);
        }, m[3]);
      })(m);
    }
    return o;
  case "Slice":
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case "String":
    var s = "", r, i, j = 0;
    for (i = 0; i < v.length; i += r[1], j++) {
      r = $decodeRune(v, i);
      s += String.fromCharCode(r[0]);
    }
    return s;
  case "Struct":
    var timePkg = $packages["time"];
    if (timePkg && v.constructor === timePkg.Time.Ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }
    var o = {}, i;
    for (i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (f[2] !== "") { /* not exported */
        continue;
      }
      o[f[1]] = $externalize(v[f[0]], f[3]);
    }
    return o;
  }
  $panic(new $String("cannot externalize " + t.string));
};

var $internalize = function(v, t, recv) {
  switch (t.kind) {
  case "Bool":
    return !!v;
  case "Int":
    return parseInt(v);
  case "Int8":
    return parseInt(v) << 24 >> 24;
  case "Int16":
    return parseInt(v) << 16 >> 16;
  case "Int32":
    return parseInt(v) >> 0;
  case "Uint":
    return parseInt(v);
  case "Uint8":
    return parseInt(v) << 24 >>> 24;
  case "Uint16":
    return parseInt(v) << 16 >>> 16;
  case "Uint32":
  case "Uintptr":
    return parseInt(v) >>> 0;
  case "Int64":
  case "Uint64":
    return new t(0, v);
  case "Float32":
  case "Float64":
    return parseFloat(v);
  case "Array":
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case "Func":
    return function() {
      var args = [], i;
      for (i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i], j;
          for (j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case "Interface":
    if (t === $packages["github.com/gopherjs/gopherjs/js"].Object) {
      return v;
    }
    if (v === null) {
      return $ifaceNil;
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      var timePkg = $packages["time"];
      if (timePkg) {
        return new timePkg.Time(timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000)));
      }
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$packages["github.com/gopherjs/gopherjs/js"].Object], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return v;
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case "Map":
    var m = new $Map();
    var keys = $keys(v), i;
    for (i = 0; i < keys.length; i++) {
      var key = $internalize(keys[i], t.key);
      m[key.$key ? key.$key() : key] = { k: key, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case "Slice":
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case "String":
    v = String(v);
    var s = "", i;
    for (i = 0; i < v.length; i++) {
      s += $encodeRune(v.charCodeAt(i));
    }
    return s;
  default:
    $panic(new $String("cannot internalize " + t.string));
  }
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, Object, Error, init;
	Object = $pkg.Object = $newType(8, "Interface", "js.Object", "Object", "github.com/gopherjs/gopherjs/js", null);
	Error = $pkg.Error = $newType(0, "Struct", "js.Error", "Error", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : $ifaceNil;
	});
	Error.Ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		e = new Error.Ptr($ifaceNil);
	};
	$pkg.$init = function() {
		Object.init([["Bool", "Bool", "", $funcType([], [$Bool], false)], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [Object], true)], ["Delete", "Delete", "", $funcType([$String], [], false)], ["Float", "Float", "", $funcType([], [$Float64], false)], ["Get", "Get", "", $funcType([$String], [Object], false)], ["Index", "Index", "", $funcType([$Int], [Object], false)], ["Int", "Int", "", $funcType([], [$Int], false)], ["Int64", "Int64", "", $funcType([], [$Int64], false)], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false)], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [Object], true)], ["IsNull", "IsNull", "", $funcType([], [$Bool], false)], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false)], ["Length", "Length", "", $funcType([], [$Int], false)], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [Object], true)], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false)], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false)], ["Str", "Str", "", $funcType([], [$String], false)], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false)], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false)]]);
		Error.methods = [["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [Object], false), 0], ["Index", "Index", "", $funcType([$Int], [Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		($ptrType(Error)).methods = [["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Error", "Error", "", $funcType([], [$String], false), -1], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [Object], false), 0], ["Index", "Index", "", $funcType([$Int], [Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		Error.init([["Object", "", "", Object, ""]]);
		init();
	};
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], NotSupportedError, TypeAssertionError, errorString, MemStats, sizeof_C_MStats, init, init$1;
	NotSupportedError = $pkg.NotSupportedError = $newType(0, "Struct", "runtime.NotSupportedError", "NotSupportedError", "runtime", function(Feature_) {
		this.$val = this;
		this.Feature = Feature_ !== undefined ? Feature_ : "";
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, "Struct", "runtime.TypeAssertionError", "TypeAssertionError", "runtime", function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		this.interfaceString = interfaceString_ !== undefined ? interfaceString_ : "";
		this.concreteString = concreteString_ !== undefined ? concreteString_ : "";
		this.assertedString = assertedString_ !== undefined ? assertedString_ : "";
		this.missingMethod = missingMethod_ !== undefined ? missingMethod_ : "";
	});
	errorString = $pkg.errorString = $newType(8, "String", "runtime.errorString", "errorString", "runtime", null);
	MemStats = $pkg.MemStats = $newType(0, "Struct", "runtime.MemStats", "MemStats", "runtime", function(Alloc_, TotalAlloc_, Sys_, Lookups_, Mallocs_, Frees_, HeapAlloc_, HeapSys_, HeapIdle_, HeapInuse_, HeapReleased_, HeapObjects_, StackInuse_, StackSys_, MSpanInuse_, MSpanSys_, MCacheInuse_, MCacheSys_, BuckHashSys_, GCSys_, OtherSys_, NextGC_, LastGC_, PauseTotalNs_, PauseNs_, NumGC_, EnableGC_, DebugGC_, BySize_) {
		this.$val = this;
		this.Alloc = Alloc_ !== undefined ? Alloc_ : new $Uint64(0, 0);
		this.TotalAlloc = TotalAlloc_ !== undefined ? TotalAlloc_ : new $Uint64(0, 0);
		this.Sys = Sys_ !== undefined ? Sys_ : new $Uint64(0, 0);
		this.Lookups = Lookups_ !== undefined ? Lookups_ : new $Uint64(0, 0);
		this.Mallocs = Mallocs_ !== undefined ? Mallocs_ : new $Uint64(0, 0);
		this.Frees = Frees_ !== undefined ? Frees_ : new $Uint64(0, 0);
		this.HeapAlloc = HeapAlloc_ !== undefined ? HeapAlloc_ : new $Uint64(0, 0);
		this.HeapSys = HeapSys_ !== undefined ? HeapSys_ : new $Uint64(0, 0);
		this.HeapIdle = HeapIdle_ !== undefined ? HeapIdle_ : new $Uint64(0, 0);
		this.HeapInuse = HeapInuse_ !== undefined ? HeapInuse_ : new $Uint64(0, 0);
		this.HeapReleased = HeapReleased_ !== undefined ? HeapReleased_ : new $Uint64(0, 0);
		this.HeapObjects = HeapObjects_ !== undefined ? HeapObjects_ : new $Uint64(0, 0);
		this.StackInuse = StackInuse_ !== undefined ? StackInuse_ : new $Uint64(0, 0);
		this.StackSys = StackSys_ !== undefined ? StackSys_ : new $Uint64(0, 0);
		this.MSpanInuse = MSpanInuse_ !== undefined ? MSpanInuse_ : new $Uint64(0, 0);
		this.MSpanSys = MSpanSys_ !== undefined ? MSpanSys_ : new $Uint64(0, 0);
		this.MCacheInuse = MCacheInuse_ !== undefined ? MCacheInuse_ : new $Uint64(0, 0);
		this.MCacheSys = MCacheSys_ !== undefined ? MCacheSys_ : new $Uint64(0, 0);
		this.BuckHashSys = BuckHashSys_ !== undefined ? BuckHashSys_ : new $Uint64(0, 0);
		this.GCSys = GCSys_ !== undefined ? GCSys_ : new $Uint64(0, 0);
		this.OtherSys = OtherSys_ !== undefined ? OtherSys_ : new $Uint64(0, 0);
		this.NextGC = NextGC_ !== undefined ? NextGC_ : new $Uint64(0, 0);
		this.LastGC = LastGC_ !== undefined ? LastGC_ : new $Uint64(0, 0);
		this.PauseTotalNs = PauseTotalNs_ !== undefined ? PauseTotalNs_ : new $Uint64(0, 0);
		this.PauseNs = PauseNs_ !== undefined ? PauseNs_ : ($arrayType($Uint64, 256)).zero();
		this.NumGC = NumGC_ !== undefined ? NumGC_ : 0;
		this.EnableGC = EnableGC_ !== undefined ? EnableGC_ : false;
		this.DebugGC = DebugGC_ !== undefined ? DebugGC_ : false;
		this.BySize = BySize_ !== undefined ? BySize_ : ($arrayType(($structType([["Size", "Size", "", $Uint32, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""]])), 61)).zero();
	});
	NotSupportedError.Ptr.prototype.Error = function() {
		var err;
		err = this;
		return "not supported by GopherJS: " + err.Feature;
	};
	NotSupportedError.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		$throwRuntimeError = $externalize((function(msg) {
			$panic(new errorString(msg));
		}), ($funcType([$String], [], false)));
		e = $ifaceNil;
		e = new TypeAssertionError.Ptr("", "", "", "");
		e = new NotSupportedError.Ptr("");
	};
	TypeAssertionError.Ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.Ptr.prototype.Error = function() {
		var e, inter;
		e = this;
		inter = e.interfaceString;
		if (inter === "") {
			inter = "interface";
		}
		if (e.concreteString === "") {
			return "interface conversion: " + inter + " is nil, not " + e.assertedString;
		}
		if (e.missingMethod === "") {
			return "interface conversion: " + inter + " is " + e.concreteString + ", not " + e.assertedString;
		}
		return "interface conversion: " + e.concreteString + " is not " + e.assertedString + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	errorString.prototype.RuntimeError = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
		return "runtime error: " + e;
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	init$1 = function() {
		var memStats;
		memStats = new MemStats.Ptr(); $copy(memStats, new MemStats.Ptr(), MemStats);
		if (!((sizeof_C_MStats === 3712))) {
			console.log(sizeof_C_MStats, 3712);
			$panic(new $String("MStats vs MemStatsType size mismatch"));
		}
	};
	$pkg.$init = function() {
		($ptrType(NotSupportedError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		NotSupportedError.init([["Feature", "Feature", "", $String, ""]]);
		($ptrType(TypeAssertionError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["RuntimeError", "RuntimeError", "", $funcType([], [], false), -1]];
		TypeAssertionError.init([["interfaceString", "interfaceString", "runtime", $String, ""], ["concreteString", "concreteString", "runtime", $String, ""], ["assertedString", "assertedString", "runtime", $String, ""], ["missingMethod", "missingMethod", "runtime", $String, ""]]);
		errorString.methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["RuntimeError", "RuntimeError", "", $funcType([], [], false), -1]];
		($ptrType(errorString)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["RuntimeError", "RuntimeError", "", $funcType([], [], false), -1]];
		MemStats.init([["Alloc", "Alloc", "", $Uint64, ""], ["TotalAlloc", "TotalAlloc", "", $Uint64, ""], ["Sys", "Sys", "", $Uint64, ""], ["Lookups", "Lookups", "", $Uint64, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""], ["HeapAlloc", "HeapAlloc", "", $Uint64, ""], ["HeapSys", "HeapSys", "", $Uint64, ""], ["HeapIdle", "HeapIdle", "", $Uint64, ""], ["HeapInuse", "HeapInuse", "", $Uint64, ""], ["HeapReleased", "HeapReleased", "", $Uint64, ""], ["HeapObjects", "HeapObjects", "", $Uint64, ""], ["StackInuse", "StackInuse", "", $Uint64, ""], ["StackSys", "StackSys", "", $Uint64, ""], ["MSpanInuse", "MSpanInuse", "", $Uint64, ""], ["MSpanSys", "MSpanSys", "", $Uint64, ""], ["MCacheInuse", "MCacheInuse", "", $Uint64, ""], ["MCacheSys", "MCacheSys", "", $Uint64, ""], ["BuckHashSys", "BuckHashSys", "", $Uint64, ""], ["GCSys", "GCSys", "", $Uint64, ""], ["OtherSys", "OtherSys", "", $Uint64, ""], ["NextGC", "NextGC", "", $Uint64, ""], ["LastGC", "LastGC", "", $Uint64, ""], ["PauseTotalNs", "PauseTotalNs", "", $Uint64, ""], ["PauseNs", "PauseNs", "", ($arrayType($Uint64, 256)), ""], ["NumGC", "NumGC", "", $Uint32, ""], ["EnableGC", "EnableGC", "", $Bool, ""], ["DebugGC", "DebugGC", "", $Bool, ""], ["BySize", "BySize", "", ($arrayType(($structType([["Size", "Size", "", $Uint32, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""]])), 61)), ""]]);
		sizeof_C_MStats = 3712;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, errorString, New;
	errorString = $pkg.errorString = $newType(0, "Struct", "errors.errorString", "errorString", "errors", function(s_) {
		this.$val = this;
		this.s = s_ !== undefined ? s_ : "";
	});
	New = $pkg.New = function(text) {
		return new errorString.Ptr(text);
	};
	errorString.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	$pkg.$init = function() {
		($ptrType(errorString)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		errorString.init([["s", "s", "errors", $String, ""]]);
	};
	return $pkg;
})();
$packages["honnef.co/go/js/util"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], EventTarget;
	EventTarget = $pkg.EventTarget = $newType(0, "Struct", "util.EventTarget", "EventTarget", "honnef.co/go/js/util", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : $ifaceNil;
	});
	EventTarget.Ptr.prototype.AddEventListener = function(typ, useCapture, listener) {
		var t;
		t = new EventTarget.Ptr(); $copy(t, this, EventTarget);
		t.Object.addEventListener($externalize(typ, $String), $externalize(listener, ($funcType([js.Object], [], false))), $externalize(useCapture, $Bool));
	};
	EventTarget.prototype.AddEventListener = function(typ, useCapture, listener) { return this.$val.AddEventListener(typ, useCapture, listener); };
	EventTarget.Ptr.prototype.RemoveEventListener = function(typ, useCapture, listener) {
		var t;
		t = new EventTarget.Ptr(); $copy(t, this, EventTarget);
		t.Object.removeEventListener($externalize(typ, $String), $externalize(listener, ($funcType([js.Object], [], false))), $externalize(useCapture, $Bool));
	};
	EventTarget.prototype.RemoveEventListener = function(typ, useCapture, listener) { return this.$val.RemoveEventListener(typ, useCapture, listener); };
	$pkg.$init = function() {
		EventTarget.methods = [["AddEventListener", "AddEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), -1], ["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [js.Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [js.Object], false), 0], ["Index", "Index", "", $funcType([$Int], [js.Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["RemoveEventListener", "RemoveEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), -1], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		($ptrType(EventTarget)).methods = [["AddEventListener", "AddEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), -1], ["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [js.Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [js.Object], false), 0], ["Index", "Index", "", $funcType([$Int], [js.Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["RemoveEventListener", "RemoveEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), -1], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		EventTarget.init([["Object", "", "", js.Object, ""]]);
	};
	return $pkg;
})();
$packages["honnef.co/go/js/xhr"] = (function() {
	var $pkg = {}, errors = $packages["errors"], js = $packages["github.com/gopherjs/gopherjs/js"], util = $packages["honnef.co/go/js/util"], Request, Upload, NewRequest;
	Request = $pkg.Request = $newType(0, "Struct", "xhr.Request", "Request", "honnef.co/go/js/xhr", function(Object_, EventTarget_, ReadyState_, Response_, ResponseText_, ResponseType_, ResponseXML_, Status_, StatusText_, Timeout_, WithCredentials_, ch_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : $ifaceNil;
		this.EventTarget = EventTarget_ !== undefined ? EventTarget_ : new util.EventTarget.Ptr();
		this.ReadyState = ReadyState_ !== undefined ? ReadyState_ : 0;
		this.Response = Response_ !== undefined ? Response_ : $ifaceNil;
		this.ResponseText = ResponseText_ !== undefined ? ResponseText_ : "";
		this.ResponseType = ResponseType_ !== undefined ? ResponseType_ : "";
		this.ResponseXML = ResponseXML_ !== undefined ? ResponseXML_ : $ifaceNil;
		this.Status = Status_ !== undefined ? Status_ : 0;
		this.StatusText = StatusText_ !== undefined ? StatusText_ : "";
		this.Timeout = Timeout_ !== undefined ? Timeout_ : 0;
		this.WithCredentials = WithCredentials_ !== undefined ? WithCredentials_ : false;
		this.ch = ch_ !== undefined ? ch_ : ($chanType($error, false, false)).nil;
	});
	Upload = $pkg.Upload = $newType(0, "Struct", "xhr.Upload", "Upload", "honnef.co/go/js/xhr", function(Object_, EventTarget_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : $ifaceNil;
		this.EventTarget = EventTarget_ !== undefined ? EventTarget_ : new util.EventTarget.Ptr();
	});
	Request.Ptr.prototype.Upload = function() {
		var r, o;
		r = this;
		o = r.Object.upload;
		return new Upload.Ptr(o, new util.EventTarget.Ptr(o));
	};
	Request.prototype.Upload = function() { return this.$val.Upload(); };
	NewRequest = $pkg.NewRequest = function(method, url) {
		var o, r;
		o = new ($global.XMLHttpRequest)();
		r = new Request.Ptr(o, new util.EventTarget.Ptr(o), 0, $ifaceNil, "", "", $ifaceNil, 0, "", 0, false, ($chanType($error, false, false)).nil);
		r.Object.open($externalize(method, $String), $externalize(url, $String), $externalize(true, $Bool));
		return r;
	};
	Request.Ptr.prototype.ResponseHeaders = function() {
		var r;
		r = this;
		return $internalize(r.Object.getAllResponseHeaders(), $String);
	};
	Request.prototype.ResponseHeaders = function() { return this.$val.ResponseHeaders(); };
	Request.Ptr.prototype.ResponseHeader = function(name) {
		var r, value;
		r = this;
		value = r.Object.getResponseHeader($externalize(name, $String));
		if (value === null) {
			return "";
		}
		return $internalize(value, $String);
	};
	Request.prototype.ResponseHeader = function(name) { return this.$val.ResponseHeader(name); };
	Request.Ptr.prototype.Abort = function() {
		var r, _selection;
		r = this;
		if (r.ch === ($chanType($error, false, false)).nil) {
			return;
		}
		r.Object.abort();
		_selection = $select([[r.ch, $pkg.ErrAborted], []]);
	};
	Request.prototype.Abort = function() { return this.$val.Abort(); };
	Request.Ptr.prototype.OverrideMimeType = function(mimetype) {
		var r;
		r = this;
		r.Object.overrideMimeType($externalize(mimetype, $String));
	};
	Request.prototype.OverrideMimeType = function(mimetype) { return this.$val.OverrideMimeType(mimetype); };
	Request.Ptr.prototype.Send = function(data, $b) {
		var $this = this, $args = arguments, $r, $s = 0, r, _r, val;
		/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { while (true) { switch ($s) { case 0:
		r = $this;
		if (!(r.ch === ($chanType($error, false, false)).nil)) {
			$panic(new $String("must not use a Request for multiple requests"));
		}
		r.ch = new ($chanType($error, false, false))(1);
		r.EventTarget.AddEventListener("load", false, (function() {
			$go((function($b) {
				var $this = this, $args = arguments, $r, $s = 0;
				/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { while (true) { switch ($s) { case 0:
				$r = $send(r.ch, $ifaceNil, true); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
				/* */ case -1: } return; } }; $f.$blocking = true; return $f;
			}), []);
		}));
		r.EventTarget.AddEventListener("error", false, (function(o) {
			$go((function($b) {
				var $this = this, $args = arguments, $r, $s = 0;
				/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { while (true) { switch ($s) { case 0:
				$r = $send(r.ch, new js.Error.Ptr(o), true); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
				/* */ case -1: } return; } }; $f.$blocking = true; return $f;
			}), []);
		}));
		r.EventTarget.AddEventListener("timeout", false, (function() {
			$go((function($b) {
				var $this = this, $args = arguments, $r, $s = 0;
				/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { while (true) { switch ($s) { case 0:
				$r = $send(r.ch, $pkg.ErrTimeout, true); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
				/* */ case -1: } return; } }; $f.$blocking = true; return $f;
			}), []);
		}));
		r.Object.send($externalize(data, $emptyInterface));
		_r = $recv(r.ch, true); /* */ $s = 1; case 1: if (_r && _r.$blocking) { _r = _r(); }
		val = _r[0];
		return val;
		/* */ case -1: } return; } }; $f.$blocking = true; return $f;
	};
	Request.prototype.Send = function(data, $b) { return this.$val.Send(data, $b); };
	Request.Ptr.prototype.SetRequestHeader = function(header, value) {
		var r;
		r = this;
		r.Object.setRequestHeader($externalize(header, $String), $externalize(value, $String));
	};
	Request.prototype.SetRequestHeader = function(header, value) { return this.$val.SetRequestHeader(header, value); };
	$pkg.$init = function() {
		Request.methods = [["AddEventListener", "AddEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), 1], ["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [js.Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [js.Object], false), 0], ["Index", "Index", "", $funcType([$Int], [js.Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["RemoveEventListener", "RemoveEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), 1], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		($ptrType(Request)).methods = [["Abort", "Abort", "", $funcType([], [], false), -1], ["AddEventListener", "AddEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), 1], ["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [js.Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [js.Object], false), 0], ["Index", "Index", "", $funcType([$Int], [js.Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["OverrideMimeType", "OverrideMimeType", "", $funcType([$String], [], false), -1], ["RemoveEventListener", "RemoveEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), 1], ["ResponseHeader", "ResponseHeader", "", $funcType([$String], [$String], false), -1], ["ResponseHeaders", "ResponseHeaders", "", $funcType([], [$String], false), -1], ["Send", "Send", "", $funcType([$emptyInterface], [$error], false), -1], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["SetRequestHeader", "SetRequestHeader", "", $funcType([$String, $String], [], false), -1], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0], ["Upload", "Upload", "", $funcType([], [($ptrType(Upload))], false), -1]];
		Request.init([["Object", "", "", js.Object, ""], ["EventTarget", "", "", util.EventTarget, ""], ["ReadyState", "ReadyState", "", $Int, "js:\"readyState\""], ["Response", "Response", "", js.Object, "js:\"response\""], ["ResponseText", "ResponseText", "", $String, "js:\"responseText\""], ["ResponseType", "ResponseType", "", $String, "js:\"responseType\""], ["ResponseXML", "ResponseXML", "", js.Object, "js:\"responseXML\""], ["Status", "Status", "", $Int, "js:\"status\""], ["StatusText", "StatusText", "", $String, "js:\"statusText\""], ["Timeout", "Timeout", "", $Int, "js:\"timeout\""], ["WithCredentials", "WithCredentials", "", $Bool, "js:\"withCredentials\""], ["ch", "ch", "honnef.co/go/js/xhr", ($chanType($error, false, false)), ""]]);
		Upload.methods = [["AddEventListener", "AddEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), 1], ["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [js.Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [js.Object], false), 0], ["Index", "Index", "", $funcType([$Int], [js.Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["RemoveEventListener", "RemoveEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), 1], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		($ptrType(Upload)).methods = [["AddEventListener", "AddEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), 1], ["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [js.Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [js.Object], false), 0], ["Index", "Index", "", $funcType([$Int], [js.Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["RemoveEventListener", "RemoveEventListener", "", $funcType([$String, $Bool, ($funcType([js.Object], [], false))], [], false), 1], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		Upload.init([["Object", "", "", js.Object, ""], ["EventTarget", "", "", util.EventTarget, ""]]);
		$pkg.ErrAborted = errors.New("request aborted");
		$pkg.ErrTimeout = errors.New("request timed out");
	};
	return $pkg;
})();
$packages["main"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], xhr = $packages["honnef.co/go/js/xhr"], main, UPCASE;
	main = function() {
		var _map, _key;
		$global.SHOUTCLOUD = $externalize((_map = new $Map(), _key = "UPCASE", _map[_key] = { k: _key, v: new ($funcType([$String], [$String], false))(UPCASE) }, _map), ($mapType($String, $emptyInterface)));
	};
	UPCASE = $pkg.UPCASE = function(INPUT, $b) {
		var $this = this, $args = arguments, $r, $s = 0, req, _r, err, body;
		/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { while (true) { switch ($s) { case 0:
		req = xhr.NewRequest("POST", "http://API.SHOUTCLOUD.IO/V1/SHOUT");
		req.Object.timeout = 5000;
		req.SetRequestHeader("Content-Type", "application/json");
		_r = req.Send(new $String("{\"INPUT\":\"" + INPUT + "\"}"), true); /* */ $s = 1; case 1: if (_r && _r.$blocking) { _r = _r(); }
		err = _r;
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return "BORK BORK BORK";
		}
		body = $internalize(req.Object.responseText, $String);
		return body;
		/* */ case -1: } return; } }; $f.$blocking = true; return $f;
	};
	$pkg.$run = function($b) {
		$packages["github.com/gopherjs/gopherjs/js"].$init();
		$packages["runtime"].$init();
		$packages["errors"].$init();
		$packages["honnef.co/go/js/util"].$init();
		$packages["honnef.co/go/js/xhr"].$init();
		$pkg.$init();
		main();
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$go($packages["main"].$run, [], true);

})();
//# sourceMappingURL=SHOUTCLOUD.js.map
