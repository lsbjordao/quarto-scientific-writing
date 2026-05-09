local function meta_bool(value, default)
  if value == nil then return default end
  if value == true or value == false then return value end
  local s = pandoc.utils.stringify(value):lower()
  if s == "true" or s == "yes" or s == "1" then return true end
  if s == "false" or s == "no" or s == "0" then return false end
  return default
end

-- Read and parse _variables.yml to extract variable names and numeric values
local function read_variables_file()
  local candidates = { "_variables.yml", "_variables.yaml" }
  for _, fname in ipairs(candidates) do
    local f = io.open(fname, "r")
    if f then
      local content = f:read("*all")
      f:close()
      return content
    end
  end
  return nil
end

local function parse_variables_file(content)
  if not content then return { count = 0, variables = {} } end
  local count = 0
  local variables = {}  -- array of {name=k, value=v} for numeric vars
  local values_by_name = {}
  for line in content:gmatch("[^\r\n]+") do
    -- skip blank lines and comments
    if not line:match("^%s*#") and not line:match("^%s*$") then
      -- match "key: scalar_value" lines (not list items starting with -)
      local key, value = line:match("^%s*([%w][%w_%-]*)%s*:%s*(.+)$")
      if key and value then
        value = value:match("^(.-)%s*$") -- rtrim
        -- skip block scalars and nested keys with no inline value
        if value ~= "" and not value:match("^[|>]") and not value:match("^%-") then
          count = count + 1
          -- capture plain numbers (integer or decimal, optional leading minus)
          local num = value:match("^%-?%d+%.?%d*$")
          if num then
            local abs_num = (tostring(num):gsub("^%-", ""))
            table.insert(variables, { name = key, value = abs_num })
            values_by_name[key] = abs_num
          end
        end
      end
    end
  end
  return { count = count, variables = variables, values_by_name = values_by_name }
end

local vars_content = read_variables_file()
local vars_data = parse_variables_file(vars_content)

local function read_file(fname)
  local f = io.open(fname, "r")
  if not f then return nil end
  local content = f:read("*all")
  f:close()
  return content
end

local function parse_bib_file(content)
  local keys = {}
  if not content then return keys end
  for key in content:gmatch("@[%w_%-]+%s*{%s*([^,%s]+)") do
    table.insert(keys, key)
  end
  return keys
end

-- Extract a single field value from a BibTeX entry body.
-- Handles {value}, {{value}}, "value", and plain numbers.
local function bib_field(body, name)
  local p = '%f[%a]' .. name .. '%s*=%s*'
  local v = body:match(p .. '{{(.-)}},?%s*\n')
    or body:match(p .. '{([^{}]-)}')
    or body:match(p .. '"([^"]-)"')
    or body:match(p .. '(%d+)')
  return v and v:match('^%s*(.-)%s*$') or nil
end

-- Parse all entries from a .bib file, returning only those with a DOI field.
local function parse_bib_with_doi(content)
  if not content then return {} end
  local entries = {}
  -- Split on @ to isolate each entry block
  for block in content:gmatch("(@%w+%s*{[^@]+)") do
    local etype, key = block:match("^@(%w+)%s*{%s*([^,%s]+)")
    if not etype or not key then goto next_entry end
    local body = block:sub(block:find(",") + 1)
    local doi = bib_field(body, 'doi')
    if not doi then goto next_entry end
    table.insert(entries, {
      key     = key,
      doi     = doi:gsub('%s+', ''),
      title   = bib_field(body, 'title'),
      author  = bib_field(body, 'author'),
      year    = bib_field(body, 'year'),
      journal = bib_field(body, 'journal') or bib_field(body, 'booktitle'),
      volume  = bib_field(body, 'volume'),
      number  = bib_field(body, 'number'),
      pages   = bib_field(body, 'pages'),
    })
    ::next_entry::
  end
  return entries
end

