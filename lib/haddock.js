COMMENT_PREFIX = "-- ";
DOCSTRING_PREFIX = COMMENT_PREFIX + "| ";


function setdefault(dict, key, value) {
    if (!(key in dict))
        dict[key] = value;
    return dict[key];
}


function findDocsForSymbol(docs_by_module, symbol) {

  var module_qualification_chunks = symbol.split(".");
  var last_chunk = module_qualification_chunks[module_qualification_chunks.length - 1]

  for (var mkey in docs_by_module) {
    var module_dict = docs_by_module[mkey];

    for (var skey in module_dict) {
      if (skey == last_chunk) {
        return module_dict[skey];
      }
    }
  }
  return "-- <no documentation>";
}

function parseHoogleTextDoc(file_contents) {
    lines = file_contents.trim().split('\n');

    var current_module = null;
    var docstring_lines = [];

    // Nested dict; outer key is module name.
    // inner key is function/variable name.
    var entity_docs_map = {};

    for (var i=0; i<lines.length; i++) {
      var line = lines[i];

      if (line.startsWith(COMMENT_PREFIX)) {
        docstring_lines.push(line);
      } else {

        var tokens = line.split(/\s+/);

        if (tokens.length > 0) {
          if (tokens[0] == "module") {
            current_module = tokens[1];
          } else {

            if (current_module != null) {
              if (tokens.length > 1) {
                if (tokens[1] == "::") {
                  var entity_name = tokens[0];
                  if (docstring_lines.length > 0) {
                    var sub_dict = setdefault(entity_docs_map, current_module, {});
                    sub_dict[entity_name] = docstring_lines.join("\n");
                  }
                }
              }
            }
          }
        }

        docstring_lines = [];
      }
    }

    return entity_docs_map;
}

exports.parseHoogleTextDoc = parseHoogleTextDoc;
exports.findDocsForSymbol = findDocsForSymbol;
