var id = function(id){return document.getElementById(id);};
var elem = function(t){var c = '';t = t.replace(/\.(.*)$/gi, function($0,$1){c=$1.replace(/\./gi, ' ');return '';});var e = document.createElement(t);e.className = c;return e;};
var strtohtml = function(s){return s.replace(/\r\n/gi, '\n').replace(/\n/gi, '\r\n').replace(/[&<>"]/gi, function($0){return $0 === '&' ? '&amp;' : $0 === '<' ? '&lt;' : $0 === '>' ? '&gt;' : $0 === '"' ? '&quot;' : '';})};
var classelems = function(classname){var arr = [];var elems = document.getElementsByClassName(classname);for(var i=0;i<elems.length;++i){arr.push(elems[i]);}return arr;}; // this is NEEDED, in case className changes in loop
var tagelems = function(tagname){var arr = [];var elems = document.getElementsByTagName(tagname);for(var i=0;i<elems.length;++i){arr.push(elems[i]);}return arr;}; // this is NEEDED, in case className changes in loop