-- Fetch CrossRef metadata for a DOI via curl.
-- Returns a decoded Lua table (the "message" object) or nil on failure.
local function fetch_crossref(doi)
  local safe = doi:gsub('[^%w%.%-%/%%:_;@]', '')
  if safe == '' then return nil end
  local cmd = 'curl -s -m 15 -H "User-Agent: quarto-scientific-writing/1.0" '
    .. '"https://api.crossref.org/works/' .. safe .. '"'
  local h = io.popen(cmd)
  if not h then return nil end
  local raw = h:read('*all')
  h:close()
  if not raw or #raw < 20 then return nil end
  local ok, decoded = pcall(pandoc.json.decode, raw, false)
  if not ok or type(decoded) ~= 'table' then return nil end
  return decoded.message
end

-- Normalize a title string for comparison (strip HTML, braces, punctuation).
local function norm_title(s)
  if not s then return '' end
  s = s:gsub('<[^>]+>', ' ')        -- strip HTML tags
  s = s:gsub('&amp;', '&'):gsub('&lt;', '<'):gsub('&gt;', '>')
  s = s:gsub('[{}]', '')
  s = s:lower()
  s = s:gsub('[%u2010%u2011%u2012%u2013%u2014]', '-')
  s = s:gsub('([a-z])%d+', '%1')    -- "C3" → "C"
  s = s:gsub('%f[%d]%d+%f[%D]', '') -- isolated digits
  s = s:gsub('[^%w%s]', ' ')
  s = s:gsub('%s+', ' ')
  return s:match('^%s*(.-)%s*$')
end

local function norm_journal(s)
  if not s then return '' end
  return norm_title(s):gsub('%f[%a]and%f[%A]', ''):gsub('&', ''):gsub('%s+', ' '):match('^%s*(.-)%s*$')
end

local function family_name(s)
  return (s or ''):lower():gsub('[^a-z]', '')
end

-- Compare a bib entry against CrossRef metadata.
-- Returns an array of {field, status, bib, api} objects.
local function compare_entry(entry, work)
  local results = {}

  -- Title
  local bib_t = norm_title(entry.title or '')
  local api_titles = work.title or {}
  local title_ok = false
  local api_title_raw = ''
  for _, t in ipairs(api_titles) do
    api_title_raw = t
    if norm_title(t) == bib_t then title_ok = true; break end
  end
  if title_ok then
    table.insert(results, { field='Title', status='ok' })
  else
    local api_clean = api_title_raw:gsub('<[^>]+>', ' '):gsub('&amp;', '&'):gsub('%s+', ' '):match('^%s*(.-)%s*$')
    table.insert(results, { field='Title', status='error',
      bib = entry.title or '', api = api_clean })
  end

  -- Year
  local bib_y = tostring(entry.year or '')
  local dp = work.published and work.published['date-parts']
  local api_y = dp and dp[1] and string.format('%d', dp[1][1]) or nil
  if not api_y then
    table.insert(results, { field='Year', status='skip' })
  elseif bib_y == api_y then
    table.insert(results, { field='Year', status='ok', value=bib_y })
  else
    table.insert(results, { field='Year', status='error', bib=bib_y, api=api_y })
  end

  -- Authors
  local api_authors = work.author or {}
  if #api_authors == 0 then
    table.insert(results, { field='Authors', status='skip' })
  else
    local bib_authors = {}
    local author_str = entry.author or ''
    local pos = 1
    while pos <= #author_str do
      local ms, me = author_str:find('%s+[Aa][Nn][Dd]%s+', pos)
      local part = (ms and author_str:sub(pos, ms - 1) or author_str:sub(pos)):match('^%s*(.-)%s*$')
      if #part > 0 then
        local fam, giv = part:match('^([^,]+),(.+)$')
        if fam then
          table.insert(bib_authors, { family=fam:match('^%s*(.-)%s*$'), given=giv:match('^%s*(.-)%s*$') })
        else
          local words = {}
          for w in part:gmatch('%S+') do table.insert(words, w) end
          table.insert(bib_authors, { family=words[#words] or '', given=table.concat(words, ' ', 1, #words-1) })
        end
      end
      if ms then pos = me + 1 else break end
    end
    local mismatches = {}
    if #bib_authors ~= #api_authors then
      table.insert(results, { field='Authors', status='warn',
        bib = tostring(#bib_authors) .. ' authors',
        api = tostring(#api_authors) .. ' authors' })
    else
      for i = 1, #bib_authors do
        local bf = family_name(bib_authors[i].family)
        local af = family_name((api_authors[i] or {}).family or '')
        if bf ~= af then
          table.insert(mismatches, tostring(i) .. '. ' .. (bib_authors[i].family or '?') .. ' ≠ ' .. (api_authors[i] and api_authors[i].family or '?'))
        end
      end
      if #mismatches > 0 then
        table.insert(results, { field='Authors', status='error', notes=mismatches })
      else
        table.insert(results, { field='Authors', status='ok', value=tostring(#bib_authors) })
      end
    end
  end

  -- Journal
  local api_journal = (work['container-title'] or {})[1] or nil
  if entry.journal and api_journal then
    if norm_journal(entry.journal) == norm_journal(api_journal) then
      table.insert(results, { field='Journal', status='ok' })
    else
      local api_j_clean = api_journal:gsub('&amp;', '&')
      table.insert(results, { field='Journal', status='warn', bib=entry.journal, api=api_j_clean })
    end
  end

  -- Volume
  if entry.volume and work.volume then
    local bib_v = tostring(entry.volume):match('^%s*(.-)%s*$')
    local api_v = tostring(work.volume):match('^%s*(.-)%s*$')
    if bib_v == api_v then
      table.insert(results, { field='Volume', status='ok', value=bib_v })
    else
      table.insert(results, { field='Volume', status='error', bib=bib_v, api=api_v })
    end
  end

  -- Pages
  if entry.pages and work.page then
    local norm_p = function(s) return s:gsub('%-%-', '-'):gsub('\xe2\x80\x93', '-'):match('^%s*(.-)%s*$') end
    if norm_p(entry.pages) == norm_p(work.page) then
      table.insert(results, { field='Pages', status='ok' })
    else
      table.insert(results, { field='Pages', status='warn', bib=entry.pages, api=work.page })
    end
  end

  return results
end

local bib_content = read_file("ref.bib")
local ref_keys = parse_bib_file(bib_content)

local function read_input_source()
  local input = PANDOC_STATE and PANDOC_STATE.input_files and PANDOC_STATE.input_files[1]
  if not input then return nil end
  return read_file(input)
end

local function strip_yaml_frontmatter(content)
  if not content then return "" end
  return content:gsub("^%s*%-%-%-.-\n%-%-%-%s*\n", "", 1)
end

local function normalize_number_token(value)
  if not value then return nil end
  local v = tostring(value):gsub(",", ".")
  return v:match("%-?%d+%.?%d*")
end

local function parse_source_evidence_tokens(content, values_by_name)
  local src = strip_yaml_frontmatter(content)
  local tokens = {}
  local i = 1
  while i <= #src do
    local var_start, var_end, var_name = src:find("{{<%s*var%s+([%w_%-]+)%s*>}}", i)
    local num_start, num_end, num_value = src:find("(%-?%d+[,%d%.]*)", i)

    if var_start and (not num_start or var_start <= num_start) then
      local value = values_by_name and values_by_name[var_name]
      if value then
        table.insert(tokens, { name = var_name, value = normalize_number_token(value) })
      end
      i = var_end + 1
    elseif num_start then
      table.insert(tokens, { value = normalize_number_token(num_value) })
      i = num_end + 1
    else
      break
    end
  end
  return tokens
end

local source_evidence_tokens = parse_source_evidence_tokens(read_input_source(), vars_data.values_by_name)

local function is_str(inline, text)
  return inline and inline.t == "Str" and inline.text == text
end

local function is_space(inline)
  return inline and (inline.t == "Space" or inline.t == "SoftBreak" or inline.t == "LineBreak")
end

local function mark_var_shortcodes(inlines)
  local out = {}
  local i = 1
  while i <= #inlines do
    local a, b, c, d, e, f = inlines[i], inlines[i + 1], inlines[i + 2], inlines[i + 3], inlines[i + 4], inlines[i + 5]
    if is_str(a, "{{<") and is_space(b) and is_str(c, "var") and is_space(d) and e and e.t == "Str" then
      local end_index = nil
      if is_space(f) and is_str(inlines[i + 6], ">}}") then
        end_index = i + 6
      elseif is_str(f, ">}}") then
        end_index = i + 5
      end

      if end_index then
        local name = e.text
        local content = {}
        for j = i, end_index do
          table.insert(content, inlines[j])
        end
        table.insert(out, pandoc.Span(content, { class = "ws-var-origin", ["data-ws-var-name"] = name }))
        i = end_index + 1
      else
        table.insert(out, a)
        i = i + 1
      end
    else
      table.insert(out, a)
      i = i + 1
    end
  end
  return pandoc.Inlines(out)
end

function Para(el)
  el.content = mark_var_shortcodes(el.content)
  return el
end

function Plain(el)
  el.content = mark_var_shortcodes(el.content)
  return el
end

local function meta_num(value, default)
  if value == nil then return default end
  return tonumber(pandoc.utils.stringify(value)) or default
end

local function js_bool(value)
  return value and "true" or "false"
end

local function meta_to_lua(value)
  if value == nil then return nil end
  if type(value) ~= "table" then return value end

  local t = value.t
  if t == "MetaMap" then
    local obj = {}
    for k, v in pairs(value) do
      obj[k] = meta_to_lua(v)
    end
    return obj
  end

  if t == "MetaList" then
    local arr = {}
    for i, v in ipairs(value) do
      arr[i] = meta_to_lua(v)
    end
    return arr
  end

  if t == "MetaBool" then
    return value.c
  end

  if t == "MetaString" then
    return value.text
  end

  if t == "MetaInlines" or t == "MetaBlocks" then
    return pandoc.utils.stringify(value)
  end

  if value[1] ~= nil then
    local arr = {}
    for i, v in ipairs(value) do
      arr[i] = meta_to_lua(v)
    end
    return arr
  end

  local obj = {}
  for k, v in pairs(value) do
    obj[k] = meta_to_lua(v)
  end
  return obj
end

local function json_escape(s)
  return tostring(s)
    :gsub("\\", "\\\\")
    :gsub('"', '\\"')
    :gsub("\n", "\\n")
    :gsub("\r", "\\r")
    :gsub("\t", "\\t")
end

local function is_array(tbl)
  if type(tbl) ~= "table" then return false end
  local max = 0
  local count = 0
  for k, _ in pairs(tbl) do
    if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then
      return false
    end
    if k > max then max = k end
    count = count + 1
  end
  return count == max
end

local function json_encode(value)
  local tv = type(value)
  if value == nil then return "null" end
  if tv == "boolean" then return value and "true" or "false" end
  if tv == "number" then return tostring(value) end
  if tv == "string" then return '"' .. json_escape(value) .. '"' end

  if tv == "table" then
    if is_array(value) then
      local parts = {}
      for i = 1, #value do
        parts[i] = json_encode(value[i])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    end

    local parts = {}
    for k, v in pairs(value) do
      table.insert(parts, '"' .. json_escape(k) .. '":' .. json_encode(v))
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end

  return '"' .. json_escape(pandoc.utils.stringify(value)) .. '"'
end

local function js_json(value, default)
  if value == nil then
    return default
  end
  local as_lua = meta_to_lua(value)
  return json_encode(as_lua)
end

function Meta(meta)
  if quarto.doc.is_format("html") then
    local cfg = meta["scientific-writing"] or {}
    local nlp_cdn_enabled = meta_bool(cfg["nlp-cdn"], true)
    local nlp_cdn_url = js_json(cfg["nlp-cdn-url"], '"https://cdnjs.cloudflare.com/ajax/libs/nlp_compromise/4.8.2/nlp_compromise.min.js"')
    local nlp_cdn_script = ""
    if nlp_cdn_enabled then
      local src = nlp_cdn_url:gsub('^"', ''):gsub('"$', '')
      nlp_cdn_script = string.format('<script src="%s" async crossorigin="anonymous"></script>\n', src)
    end

    -- ── DOI validation via CrossRef ─────────────────────────────────────────
    local doi_validation_enabled = meta_bool(cfg["doi-validation"], true)
    local doi_results = {}  -- keyed by lowercase DOI

    if doi_validation_enabled then
      local bib_entries = parse_bib_with_doi(bib_content)
      if #bib_entries > 0 then
        io.stderr:write('[scientific-writing] Validating ' .. #bib_entries .. ' DOI(s) via CrossRef...\n')
        for _, entry in ipairs(bib_entries) do
          io.stderr:write('  @' .. entry.key .. ' (' .. entry.doi .. ')... ')
          local work = fetch_crossref(entry.doi)
          if work then
            local comparison = compare_entry(entry, work)
            doi_results[entry.doi:lower()] = comparison
            local has_error = false
            for _, r in ipairs(comparison) do
              if r.status == 'error' then has_error = true; break end
            end
            io.stderr:write(has_error and 'ISSUES FOUND\n' or 'ok\n')
          else
            io.stderr:write('fetch failed\n')
          end
        end
      end
    end

    local script = string.format([[
%s
<script>
window.WritingStatsConfig = {
  sentenceLong: %s,
  paragraphLong: %s,
  passiveThreshold: %s,
  methodsPassiveThreshold: %s,
  lexicalDiversityLow: %s,
  repeatedStrong: %s,
  hedgeThreshold: %s,
  defaultCompact: %s,
  defaultAlertsOnly: %s,
  sectionGoals: %s,
  ignoreTerms: %s,
  connectorAmbiguityMode: %s,
  connectorAmbiguityOverrides: %s,
  variableCount: %s,
  variableEntries: %s,
  sourceEvidenceTokens: %s,
  referenceKeys: %s,
  nlpCdn: %s,
  nlpCdnUrl: %s,
  doiValidation: %s
};
</script>
]],
      nlp_cdn_script,
      meta_num(cfg["sentence-long"], 30),
      meta_num(cfg["paragraph-long"], 150),
      meta_num(cfg["passive-threshold"], 3),
      meta_num(cfg["methods-passive-threshold"], 5),
      meta_num(cfg["lexical-diversity-low"], 0.50),
      meta_num(cfg["repeated-strong"], 3),
      meta_num(cfg["hedge-threshold"], 4),
      js_bool(meta_bool(cfg["default-compact"], false)),
      js_bool(meta_bool(cfg["default-alerts-only"], false)),
      js_json(cfg["section-goals"], "{}"),
      js_json(cfg["ignore-terms"], "[]"),
      js_json(cfg["connector-ambiguity-mode"], '"strict"'),
      js_json(cfg["connector-ambiguity-overrides"], "{}"),
      tostring(vars_data.count),
      json_encode(vars_data.variables),
      json_encode(source_evidence_tokens),
      json_encode(ref_keys),
      js_bool(nlp_cdn_enabled),
      nlp_cdn_url,
      json_encode(doi_results)
    )

    quarto.doc.include_text("in-header", script)
    quarto.doc.add_html_dependency({
      name = "scientific-writing",
      version = "1.0.0",
      scripts = {
        { path = "scientific-writing.js" }
      },
      stylesheets = {
        { path = "scientific-writing.css" }
      }
    })
  end
  return meta
end
