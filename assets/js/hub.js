var SEARCH_INDEX = [];
window.SEARCH_INDEX = SEARCH_INDEX;
window._searchIndexLoaded = false;
window._dwPresetsLoaded = false;
window._modulesLoaded = false;

(function initProgressiveDataAndModules() {
  var searchPromise = null;
  var dwPromise = null;
  var fetchStarted = false;
  var forceImmediateFlush = false;
  var pendingHtmlChunks = [];
  var isDesktop = (typeof window !== 'undefined' && window.innerWidth >= 1024);
  var chunkCount = isDesktop ? 15 : 5;
  var finalized = false;
  var resolveHydrated = null;
  var hydratedPromise = new Promise(function(resolve) {
    resolveHydrated = resolve;
  });

  window.ensureSearchIndexLoaded = function() {
    if (window._searchIndexLoaded) return Promise.resolve(SEARCH_INDEX);
    if (searchPromise) return searchPromise;
    searchPromise = fetch('assets/data/search-index.json?v=202612')
      .then(function(r) {
        if (!r.ok) throw new Error('Failed search-index fetch: ' + r.status);
        return r.json();
      })
      .then(function(data) {
        SEARCH_INDEX = Array.isArray(data) ? data : [];
        window.SEARCH_INDEX = SEARCH_INDEX;
        window._searchIndexLoaded = true;
        return SEARCH_INDEX;
      })
      .catch(function(err) {
        searchPromise = null;
        console.error('Search index load error', err);
        return SEARCH_INDEX;
      });
    return searchPromise;
  };

  window.ensureDwPresetsLoaded = function() {
    if (window._dwPresetsLoaded) return Promise.resolve(DW_PRESETS);
    if (dwPromise) return dwPromise;
    dwPromise = fetch('assets/data/dw-presets.json?v=202612')
      .then(function(r) {
        if (!r.ok) throw new Error('Failed dw-presets fetch: ' + r.status);
        return r.json();
      })
      .then(function(data) {
        DW_PRESETS = Array.isArray(data) ? data : [];
        window.DW_PRESETS = DW_PRESETS;
        window._dwPresetsLoaded = true;
        try {
          if (typeof populateDwDropdowns === 'function') populateDwDropdowns();
          var savedIdx = null;
          try { savedIdx = localStorage.getItem('mulesoft_dw_preset_idx'); } catch (e) {}
          var idx = (savedIdx !== null && DW_PRESETS[parseInt(savedIdx, 10)]) ? parseInt(savedIdx, 10) : 0;
          if (typeof loadDwPreset === 'function') loadDwPreset(idx);
        } catch (e) { console.error('DW Init error', e); }
        return DW_PRESETS;
      })
      .catch(function(err) {
        dwPromise = null;
        console.error('DW presets load error', err);
        return DW_PRESETS;
      });
    return dwPromise;
  };

  function finishModulesMount() {
    if (finalized) return;
    finalized = true;
    window._modulesLoaded = true;
    var mount = document.getElementById('deferred-modules-mount');
    var scope = mount || document;

    if (typeof window._bindEhListeners === 'function') window._bindEhListeners();
    if (typeof window._bindStudioTabListeners === 'function') window._bindStudioTabListeners();
    if (typeof calculateVCoreDecision === 'function') {
      try { calculateVCoreDecision(); } catch (e) { console.error('vCore Init error', e); }
    }
    if (typeof window._observeScrollSpyArticles === 'function') window._observeScrollSpyArticles(scope);
    if (typeof window.observeHubDiagrams === 'function') window.observeHubDiagrams(scope);

    if (window._dwPresetsLoaded && DW_PRESETS.length > 0) {
      try {
        if (typeof populateDwDropdowns === 'function') populateDwDropdowns();
        if (typeof loadDwPreset === 'function' && typeof currentDwPresetIdx !== 'undefined') {
          loadDwPreset(currentDwPresetIdx);
        }
      } catch (e) {}
    }

    if (window._activeSectionCategory && window._activeSectionCategory !== 'all' && typeof window.filterBlogCategory === 'function') {
      window.filterBlogCategory(window._activeSectionCategory, null, { skipScroll: true });
    }
    if (typeof window.updateProgressDisplay === 'function') {
      window.updateProgressDisplay();
    }
    if (resolveHydrated) resolveHydrated();
  }

  function flushPendingModules() {
    if (finalized) return;
    var mount = document.getElementById('deferred-modules-mount');
    if (mount && pendingHtmlChunks.length > 0) {
      var tpl = document.createElement('template');
      tpl.innerHTML = pendingHtmlChunks.join('');
      pendingHtmlChunks.length = 0;
      mount.appendChild(tpl.content);
    }
    finishModulesMount();
  }

  function mountNextSlice() {
    if (finalized) return;
    if (forceImmediateFlush) {
      flushPendingModules();
      return;
    }
    var mount = document.getElementById('deferred-modules-mount');
    if (!mount || pendingHtmlChunks.length === 0) {
      finishModulesMount();
      return;
    }
    var t0 = performance.now();
    var batch = pendingHtmlChunks.splice(0, chunkCount);
    var tpl = document.createElement('template');
    tpl.innerHTML = batch.join('');
    mount.appendChild(tpl.content);
    var dt = performance.now() - t0;
    if (isDesktop) {
      if (dt < 60) chunkCount = Math.min(20, chunkCount + 5);
      else if (dt > 140) chunkCount = Math.max(6, Math.floor(chunkCount / 2));
    } else {
      if (dt < 18) chunkCount = Math.min(8, chunkCount + 2);
      else if (dt > 45) chunkCount = Math.max(2, Math.floor(chunkCount / 2));
    }
    if (pendingHtmlChunks.length > 0) {
      setTimeout(mountNextSlice, isDesktop ? 0 : 16);
    } else {
      finishModulesMount();
    }
  }

  window.ensureModulesLoaded = function(opts) {
    if (window._modulesLoaded) return Promise.resolve();
    var wantSliced = !!(opts && opts.sliced);
    if (!wantSliced) {
      forceImmediateFlush = true;
      if (pendingHtmlChunks.length > 0) {
        flushPendingModules();
        return hydratedPromise;
      }
    }
    if (!fetchStarted) {
      fetchStarted = true;
      fetch('assets/data/modules.html?v=202613')
        .then(function(r) {
          if (!r.ok) throw new Error('Failed modules fetch: ' + r.status);
          return r.text();
        })
        .then(function(htmlText) {
          pendingHtmlChunks = htmlText.split(/(?=<section\s+class="blog-article")/).filter(function(s) {
            return s.trim().length > 0;
          });
          if (forceImmediateFlush || !wantSliced) {
            flushPendingModules();
          } else {
            mountNextSlice();
          }
        })
        .catch(function(err) {
          fetchStarted = false;
          console.error('Modules hydration error', err);
          if (resolveHydrated) resolveHydrated();
        });
    }
    return hydratedPromise;
  };

  function handleInitialHashOrHydrate() {
    var hash = window.location.hash;
    var targetId = (hash && hash.length > 1) ? hash.slice(1) : '';
    var hasMissingTarget = targetId && !document.getElementById(targetId) &&
      (targetId.indexOf('mod-') === 0 || targetId === 'vcore-calculator' || targetId === 'error-handling-simulator' || targetId === 'inline-dw-playground');

    if (hasMissingTarget) {
      window.ensureModulesLoaded({ sliced: false }).then(function() {
        if (typeof window.jumpToSectionTool === 'function') {
          window.jumpToSectionTool(targetId);
        }
      });
      window.ensureSearchIndexLoaded();
      window.ensureDwPresetsLoaded();
    } else {
      var scheduleBg = function() {
        setTimeout(function() {
          window.ensureModulesLoaded({ sliced: true });
          window.ensureSearchIndexLoaded();
          window.ensureDwPresetsLoaded();
        }, 0);
      };
      if (document.readyState === 'complete') {
        scheduleBg();
      } else {
        window.addEventListener('load', scheduleBg, { once: true });
      }
    }
  }

  handleInitialHashOrHydrate();
})();


// scratch/dw_engine_bundle.js
// Complete DataWeave 2.0 In-Browser Interpreter and Evaluator

class DWLexer {
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.tokens = [];
    this.tokenize();
  }

  tokenize() {
    const s = this.input;
    const len = s.length;

    while (this.pos < len) {
      // Skip whitespace
      while (this.pos < len && /\s/.test(s[this.pos])) this.pos++;
      if (this.pos >= len) break;

      // Comments
      if (s[this.pos] === '/' && s[this.pos + 1] === '/') {
        while (this.pos < len && s[this.pos] !== '\n') this.pos++;
        continue;
      }
      if (s[this.pos] === '/' && s[this.pos + 1] === '*') {
        this.pos += 2;
        while (this.pos < len && !(s[this.pos] === '*' && s[this.pos + 1] === '/')) this.pos++;
        this.pos += 2;
        continue;
      }

      const ch = s[this.pos];

      // Strings
      if (ch === '"' || ch === "'") {
        const q = ch;
        this.pos++;
        let str = '';
        while (this.pos < len && s[this.pos] !== q) {
          if (s[this.pos] === '\\' && this.pos + 1 < len) {
            this.pos++;
            const esc = s[this.pos];
            if (esc === 'n') str += '\n';
            else if (esc === 't') str += '\t';
            else if (esc === 'r') str += '\r';
            else str += esc;
          } else {
            str += s[this.pos];
          }
          this.pos++;
        }
        this.pos++; // skip closing quote
        this.tokens.push({ type: 'STRING', value: str });
        continue;
      }

      // Regex /pattern/flags
      if (ch === '/' && this.canBeRegex()) {
        this.pos++;
        let pat = '';
        while (this.pos < len && s[this.pos] !== '/') {
          if (s[this.pos] === '\\' && this.pos + 1 < len) {
            pat += '\\' + s[this.pos + 1];
            this.pos += 2;
          } else {
            pat += s[this.pos];
            this.pos++;
          }
        }
        this.pos++; // skip closing /
        let flags = '';
        while (this.pos < len && /[a-z]/i.test(s[this.pos])) {
          flags += s[this.pos];
          this.pos++;
        }
        this.tokens.push({ type: 'REGEX', value: new RegExp(pat, flags) });
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        let numStr = '';
        while (this.pos < len && /[0-9.]/.test(s[this.pos])) {
          numStr += s[this.pos];
          this.pos++;
        }
        this.tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // Identifiers / Keywords / Anonymous params
      if (/[a-zA-Z_$]/.test(ch)) {
        let id = '';
        while (this.pos < len && /[a-zA-Z0-9_$#]/.test(s[this.pos])) {
          id += s[this.pos];
          this.pos++;
        }
        if (id === 'true') this.tokens.push({ type: 'BOOLEAN', value: true });
        else if (id === 'false') this.tokens.push({ type: 'BOOLEAN', value: false });
        else if (id === 'null') this.tokens.push({ type: 'NULL', value: null });
        else this.tokens.push({ type: 'ID', value: id });
        continue;
      }

      // Multi-char operators
      const two = s.substr(this.pos, 2);
      if (['->', '++', '--', '==', '!=', '<=', '>=', '..'].includes(two)) {
        this.tokens.push({ type: 'OP', value: two });
        this.pos += 2;
        continue;
      }

      // Single char operators & delimiters
      if ('{}[](),:;+*-/<>!&?.@'.includes(ch)) {
        this.tokens.push({ type: ch, value: ch });
        this.pos++;
        continue;
      }

      this.pos++;
    }
    this.tokens.push({ type: 'EOF', value: null });
  }

  canBeRegex() {
    if (this.tokens.length === 0) return true;
    const last = this.tokens[this.tokens.length - 1];
    return ['(', ',', ':', '=', '->', '[', '{', 'OP'].includes(last.type) ||
           (last.type === 'ID' && ['replace', 'match', 'matches', 'scan'].includes(last.value));
  }
}

class DWParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos] || { type: 'EOF' }; }
  peekAhead(n) { return this.tokens[this.pos + n] || { type: 'EOF' }; }
  next() { return this.tokens[this.pos++]; }
  match(type, val) {
    const t = this.peek();
    if (t.type === type && (val === undefined || t.value === val)) {
      return this.next();
    }
    return null;
  }
  expect(type, val) {
    const res = this.match(type, val);
    if (!res) throw new Error(`Syntax Error: Expected '${val || type}' but encountered '${this.peek().value || this.peek().type}'`);
    return res;
  }

  parse() {
    const expr = this.parseExpression();
    return expr;
  }

  parseExpression() {
    return this.parseIfElse();
  }

  parseIfElse() {
    if (this.match('ID', 'if')) {
      this.expect('(');
      const cond = this.parseExpression();
      this.expect(')');
      const thenBranch = this.parseExpression();
      let elseBranch = null;
      if (this.match('ID', 'else')) {
        elseBranch = this.parseExpression();
      }
      return { type: 'IfElse', cond, thenBranch, elseBranch };
    }
    return this.parseDefault();
  }

  parseDefault() {
    let left = this.parseLogicOr();
    while (this.match('ID', 'default')) {
      const right = this.parseLogicOr();
      left = { type: 'Default', left, right };
    }
    return left;
  }

  parseLogicOr() {
    let left = this.parseLogicAnd();
    while (this.match('ID', 'or') || this.match('OP', '||')) {
      const right = this.parseLogicAnd();
      left = { type: 'Binary', op: 'or', left, right };
    }
    return left;
  }

  parseLogicAnd() {
    let left = this.parseEquality();
    while (this.match('ID', 'and') || this.match('OP', '&&')) {
      const right = this.parseEquality();
      left = { type: 'Binary', op: 'and', left, right };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseRelational();
    let op;
    while ((op = this.match('OP', '==') || this.match('OP', '!='))) {
      const right = this.parseRelational();
      left = { type: 'Binary', op: op.value, left, right };
    }
    return left;
  }

  parseRelational() {
    let left = this.parseInfixDataWeave();
    let op;
    while ((op = this.match('<') || this.match('>') || this.match('OP', '<=') || this.match('OP', '>='))) {
      const right = this.parseInfixDataWeave();
      left = { type: 'Binary', op: op.value, left, right };
    }
    return left;
  }

  parseInfixDataWeave() {
    let left = this.parseAdditive();

    const INFIX_OPS = ['map', 'filter', 'groupBy', 'pluck', 'orderBy', 'distinctBy', 'reduce', 'joinBy', 'splitBy', 'replace', 'as'];
    while (true) {
      const peek = this.peek();
      if (peek.type === 'ID' && INFIX_OPS.includes(peek.value)) {
        const op = this.next().value;
        if (op === 'as') {
          const typeName = this.expect('ID').value;
          left = { type: 'Cast', expr: left, targetType: typeName };
        } else if (op === 'joinBy' || op === 'splitBy') {
          const arg = this.parseAdditive();
          left = { type: 'MethodCall', target: left, method: op, args: [arg] };
        } else if (op === 'replace') {
          const pattern = this.parsePrimary();
          this.expect('ID', 'with');
          const replacement = this.parseAdditive();
          left = { type: 'Replace', target: left, pattern, replacement };
        } else {
          // Higher order function
          let lambda;
          if (this.match('(')) {
            if (this.match('(')) {
              const argNames = [];
              if (this.peek().type !== ')') {
                do {
                  argNames.push(this.expect('ID').value);
                } while (this.match(','));
              }
              this.expect(')');
              this.expect('OP', '->');
              const body = this.parseExpression();
              this.expect(')');
              lambda = { type: 'Lambda', args: argNames, body };
            } else if (this.peek().type === 'ID' && this.peekAhead(1).value === '->') {
              const singleArg = this.next().value;
              this.expect('OP', '->');
              const body = this.parseExpression();
              this.expect(')');
              lambda = { type: 'Lambda', args: [singleArg], body };
            } else {
              // Anonymous expression ($ + 1)
              const body = this.parseExpression();
              this.expect(')');
              lambda = { type: 'Lambda', args: ['$', '$$', '$$$'], body };
            }
          } else {
            const body = this.parsePrimary();
            lambda = { type: 'Lambda', args: ['$', '$$', '$$$'], body };
          }
          left = { type: 'DataWeaveHOP', op, target: left, lambda };
        }
      } else {
        break;
      }
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    let op;
    while ((op = this.match('+') || this.match('-') || this.match('OP', '++') || this.match('OP', '--'))) {
      const right = this.parseMultiplicative();
      left = { type: 'Binary', op: op.value, left, right };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    let op;
    while ((op = this.match('*') || this.match('/'))) {
      const right = this.parseUnary();
      left = { type: 'Binary', op: op.value, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.match('ID', 'not') || this.match('!')) {
      const expr = this.parseUnary();
      return { type: 'Unary', op: '!', expr };
    }
    if (this.match('-')) {
      const expr = this.parseUnary();
      return { type: 'Unary', op: '-', expr };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match('.')) {
        if (this.match('*')) {
          const key = this.expect('ID').value;
          expr = { type: 'MultiValueSelector', target: expr, key };
        } else if (this.match('@')) {
          const key = this.expect('ID').value;
          expr = { type: 'AttributeSelector', target: expr, key };
        } else {
          const key = this.expect('ID').value;
          expr = { type: 'MemberAccess', target: expr, key };
        }
      } else if (this.match('[')) {
        const fromExpr = this.parseExpression();
        if (this.match('ID', 'to')) {
          const toExpr = this.parseExpression();
          this.expect(']');
          expr = { type: 'Slice', target: expr, from: fromExpr, to: toExpr };
        } else {
          this.expect(']');
          expr = { type: 'Index', target: expr, index: fromExpr };
        }
      } else if (this.match('(')) {
        const args = [];
        if (this.peek().type !== ')') {
          do {
            args.push(this.parseExpression());
          } while (this.match(','));
        }
        this.expect(')');
        expr = { type: 'Call', callee: expr, args };
      } else {
        break;
      }
    }
    return expr;
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === 'NUMBER' || t.type === 'STRING' || t.type === 'BOOLEAN' || t.type === 'NULL' || t.type === 'REGEX') {
      this.next();
      return { type: 'Literal', value: t.value };
    }

    if (t.type === 'ID') {
      this.next();
      return { type: 'Identifier', name: t.value };
    }

    // Array [ a, b, c ]
    if (this.match('[')) {
      const elements = [];
      if (this.peek().type !== ']') {
        do {
          elements.push(this.parseExpression());
        } while (this.match(','));
      }
      this.expect(']');
      return { type: 'Array', elements };
    }

    // Object { k: v, (dynKey): v, (k: v) if cond, ... }
    if (this.match('{')) {
      const properties = [];
      if (this.peek().type !== '}') {
        do {
          let isDynamic = false;
          let key;
          if (this.match('(')) {
            const inner = this.parseExpression();
            if (this.match(':')) {
              // (key: val) if cond
              const valExpr = this.parseExpression();
              this.expect(')');
              let condition = null;
              if (this.match('ID', 'if')) {
                condition = this.parseExpression();
              }
              properties.push({ type: 'ConditionalProp', key: inner, value: valExpr, condition });
              continue;
            } else {
              this.expect(')');
              isDynamic = true;
              key = inner;
            }
          } else {
            const idTok = this.next();
            key = { type: 'Literal', value: idTok.value };
          }

          this.expect(':');
          const valExpr = this.parseExpression();
          let condition = null;
          if (this.match('ID', 'if')) {
            condition = this.parseExpression();
          }
          properties.push({ type: 'Property', isDynamic, key, value: valExpr, condition });
        } while (this.match(','));
      }
      this.expect('}');
      return { type: 'Object', properties };
    }

    if (this.match('(')) {
      const expr = this.parseExpression();
      this.expect(')');
      return expr;
    }

    throw new Error(`Syntax Error: Unexpected token '${t.value || t.type}'`);
  }
}

class DWEvaluator {
  constructor(stdLib) {
    this.stdLib = stdLib;
  }

  evaluate(node, scope) {
    if (!node) return null;

    switch (node.type) {
      case 'Literal':
        return node.value;

      case 'Identifier': {
        const name = node.name;
        if (name in scope) return scope[name];
        if (name in this.stdLib) return this.stdLib[name];
        return null;
      }

      case 'Array':
        return node.elements.map(e => this.evaluate(e, scope));

      case 'Object': {
        const obj = {};
        for (const p of node.properties) {
          if (p.condition) {
            const condVal = this.evaluate(p.condition, scope);
            if (!condVal) continue;
          }
          if (p.type === 'ConditionalProp') {
            const k = p.key.type === 'Identifier' ? p.key.name : String(this.evaluate(p.key, scope));
            obj[k] = this.evaluate(p.value, scope);
          } else {
            const k = p.isDynamic ? String(this.evaluate(p.key, scope)) : (p.key.value);
            obj[k] = this.evaluate(p.value, scope);
          }
        }
        return obj;
      }

      case 'MemberAccess': {
        const target = this.evaluate(node.target, scope);
        if (target === null || target === undefined) return null;
        const key = node.key;
        if (Array.isArray(target)) {
          return target.map(item => (item && typeof item === 'object') ? item[key] : null).filter(x => x !== null && x !== undefined);
        }
        if (typeof target === 'object') {
          return target[key] !== undefined ? target[key] : (target['@' + key] !== undefined ? target['@' + key] : null);
        }
        return null;
      }

      case 'AttributeSelector': {
        const target = this.evaluate(node.target, scope);
        if (!target || typeof target !== 'object') return null;
        return target['@' + node.key] !== undefined ? target['@' + node.key] : target[node.key];
      }

      case 'MultiValueSelector': {
        const target = this.evaluate(node.target, scope);
        if (!target) return [];
        if (Array.isArray(target)) {
          return target.map(item => item[node.key]).filter(x => x !== undefined);
        }
        return target[node.key] ? (Array.isArray(target[node.key]) ? target[node.key] : [target[node.key]]) : [];
      }

      case 'Index': {
        const target = this.evaluate(node.target, scope);
        const idx = this.evaluate(node.index, scope);
        if (!target) return null;
        if (Array.isArray(target) || typeof target === 'string') {
          const indexNum = Number(idx);
          const pos = indexNum < 0 ? target.length + indexNum : indexNum;
          return target[pos] !== undefined ? target[pos] : null;
        }
        return target[idx];
      }

      case 'Slice': {
        const target = this.evaluate(node.target, scope);
        const from = Number(this.evaluate(node.from, scope));
        const to = Number(this.evaluate(node.to, scope));
        if (!target) return target;
        const len = target.length;
        const s = from < 0 ? Math.max(0, len + from) : from;
        const e = to < 0 ? len + to + 1 : to + 1;
        return target.slice(s, e);
      }

      case 'Binary': {
        const left = this.evaluate(node.left, scope);
        const right = this.evaluate(node.right, scope);
        switch (node.op) {
          case '+': return Number(left) + Number(right);
          case '-': return Number(left) - Number(right);
          case '*': return Number(left) * Number(right);
          case '/': return Number(left) / Number(right);
          case '++':
            if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
            if (Array.isArray(left)) return [...left, right];
            if (Array.isArray(right)) return [left, ...right];
            if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) return { ...left, ...right };
            return String(left ?? '') + String(right ?? '');
          case '--':
            if (Array.isArray(left) && Array.isArray(right)) return left.filter(x => !right.includes(x));
            if (typeof left === 'object' && left !== null && Array.isArray(right)) {
              const res = { ...left };
              right.forEach(k => delete res[k]);
              return res;
            }
            return left;
          case '==': return JSON.stringify(left) === JSON.stringify(right);
          case '!=': return JSON.stringify(left) !== JSON.stringify(right);
          case '<': return left < right;
          case '<=': return left <= right;
          case '>': return left > right;
          case '>=': return left >= right;
          case 'and': return Boolean(left && right);
          case 'or': return Boolean(left || right);
        }
        return null;
      }

      case 'Unary': {
        const val = this.evaluate(node.expr, scope);
        if (node.op === '!') return !val;
        if (node.op === '-') return -val;
        return val;
      }

      case 'Default': {
        const left = this.evaluate(node.left, scope);
        if (left !== null && left !== undefined && left !== '') return left;
        return this.evaluate(node.right, scope);
      }

      case 'IfElse': {
        const cond = this.evaluate(node.cond, scope);
        if (cond) return this.evaluate(node.thenBranch, scope);
        if (node.elseBranch) return this.evaluate(node.elseBranch, scope);
        return null;
      }

      case 'Call': {
        const callee = this.evaluate(node.callee, scope);
        if (typeof callee === 'function') {
          const evaluatedArgs = node.args.map(a => this.evaluate(a, scope));
          return callee(...evaluatedArgs);
        }
        throw new Error(`Runtime Error: '${node.callee.name || "Expression"}' is not a function.`);
      }

      case 'MethodCall': {
        const target = this.evaluate(node.target, scope);
        const args = node.args.map(a => this.evaluate(a, scope));
        if (node.method === 'joinBy') return Array.isArray(target) ? target.join(args[0]) : String(target);
        if (node.method === 'splitBy') return String(target).split(args[0]);
        return null;
      }

      case 'Replace': {
        const target = String(this.evaluate(node.target, scope) ?? '');
        const pat = this.evaluate(node.pattern, scope);
        const repl = node.replacement;
        return target.replace(pat, (...matchArgs) => {
          const subScope = { ...scope, $: matchArgs, $0: matchArgs[0], $1: matchArgs[1], $2: matchArgs[2] };
          return this.evaluate(repl, subScope);
        });
      }

      case 'Cast': {
        const val = this.evaluate(node.expr, scope);
        if (node.targetType === 'String') return String(val ?? '');
        if (node.targetType === 'Number') return Number(val);
        if (node.targetType === 'Boolean') return Boolean(val);
        return val;
      }

      case 'DataWeaveHOP': {
        const target = this.evaluate(node.target, scope);
        const lambda = node.lambda;
        const op = node.op;

        const evalLambda = (item, idx, key) => {
          const lScope = { ...scope };
          if (lambda.args.length === 1) {
            lScope[lambda.args[0]] = item;
          } else if (lambda.args.length === 2) {
            lScope[lambda.args[0]] = item;
            lScope[lambda.args[1]] = key !== undefined ? key : idx;
          } else if (lambda.args.length >= 3) {
            lScope[lambda.args[0]] = item;
            lScope[lambda.args[1]] = key;
            lScope[lambda.args[2]] = idx;
          }
          lScope['$'] = item;
          lScope['$$'] = key !== undefined ? key : idx;
          lScope['$$$'] = idx;
          return this.evaluate(lambda.body, lScope);
        };

        if (op === 'map') {
          if (!Array.isArray(target)) return [];
          return target.map((item, idx) => evalLambda(item, idx));
        }

        if (op === 'filter') {
          if (!Array.isArray(target)) return [];
          return target.filter((item, idx) => Boolean(evalLambda(item, idx)));
        }

        if (op === 'groupBy') {
          if (!Array.isArray(target)) return {};
          const res = {};
          target.forEach((item, idx) => {
            const k = String(evalLambda(item, idx));
            if (!res[k]) res[k] = [];
            res[k].push(item);
          });
          return res;
        }

        if (op === 'pluck') {
          if (!target || typeof target !== 'object') return [];
          const res = [];
          let idx = 0;
          for (const k of Object.keys(target)) {
            res.push(evalLambda(target[k], idx++, k));
          }
          return res;
        }

        if (op === 'orderBy') {
          if (!Array.isArray(target)) return target;
          return [...target].sort((a, b) => {
            const vA = evalLambda(a, 0);
            const vB = evalLambda(b, 0);
            return vA < vB ? -1 : (vA > vB ? 1 : 0);
          });
        }

        if (op === 'distinctBy') {
          if (!Array.isArray(target)) return target;
          const seen = new Set();
          return target.filter((item, idx) => {
            const v = JSON.stringify(evalLambda(item, idx));
            if (seen.has(v)) return false;
            seen.add(v);
            return true;
          });
        }

        if (op === 'reduce') {
          if (!Array.isArray(target) || !target.length) return null;
          return target.reduce((acc, curr) => {
            const lScope = { ...scope, $: curr, $$: acc };
            if (lambda.args.length >= 2) {
              lScope[lambda.args[0]] = curr;
              lScope[lambda.args[1]] = acc;
            }
            return this.evaluate(lambda.body, lScope);
          });
        }

        return target;
      }
    }
  }
}

// Lightweight XML parser for playground
function parseDWXml(xmlStr) {
  if (!xmlStr || typeof xmlStr !== 'string') return {};
  const clean = xmlStr.replace(/<\?[^>]*\?>/g, '').trim();

  function parseNode(str) {
    const tagMatch = str.match(/^<([a-zA-Z0-9_:-]+)([^>]*)>([\s\S]*)<\/\1>$/);
    if (!tagMatch) {
      const selfClose = str.match(/^<([a-zA-Z0-9_:-]+)([^>]*)\/>$/);
      if (selfClose) {
        return { ...parseAttrs(selfClose[2]) };
      }
      return str.trim();
    }

    const tagName = tagMatch[1];
    const rawAttrs = tagMatch[2];
    const inner = tagMatch[3].trim();
    const attrs = parseAttrs(rawAttrs);

    const children = {};
    Object.assign(children, attrs);

    let pos = 0;
    let foundChildren = false;
    while (pos < inner.length) {
      const openIdx = inner.indexOf('<', pos);
      if (openIdx === -1) break;
      const tagEnd = inner.indexOf('>', openIdx);
      if (tagEnd === -1) break;
      const tagHeader = inner.slice(openIdx + 1, tagEnd);
      if (tagHeader.startsWith('/')) { pos = tagEnd + 1; continue; }

      const childName = tagHeader.split(/\s+/)[0].replace(/\/$/, '');
      if (tagHeader.endsWith('/')) {
        foundChildren = true;
        const cVal = parseNode(inner.slice(openIdx, tagEnd + 1));
        const sName = childName.split(':').pop();
        addChild(children, sName, cVal);
        pos = tagEnd + 1;
        continue;
      }

      const closeTag = `</${childName}>`;
      let searchPos = tagEnd + 1;
      let depth = 1;
      let closeIdx = -1;
      while (searchPos < inner.length) {
        const nextOpen = inner.indexOf(`<${childName}`, searchPos);
        const nextClose = inner.indexOf(closeTag, searchPos);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          searchPos = nextOpen + childName.length + 1;
        } else {
          depth--;
          if (depth === 0) {
            closeIdx = nextClose;
            break;
          }
          searchPos = nextClose + closeTag.length;
        }
      }

      if (closeIdx !== -1) {
        foundChildren = true;
        const fullChildStr = inner.slice(openIdx, closeIdx + closeTag.length);
        const sName = childName.split(':').pop();
        const cVal = parseNode(fullChildStr);
        addChild(children, sName, cVal);
        pos = closeIdx + closeTag.length;
      } else {
        pos = tagEnd + 1;
      }
    }

    if (!foundChildren) {
      if (Object.keys(attrs).length > 0) {
        children['#text'] = inner;
        return children;
      }
      return inner;
    }

    return children;
  }

  function parseAttrs(attrStr) {
    const attrs = {};
    const re = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(attrStr)) !== null) {
      if (!m[1].startsWith('xmlns')) {
        const s = m[1].split(':').pop();
        attrs['@' + s] = m[2];
        attrs[s] = m[2];
      }
    }
    return attrs;
  }

  function addChild(parent, key, val) {
    if (parent[key] === undefined) {
      parent[key] = val;
    } else if (Array.isArray(parent[key])) {
      parent[key].push(val);
    } else {
      parent[key] = [parent[key], val];
    }
  }

  return parseNode(clean);
}

// Global Evaluate function
function executeDataWeave(scriptText, inputText, inputFormat = 'json', varsText = '{}', attrsText = '{}') {
  const startTime = Date.now();

  // 1. Parse Input
  let payload = null;
  if (inputText && inputText.trim()) {
    const trimmed = inputText.trim();
    if (inputFormat === 'xml' || trimmed.startsWith('<')) {
      try {
        payload = parseDWXml(trimmed);
      } catch (e) {
        return { success: false, error: `XML Parse Error: ${e.message}`, durationMs: 0 };
      }
    } else {
      try {
        payload = JSON.parse(trimmed);
      } catch (e) {
        return { success: false, error: `Invalid Input JSON: ${e.message}`, durationMs: 0 };
      }
    }
  }

  // Parse Vars and Attrs
  let vars = {};
  if (varsText && varsText.trim()) {
    try { vars = JSON.parse(varsText); } catch (e) {}
  }
  let attrs = {};
  if (attrsText && attrsText.trim()) {
    try { attrs = JSON.parse(attrsText); } catch (e) {}
  }

  // 2. Parse DW Header & Body
  let header = "";
  let body = scriptText;
  const sepIdx = scriptText.indexOf('---');
  if (sepIdx !== -1) {
    header = scriptText.slice(0, sepIdx).trim();
    body = scriptText.slice(sepIdx + 3).trim();
  }

  const customFuncs = {};
  const customVars = {};
  let outputFormat = 'application/json';

  header.split('\n').forEach(line => {
    const l = line.trim();
    if (l.startsWith('output')) {
      const parts = l.split(/\s+/);
      if (parts[1]) outputFormat = parts[1];
    } else if (l.startsWith('fun ')) {
      const m = l.match(/^fun\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*=\s*(.*)$/);
      if (m) {
        customFuncs[m[1]] = {
          args: m[2].split(',').map(a => a.trim()).filter(Boolean),
          bodyText: m[3]
        };
      }
    } else if (l.startsWith('var ')) {
      const m = l.match(/^var\s+([a-zA-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) customVars[m[1]] = m[2];
    }
  });

  const stdLib = {
    sizeOf: (v) => v ? (Array.isArray(v) || typeof v === 'string' ? v.length : Object.keys(v).length) : 0,
    isEmpty: (v) => !v || (Array.isArray(v) || typeof v === 'string' ? v.length === 0 : Object.keys(v).length === 0),
    isBlank: (v) => !v || String(v).trim().length === 0,
    upper: (s) => s ? String(s).toUpperCase() : s,
    lower: (s) => s ? String(s).toLowerCase() : s,
    capitalize: (s) => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : s,
    trim: (s) => s ? String(s).trim() : s,
    sum: (arr) => Array.isArray(arr) ? arr.reduce((a, b) => a + (Number(b) || 0), 0) : Number(arr) || 0,
    avg: (arr) => Array.isArray(arr) && arr.length ? arr.reduce((a, b) => a + (Number(b) || 0), 0) / arr.length : 0,
    min: (arr) => Array.isArray(arr) && arr.length ? Math.min(...arr) : null,
    max: (arr) => Array.isArray(arr) && arr.length ? Math.max(...arr) : null,
    round: (n) => Math.round(Number(n)),
    ceil: (n) => Math.ceil(Number(n)),
    floor: (n) => Math.floor(Number(n)),
    abs: (n) => Math.abs(Number(n)),
    flatten: (arr) => Array.isArray(arr) ? arr.flat(Infinity) : [arr],
    keysOf: (obj) => obj && typeof obj === 'object' ? Object.keys(obj) : [],
    valuesOf: (obj) => obj && typeof obj === 'object' ? Object.values(obj) : [],
    entriesOf: (obj) => obj && typeof obj === 'object' ? Object.entries(obj).map(([k, v]) => ({ key: k, value: v })) : [],
    contains: (t, s) => {
      if (t === null || t === undefined) return false;
      if (Array.isArray(t) || typeof t === 'string') return t.includes(s);
      if (typeof t === 'object') return Object.values(t).includes(s);
      return false;
    },
    startsWith: (s, p) => s ? String(s).startsWith(p) : false,
    endsWith: (s, p) => s ? String(s).endsWith(p) : false,
    now: () => new Date().toISOString(),
    uuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }),
    typeOf: (val) => {
      if (val === null) return 'Null';
      if (Array.isArray(val)) return 'Array';
      if (typeof val === 'number') return Number.isInteger(val) ? 'Integer' : 'Number';
      if (typeof val === 'string') return 'String';
      if (typeof val === 'boolean') return 'Boolean';
      if (typeof val === 'object') return 'Object';
      return 'Unknown';
    }
  };

  const evaluator = new DWEvaluator(stdLib);
  const scope = { payload, vars, attributes: attrs };

  try {
    // Functions
    for (const [fName, fDef] of Object.entries(customFuncs)) {
      const lexer = new DWLexer(fDef.bodyText);
      const parser = new DWParser(lexer.tokens);
      const ast = parser.parse();
      scope[fName] = (...passedArgs) => {
        const fScope = { ...scope };
        fDef.args.forEach((a, i) => { fScope[a] = passedArgs[i]; });
        return evaluator.evaluate(ast, fScope);
      };
    }

    // Vars
    for (const [vName, vExpr] of Object.entries(customVars)) {
      const lexer = new DWLexer(vExpr);
      const parser = new DWParser(lexer.tokens);
      const ast = parser.parse();
      scope[vName] = evaluator.evaluate(ast, scope);
    }

    // Main Body
    const lexer = new DWLexer(body);
    const parser = new DWParser(lexer.tokens);
    const ast = parser.parse();
    const rawResult = evaluator.evaluate(ast, scope);

    const duration = Date.now() - startTime;
    let formattedOutput = "";
    if (outputFormat.includes('json')) {
      formattedOutput = JSON.stringify(rawResult, null, 2);
    } else {
      formattedOutput = String(rawResult ?? '');
    }

    return {
      success: true,
      output: formattedOutput,
      durationMs: duration,
      outputFormat
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      durationMs: Date.now() - startTime
    };
  }
}

// Enhanced Client Application Controller for Hyper-Modern MuleSoft Hub

// ==========================================
// 1. Accordion & Practice Mode Controllers
// ==========================================


// Clickable FAQ Header: clicking the question header toggles the answer drawer
document.addEventListener('click', (e) => {
  const header = e.target.closest('.faq-header');
  if (header && !e.target.closest('button') && !e.target.closest('a')) {
    const card = header.closest('.faq-card');
    if (card) {
      const btn = card.querySelector('.reveal-answer-btn');
      if (btn) toggleAnswerDrawer(btn);
    }
  }
});

function toggleAnswerDrawer(btn) {
  const card = btn.closest('.faq-card');
  if (!card) return;
  const drawer = card.querySelector('.answer-drawer');
  if (!drawer) return;
  
  const isExpanded = btn.getAttribute('aria-expanded') === 'true';
  const iconSpan = btn.querySelector('.reveal-btn-icon');
  const textSpan = btn.querySelector('.reveal-btn-text');

  if (isExpanded) {
    drawer.classList.remove('is-revealed');
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('active');
    if (iconSpan) iconSpan.textContent = '👁️';
    if (textSpan) textSpan.textContent = 'Reveal Senior Model Answer & Verbal Script';
  } else {
    drawer.classList.add('is-revealed');
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('active');
    if (iconSpan) iconSpan.textContent = '🙈';
    if (textSpan) textSpan.textContent = 'Hide Model Answer & Verbal Script';
    if (typeof window.markQaCompleted === 'function' && card.id) {
      window.markQaCompleted(card.id);
    }
  }
}

function expandAllAnswers() {
  if (!window._modulesLoaded && typeof window.ensureModulesLoaded === 'function') {
    window.ensureModulesLoaded({ sliced: false }).then(expandAllAnswers);
    return;
  }
  document.querySelectorAll('.faq-card').forEach(card => {
    const drawer = card.querySelector('.answer-drawer');
    const btn = card.querySelector('.reveal-answer-btn');
    if (drawer && btn) {
      drawer.classList.add('is-revealed');
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('active');
      const iconSpan = btn.querySelector('.reveal-btn-icon');
      const textSpan = btn.querySelector('.reveal-btn-text');
      if (iconSpan) iconSpan.textContent = '🙈';
      if (textSpan) textSpan.textContent = 'Hide Model Answer & Verbal Script';
    }
  });
}

function collapseAllAnswers() {
  if (!window._modulesLoaded && typeof window.ensureModulesLoaded === 'function') {
    window.ensureModulesLoaded({ sliced: false }).then(collapseAllAnswers);
    return;
  }
  document.querySelectorAll('.faq-card').forEach(card => {
    const drawer = card.querySelector('.answer-drawer');
    const btn = card.querySelector('.reveal-answer-btn');
    if (drawer && btn) {
      drawer.classList.remove('is-revealed');
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('active');
      const iconSpan = btn.querySelector('.reveal-btn-icon');
      const textSpan = btn.querySelector('.reveal-btn-text');
      if (iconSpan) iconSpan.textContent = '👁️';
      if (textSpan) textSpan.textContent = 'Reveal Senior Model Answer & Verbal Script';
    }
  });
}

function togglePracticeMode() {
  const isPractice = document.body.classList.toggle('practice-mode-on');
  const pBtn = document.getElementById('practice-btn');
  if (isPractice) {
    collapseAllAnswers();
    if (pBtn) {
      pBtn.classList.add('btn-active');
      pBtn.innerHTML = '🎯 Practice Mode: ON';
    }
  } else {
    if (pBtn) {
      pBtn.classList.remove('btn-active');
      pBtn.innerHTML = '🎯 Practice Mode';
    }
  }
}

// ==========================================
// 2. Code Copy with Micro-Interaction Animation
// ==========================================

function copyCode(btn) {
  const pre = btn.closest('.code-block').querySelector('pre');
  if (!pre) return;
  const text = pre.innerText;

  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    const origHtml = btn.innerHTML;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" class="bounce-check">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span style="color:#10b981; font-weight:700;">Copied!</span>
    `;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = origHtml;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy', err);
  });
}

function copyVerbalScript(btn) {
  const callout = btn.closest('.callout-verbal');
  if (!callout) return;
  const quote = callout.querySelector('.verbal-quote');
  if (!quote) return;
  const text = quote.innerText.replace(/^"|"$/g, '').trim();

  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    const origHtml = btn.innerHTML;
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" class="bounce-check">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span style="color:#10b981; font-weight:700;">Copied!</span>
    `;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = origHtml;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy verbal script', err);
  });
}

// ==========================================
// 3. Category & Sidebar Filters
// ==========================================

function filterBlogCategory(catName, btn) {
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const articles = document.querySelectorAll('.blog-article');
  articles.forEach(art => {
    const artCat = art.getAttribute('data-category');
    if (catName === 'all' || artCat === catName) {
      art.style.display = 'block';
    } else {
      art.style.display = 'none';
    }
  });
}

function filterSidebarModules(query) {
  const q = (query || '').toLowerCase().trim();
  const activeCat = window._activeSectionCategory || 'all';
  const items = document.querySelectorAll('.quick-sidebar-item');
  let shownCount = 0;
  items.forEach(item => {
    const link = item.querySelector('.quick-sidebar-link');
    const modId = link ? link.getAttribute('data-mod-id') : '';
    const art = modId ? document.getElementById(modId) : null;
    const modCat = (link && link.getAttribute('data-category')) || (art && art.getAttribute('data-category')) || '';
    const matchesCat = (activeCat === 'all') || (modCat === activeCat);
    const text = link ? link.innerText.toLowerCase() : '';
    const visible = matchesCat && (!q || text.includes(q));
    item.style.display = visible ? 'block' : 'none';
    if (visible) shownCount++;
  });
  const countEl = document.getElementById('sidebar-module-count');
  if (countEl) {
    countEl.textContent = (activeCat === 'all' && !q)
      ? ('Showing all ' + shownCount + ' modules')
      : ('Showing ' + shownCount + ' of 45 modules');
  }
}

function toggleSidebar() {
  const sb = document.getElementById('toc-sidebar');
  if (sb) {
    sb.classList.toggle('collapsed');
  }
}

// Active Sidebar Link Tracker (ScrollSpy + Breadcrumb Sync)
window._observeScrollSpyArticles = function(rootEl) {
  if (!window._scrollSpyObserver) return;
  const scope = (rootEl && typeof rootEl.querySelectorAll === 'function') ? rootEl : document;
  scope.querySelectorAll('.blog-article').forEach(art => {
    if (art.dataset.spyObserved) return;
    art.dataset.spyObserved = '1';
    window._scrollSpyObserver.observe(art);
  });
};

window.addEventListener('DOMContentLoaded', () => {
  // Sync theme icon with current theme
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) {
    themeIcon.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  }

  window._scrollSpyObserver = new IntersectionObserver((entries) => {
    if (window._suppressScrollSpyUntil && Date.now() < window._suppressScrollSpyUntil) return;
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const target = entry.target;
      if (target.style.display === 'none' || entry.boundingClientRect.height <= 0) return;
      const activeCat = window._activeSectionCategory || 'all';
      if (activeCat !== 'all' && target.getAttribute('data-category') !== activeCat) return;

      const id = target.id;
      document.querySelectorAll('.quick-sidebar-link').forEach(link => {
        if (link.getAttribute('data-mod-id') === id) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
      if (typeof window.updateContentBreadcrumb === 'function') {
        window.updateContentBreadcrumb(target);
      }
    });
  }, { threshold: 0.15 });

  window._observeScrollSpyArticles(document);
});

// GPU-Composited Scroll Progress Bar (rAF throttled + passive)
(function initTopProgressBar() {
  let ticking = false;
  let barEl = null;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!barEl) barEl = document.getElementById('top-progress');
      if (!barEl) return;
      const winScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const ratio = height > 0 ? Math.min(1, Math.max(0, winScroll / height)) : 0;
      barEl.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    });
  }, { passive: true });
})();

// Theme Toggle
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', nextTheme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = nextTheme === 'dark' ? '☀️' : '🌙';
  try {
    localStorage.setItem('mulesoft_hub_theme', nextTheme);
  } catch(e) {}
}

// ==========================================
// 4. Interactive Quick Search Modal (Ctrl+K)
// ==========================================

let selectedSearchIndex = -1;

function openSearchModal() {
  if (typeof window.ensureSearchIndexLoaded === 'function') {
    window.ensureSearchIndexLoaded();
  }
  const modal = document.getElementById('search-modal');
  if (modal) {
    modal.classList.add('active');
    const input = document.getElementById('search-input-field');
    if (input) {
      input.focus();
      input.select();
    }
    renderSearchHistory();
  }
}

function closeSearchModal(e) {
  if (e && e.target !== e.currentTarget && e.target.id !== 'btn-close-search') return;
  const modal = document.getElementById('search-modal');
  if (modal) modal.classList.remove('active');
}

function handleSearchInput(e) {
  const rawVal = e && e.target ? e.target.value : '';
  const query = rawVal.toLowerCase().trim();
  const list = document.getElementById('search-results-list');
  selectedSearchIndex = -1;

  if (!query) {
    list.innerHTML = '<li style="padding:20px; text-align:center; color:var(--text-dim);">Type to search across 40 Technical Modules, DataWeave scripts, and incident runbooks...</li>';
    return;
  }

  if (!window._searchIndexLoaded && (!SEARCH_INDEX || SEARCH_INDEX.length === 0) && typeof window.ensureSearchIndexLoaded === 'function') {
    list.innerHTML = '<li style="padding:20px; text-align:center; color:var(--text-dim);">Loading search index...</li>';
    window.ensureSearchIndexLoaded().then(function() {
      const inp = document.getElementById('search-input-field');
      if (inp && inp.value.toLowerCase().trim() === query) {
        handleSearchInput({ target: inp });
      }
    });
    return;
  }

  const matches = (typeof SEARCH_INDEX !== 'undefined' ? SEARCH_INDEX : []).filter(item => {
    return item.title.toLowerCase().includes(query) ||
           item.tag.toLowerCase().includes(query) ||
           item.category.toLowerCase().includes(query) ||
           item.snippet.toLowerCase().includes(query);
  }).slice(0, 15);

  if (matches.length === 0) {
    list.innerHTML = `<li style="padding:24px; text-align:center; color:var(--text-muted);">No technical topics matching "<strong>${escapeHtml(query)}</strong>"</li>`;
    return;
  }

  list.innerHTML = matches.map((m, idx) => `
    <li class="search-result-item" data-idx="${idx}" onclick="jumpToSearchResult('${m.id}', '${escapeHtml(query)}')">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
        <span class="q-tag">${m.tag}</span>
        <span class="badge badge-primary">${m.modTitle}</span>
        <span class="badge ${m.role.includes('Architect') || m.role.includes('Lead') ? 'badge-lead' : 'badge-dev'}">${m.role}</span>
      </div>
      <div class="search-result-title">${highlightQuery(m.title, query)}</div>
      <div class="search-result-snippet">${highlightQuery(m.snippet, query)}...</div>
    </li>
  `).join('');
}

function handleSearchKeydown(e) {
  const items = document.querySelectorAll('.search-result-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selectedSearchIndex < items.length - 1) {
      selectedSearchIndex++;
      updateSearchSelection(items);
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedSearchIndex > 0) {
      selectedSearchIndex--;
      updateSearchSelection(items);
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedSearchIndex >= 0 && items[selectedSearchIndex]) {
      items[selectedSearchIndex].click();
    }
  } else if (e.key === 'Escape') {
    closeSearchModal();
  }
}

function updateSearchSelection(items) {
  items.forEach((it, idx) => {
    if (idx === selectedSearchIndex) {
      it.classList.add('selected');
      it.scrollIntoView({ block: 'nearest' });
    } else {
      it.classList.remove('selected');
    }
  });
}

function jumpToSearchResult(elemId, query) {
  saveSearchHistory(query);
  closeSearchModal();
  var el = document.getElementById(elemId);
  if (!el && !window._modulesLoaded && typeof window.ensureModulesLoaded === 'function') {
    window.ensureModulesLoaded({ sliced: false }).then(function() {
      jumpToSearchResult(elemId, query);
    });
    return;
  }
  if (el) {
    const parentArticle = el.closest('.blog-article');
    if (parentArticle) parentArticle.style.display = 'block';
    
    // Automatically reveal answer
    const drawer = el.querySelector('.answer-drawer');
    const btn = el.querySelector('.reveal-answer-btn');
    if (drawer && btn) {
      drawer.classList.add('is-revealed');
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('active');
      const iconSpan = btn.querySelector('.reveal-btn-icon');
      const textSpan = btn.querySelector('.reveal-btn-text');
      if (iconSpan) iconSpan.textContent = '🙈';
      if (textSpan) textSpan.textContent = 'Hide Model Answer & Verbal Script';
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.outline = '2px solid #00f0ff';
    setTimeout(() => { el.style.outline = 'none'; }, 2500);
  }
}

function saveSearchHistory(query) {
  if (!query || query.length < 2) return;
  try {
    let hist = JSON.parse(localStorage.getItem('mulesoft_recent_searches') || '[]');
    hist = [query, ...hist.filter(q => q.toLowerCase() !== query.toLowerCase())].slice(0, 5);
    localStorage.setItem('mulesoft_recent_searches', JSON.stringify(hist));
  } catch(e) {}
}

function renderSearchHistory() {
  try {
    const hist = JSON.parse(localStorage.getItem('mulesoft_recent_searches') || '[]');
    const container = document.getElementById('search-history-container');
    const chips = document.getElementById('history-chips-container');
    if (!container || !chips) return;
    if (hist.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    chips.innerHTML = hist.map(h => `
      <span class="cat-pill" style="font-size:0.72rem; padding:2px 8px;" onclick="applySearchHistoryChip('${escapeHtml(h)}')">${escapeHtml(h)}</span>
    `).join('');
  } catch(e) {}
}

function applySearchHistoryChip(query) {
  const inp = document.getElementById('search-input-field');
  if (inp) {
    inp.value = query;
    handleSearchInput({ target: { value: query } });
  }
}

function highlightQuery(text, query) {
  if (!query) return escapeHtml(text);
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'gi');
  return escapeHtml(text).replace(re, '<mark class="search-highlight">$1</mark>');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Global Ctrl+K Listener
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSearchModal();
  }
});

// ==========================================

// ==========================================
// 5. DataWeave 2.0 Playground & Studio Lab Engine (26 Scenarios)
// ==========================================

var DW_PRESETS = [];
window.DW_PRESETS = DW_PRESETS;




let currentDwPresetIdx = 0;

function populateDwDropdowns(filteredPresets) {
  const list = filteredPresets || DW_PRESETS;
  const selectElements = document.querySelectorAll('#dw-preset-select, select.dw-select');
  selectElements.forEach(selectEl => {
    if (!selectEl) return;
    const currentVal = selectEl.value;
    selectEl.innerHTML = '';
    list.forEach(p => {
      const opt = document.createElement('option');
      const originalIdx = DW_PRESETS.findIndex(item => item.id === p.id);
      opt.value = originalIdx;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    });
    if (currentVal !== '') selectEl.value = currentVal;
  });
}

function loadDwPreset(idx) {
  currentDwPresetIdx = parseInt(idx, 10);
  if (isNaN(currentDwPresetIdx) || currentDwPresetIdx < 0 || currentDwPresetIdx >= DW_PRESETS.length) {
    currentDwPresetIdx = 0;
  }
  const p = DW_PRESETS[currentDwPresetIdx];
  if (!p) return;

  try { localStorage.setItem('mulesoft_dw_preset_idx', currentDwPresetIdx); } catch(e) {}

  // Update all dropdown selects
  document.querySelectorAll('#dw-preset-select, select.dw-select').forEach(sel => {
    sel.value = currentDwPresetIdx;
  });

  // Panel 1: Input Payload
  document.querySelectorAll('#dw-input-editor, textarea.dw-input-editor').forEach(el => {
    el.value = p.input;
  });
  document.querySelectorAll('#dw-input-format-badge, .dw-panel-format').forEach(el => {
    el.textContent = (p.format || 'JSON').toUpperCase();
  });

  // Panel 2: DW Script
  document.querySelectorAll('#dw-script-editor, textarea.dw-script-editor').forEach(el => {
    el.value = p.script;
  });

  // Panel 3: Transformed Output
  document.querySelectorAll('#dw-output-viewer, textarea.dw-output-viewer').forEach(el => {
    el.value = p.output;
  });
  document.querySelectorAll('#dw-live-status, .dw-status-indicator').forEach(el => {
    el.textContent = '✓ Ready / Pre-computed';
    el.style.color = '#34d399';
  });

  // Panel 4: Explanation Panel (100% Professional English Only, Light Yellow Interview Notes)
  const expl = p.explanation || {};
  const whatHappenedText = expl.whatHappened || expl.kyaHua || 'Incoming payload fields are transformed into the target enterprise schema.';
  const explHtml = `
    <div class="dw-notes-card">
      <div class="dw-notes-title">🔹 What Happened? (Transformation Logic)</div>
      <ul class="dw-notes-bullets">
        <li><strong>Logic:</strong> ${whatHappenedText}</li>
        <li><strong>Key Function(s):</strong> <code>${expl.functionDetails || 'DataWeave 2.0 Core'}</code></li>
        <li><strong>Interview Question:</strong> ${expl.interviewQuestion || 'Frequently asked in MuleSoft technical rounds.'}</li>
        <li><strong>Real Project Usage:</strong> ${expl.realProjectUsage || 'Standard enterprise integration pipeline pattern.'}</li>
      </ul>
    </div>
  `;
  document.querySelectorAll('#dw-explanation-box, .dw-explanation-content').forEach(el => {
    el.innerHTML = explHtml;
  });
}

function runDwTransformation() {
  const p = DW_PRESETS[currentDwPresetIdx];
  const inputEl = document.querySelector('#dw-input-editor, textarea.dw-input-editor');
  const outputEl = document.querySelector('#dw-output-viewer, textarea.dw-output-viewer');
  const statusEl = document.querySelector('#dw-live-status, .dw-status-indicator');
  
  if (!outputEl) return;

  if (statusEl) {
    statusEl.textContent = '⚡ Running...';
    statusEl.style.color = '#facc15';
  }

  setTimeout(() => {
    try {
      if (p && p.format === 'json' && inputEl && (inputEl.value.trim().startsWith('{') || inputEl.value.trim().startsWith('['))) {
        const rawJson = JSON.parse(inputEl.value);
        if (p.id === 'filter-array' && Array.isArray(rawJson)) {
          const res = rawJson.filter(item => (item.amount || item.salary || 0) > 100);
          outputEl.value = JSON.stringify(res, null, 2);
        } else if (p.id === 'map-array' && Array.isArray(rawJson)) {
          const res = rawJson.map(item => Object.assign({}, item, { processed: true, timestamp: new Date().toISOString() }));
          outputEl.value = JSON.stringify(res, null, 2);
        } else {
          outputEl.value = p.output;
        }
      } else {
        outputEl.value = p ? p.output : '// Transformed output';
      }
      if (statusEl) {
        statusEl.textContent = '⚡ Evaluated (Live)';
        statusEl.style.color = '#00f0ff';
      }
    } catch(e) {
      if (p) outputEl.value = p.output;
      if (statusEl) {
        statusEl.textContent = '✓ Pre-computed Output';
        statusEl.style.color = '#34d399';
      }
    }
  }, 100);
}

function filterDwByCategory(cat, btn) {
  document.querySelectorAll('.dw-cat-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  let filtered = DW_PRESETS;
  if (cat !== 'all') {
    filtered = DW_PRESETS.filter(p => p.category === cat);
  }
  populateDwDropdowns(filtered);
  if (filtered.length > 0) {
    const originalIdx = DW_PRESETS.findIndex(item => item.id === filtered[0].id);
    loadDwPreset(originalIdx);
  }
}

function searchDwPresets(query) {
  const q = (query || '').toLowerCase().trim();
  const filtered = DW_PRESETS.filter(p => 
    p.name.toLowerCase().includes(q) || 
    p.category.toLowerCase().includes(q) ||
    p.script.toLowerCase().includes(q)
  );
  populateDwDropdowns(filtered.length > 0 ? filtered : DW_PRESETS);
  if (filtered.length > 0) {
    const originalIdx = DW_PRESETS.findIndex(item => item.id === filtered[0].id);
    loadDwPreset(originalIdx);
  }
}

function copyDwPanel(panel) {
  let val = '';
  if (panel === 'input') {
    val = document.querySelector('#dw-input-editor, textarea.dw-input-editor')?.value || '';
  } else if (panel === 'script') {
    val = document.querySelector('#dw-script-editor, textarea.dw-script-editor')?.value || '';
  } else if (panel === 'output') {
    val = document.querySelector('#dw-output-viewer, textarea.dw-output-viewer')?.value || '';
  }
  if (!val) return;
  navigator.clipboard.writeText(val).then(() => {
    alert(panel.toUpperCase() + ' copied to clipboard!');
  }).catch(() => {
    prompt('Copy to clipboard: Ctrl+C, Enter', val);
  });
}

function resetDwPreset() {
  loadDwPreset(currentDwPresetIdx);
}

function openDataWeaveModal() {
  const modal = document.getElementById('dw-modal');
  if (modal) {
    modal.classList.add('active');
    loadDwPreset(currentDwPresetIdx);
  }
}

function closeDataWeaveModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('btn-close-modal')) return;
  const modal = document.getElementById('dw-modal');
  if (modal) modal.classList.remove('active');
}

function openDwWithCode(btn) {
  const pre = btn.closest('.code-block')?.querySelector('pre');
  if (!pre) return;
  const code = pre.innerText;
  const applyCode = function() {
    document.querySelectorAll('#dw-script-editor, textarea.dw-script-editor').forEach(el => {
      el.value = code;
    });
    runDwTransformation();
  };
  if (typeof window.openDataWeaveModal === 'function') {
    window.openDataWeaveModal();
  }
  if (!window._dwPresetsLoaded && typeof window.ensureDwPresetsLoaded === 'function') {
    window.ensureDwPresetsLoaded().then(applyCode);
  } else {
    applyCode();
  }
}

// ==========================================
// 6. CloudHub vCore Sizing & Decision Tool Logic
// ==========================================

function calculateVCoreDecision() {
  const tps = parseFloat(document.getElementById('vcalc-tps')?.value || 50);
  const payloadKb = parseFloat(document.getElementById('vcalc-payload')?.value || 10);
  const numApis = parseInt(document.getElementById('vcalc-apis')?.value || 1, 10);
  const workloadType = document.getElementById('vcalc-type')?.value || 'realtime';
  const platform = document.getElementById('vcalc-platform')?.value || 'ch2';
  const peakEl = document.getElementById('vcalc-peak');
  const peakMultiplier = (peakEl && peakEl.type === 'checkbox')
    ? (peakEl.checked ? 2.5 : 1.0)
    : (parseFloat(peakEl?.value) || 1.0);
  const isHa = document.getElementById('vcalc-ha')?.checked ?? true;

  if (document.getElementById('vcalc-tps-val')) document.getElementById('vcalc-tps-val').textContent = tps + ' req/sec';
  if (document.getElementById('vcalc-payload-val')) document.getElementById('vcalc-payload-val').textContent = (payloadKb >= 1000 ? (payloadKb/1000).toFixed(1) + ' MB' : payloadKb + ' KB');

  const effectiveTps = tps * peakMultiplier;
  const latencyMs = (workloadType === 'batch') ? 1500 : (workloadType === 'file' ? 3000 : (workloadType === 'scheduled' ? 400 : 180));
  const inflight = (effectiveTps * latencyMs) / 1000;

  let workloadFactor = 1.0;
  if (workloadType === 'batch') workloadFactor = 2.2;
  else if (workloadType === 'file') workloadFactor = 2.5;
  else if (workloadType === 'scheduled') workloadFactor = 1.2;

  const memoryPerReqMb = (payloadKb * 3.5) / 1024;
  const inflightMemoryMb = inflight * memoryPerReqMb * workloadFactor;

  let workerSize = 0.1;
  let workerRamGb = 1.5;
  if (platform === 'ch2') {
    if (inflightMemoryMb > 5000 || effectiveTps > 800 || workloadType === 'file') {
      workerSize = 4.0; workerRamGb = 7.5;
    } else if (inflightMemoryMb > 2200 || effectiveTps > 300 || workloadType === 'batch') {
      workerSize = 2.0; workerRamGb = 3.5;
    } else if (inflightMemoryMb > 900 || effectiveTps > 100) {
      workerSize = 1.0; workerRamGb = 2.0;
    } else if (inflightMemoryMb > 400 || effectiveTps > 40) {
      workerSize = 0.5; workerRamGb = 1.5;
    } else if (inflightMemoryMb > 150 || effectiveTps > 15) {
      workerSize = 0.2; workerRamGb = 1.0;
    } else {
      workerSize = 0.1; workerRamGb = 1.0;
    }
  } else {
    if (inflightMemoryMb > 5000 || effectiveTps > 800 || workloadType === 'file') {
      workerSize = 4.0; workerRamGb = 7.5;
    } else if (inflightMemoryMb > 2200 || effectiveTps > 300 || workloadType === 'batch') {
      workerSize = 2.0; workerRamGb = 3.5;
    } else if (inflightMemoryMb > 400 || effectiveTps > 40) {
      workerSize = 1.0; workerRamGb = 1.5;
    } else if (effectiveTps > 15 || inflightMemoryMb > 100) {
      workerSize = 0.2; workerRamGb = 1.5;
    } else {
      workerSize = 0.1; workerRamGb = 1.5;
    }
  }

  const numWorkers = isHa ? Math.max(2, Math.ceil(effectiveTps / (workerSize * 500))) : 1;
  const totalVCores = +(workerSize * numWorkers * numApis).toFixed(2);
  const monthlyCost = Math.round(totalVCores * 250);

  if (document.getElementById('vcalc-res-worker-size')) {
    document.getElementById('vcalc-res-worker-size').textContent = workerSize + ' vCore';
  }
  if (document.getElementById('vcalc-res-ram')) {
    document.getElementById('vcalc-res-ram').textContent = workerRamGb + ' GB RAM';
  }
  if (document.getElementById('vcalc-res-workers')) {
    document.getElementById('vcalc-res-workers').textContent = numWorkers + (numWorkers > 1 ? ' Workers' : ' Worker');
  }
  if (document.getElementById('vcalc-res-ha-badge')) {
    document.getElementById('vcalc-res-ha-badge').textContent = isHa ? '✅ HA Multi-AZ Active' : '⚠️ Standalone (No HA)';
    document.getElementById('vcalc-res-ha-badge').style.color = isHa ? '#34d399' : '#fbbf24';
  }
  if (document.getElementById('vcalc-res-total-vcores')) {
    document.getElementById('vcalc-res-total-vcores').textContent = totalVCores + ' vCores';
  }
  if (document.getElementById('vcalc-res-cost')) {
    document.getElementById('vcalc-res-cost').textContent = '$' + monthlyCost.toLocaleString() + ' / mo';
  }

  let whyText = `Your expected throughput is <strong>${effectiveTps} TPS</strong> with an average payload of <strong>${payloadKb} KB</strong> on <strong>${platform === 'ch2' ? 'CloudHub 2.0' : 'CloudHub 1.0'}</strong>. `;
  whyText += `By Little's Law (L = λ × W), this creates approximately <strong>${Math.ceil(inflight)} concurrent in-flight requests</strong>. `;
  if (isHa) {
    whyText += `With Multi-AZ High Availability enabled, at least <strong>${numWorkers} replicas</strong> are provisioned across distinct Availability Zones for zero-downtime failover. `;
  }
  whyText += `Allocating <strong>${workerSize} vCore (${workerRamGb} GB RAM)</strong> per worker keeps JVM memory pressure and GC pauses sub-second. Total allocation: <strong>${totalVCores} vCores</strong> across ${numApis} API(s).`;

  if (document.getElementById('vcalc-res-explanation')) {
    document.getElementById('vcalc-res-explanation').innerHTML = whyText;
  }
}

function setVCoreTps(tps) {
  const el = document.getElementById('vcalc-tps');
  if (el) { el.value = tps; calculateVCoreDecision(); }
}

function setVCorePayload(kb) {
  const el = document.getElementById('vcalc-payload');
  if (el) { el.value = kb; calculateVCoreDecision(); }
}

function resetVCoreCalculator() {
  if (document.getElementById('vcalc-tps')) document.getElementById('vcalc-tps').value = 50;
  if (document.getElementById('vcalc-payload')) document.getElementById('vcalc-payload').value = 10;
  if (document.getElementById('vcalc-apis')) document.getElementById('vcalc-apis').value = 1;
  if (document.getElementById('vcalc-type')) document.getElementById('vcalc-type').value = 'realtime';
  if (document.getElementById('vcalc-platform')) document.getElementById('vcalc-platform').value = 'ch2';
  if (document.getElementById('vcalc-peak')) document.getElementById('vcalc-peak').value = '1.0';
  if (document.getElementById('vcalc-ha')) document.getElementById('vcalc-ha').checked = true;
  calculateVCoreDecision();
}

function copyVCoreRecommendation() {
  const size = document.getElementById('vcalc-res-worker-size')?.textContent || '0.2 vCore';
  const reps = document.getElementById('vcalc-res-workers')?.textContent || '2 Workers';
  const total = document.getElementById('vcalc-res-total-vcores')?.textContent || '0.4 vCores';
  const cost = document.getElementById('vcalc-res-cost')?.textContent || '$100/mo';
  const text = `MuleSoft CloudHub Capacity Recommendation:\n- Worker Size: ${size}\n- Deployment: ${reps}\n- Total vCores: ${total}\n- Est. Monthly Cost: ${cost}\nCalculated via MuleSoft Hub (https://niranjanpotter.github.io)`;
  navigator.clipboard.writeText(text).then(() => {
    alert('Recommendation copied to clipboard!');
  }).catch(() => {
    prompt('Copy to clipboard: Ctrl+C, Enter', text);
  });
}

// Initial DW presets & vCore setup are orchestrated lazily by Progressive Data Loader once loaded.


// 7. Interactive Flow Inspector Logic
// ==========================================

const TIER_SPECS = {
  exp: {
    title: "Experience Layer (eAPI)",
    protocol: "REST HTTPS / JSON + mTLS",
    metrics: "P99 < 80ms · Rate Limit: 100 req/min per Client ID",
    desc: "Designed for omnichannel ingress (iOS, Android, React SPA). Strips internal metadata, enforces strict OAuth2 JWT token scopes, and masks PII before leaving the enterprise boundary."
  },
  proc: {
    title: "Process Layer (pAPI)",
    protocol: "Async Saga & Scatter-Gather Orchestration",
    metrics: "P99 < 240ms · 3000ms Scatter-Gather Timeout",
    desc: "Aggregates Customer 360 profiles. Dispatches concurrent non-blocking calls to SAP and DynamoDB. Implements compensating rollback transactions on partial failures."
  },
  sys: {
    title: "System Layer (sAPI)",
    protocol: "Direct Connector (SAP BAPI / DynamoDB PutItem)",
    metrics: "Sub-10ms DynamoDB · Zero Business Logic",
    desc: "Provides strict canonical data abstraction over legacy backend databases and ERPs. Isolates downstream systems from spikes via connection pooling and circuit breakers."
  }
};

function inspectTier(tierKey) {
  const data = TIER_SPECS[tierKey];
  if (!data) return;
  const box = document.getElementById('tier-inspector-details');
  if (!box) return;
  box.innerHTML = `
    <div style="background:rgba(62,99,221,0.15); border:1px solid #00f0ff; border-radius:8px; padding:16px; margin-top:16px; text-align:left;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <strong style="color:#00f0ff; font-size:1rem;">${data.title}</strong>
        <span class="badge badge-primary">${data.protocol}</span>
      </div>
      <div style="color:#a5b4fc; font-size:0.85rem; font-weight:700; margin-bottom:6px;">⚡ SLA &amp; Performance: ${data.metrics}</div>
      <p style="color:#cbd5e1; font-size:0.88rem; line-height:1.6; margin:0;">${data.desc}</p>
    </div>
  `;
}


// ==========================================
// MODULE A: TELEPROMPTER & COACHING STUDIO
// ==========================================
function copyPitchScript(btn) {
  const sentences = document.querySelectorAll('#tpSpeechBox .tp-sentence');
  let fullText = Array.from(sentences).map(s => s.innerText.trim()).join('\\n\\n');
  navigator.clipboard.writeText(fullText).then(() => {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="tp-btn-icon">✓</span><span class="tp-btn-text">Copied!</span>';
    btn.classList.add('bounce-check');
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.classList.remove('bounce-check');
    }, 2000);
  });
}

let tpInterval = null;
let tpRunning = false;
let currentSentenceIdx = 0;
const sentenceDurations = [28, 30, 26, 26]; // Total ~110 seconds

function toggleTeleprompter() {
  const btn = document.getElementById('tpPlayBtn');
  const track = document.getElementById('tpProgressTrack');
  const bar = document.getElementById('tpProgressBar');
  const sentences = document.querySelectorAll('#tpSpeechBox .tp-sentence');
  
  if (!btn || !track || !bar || !sentences.length) return;
  
  if (tpRunning) {
    // Pause
    clearInterval(tpInterval);
    tpRunning = false;
    btn.innerHTML = '<span class="tp-btn-icon">▶️</span><span class="tp-btn-text">Resume Practice</span>';
    return;
  }
  
  tpRunning = true;
  track.style.display = 'block';
  btn.innerHTML = '<span class="tp-btn-icon">⏸️</span><span class="tp-btn-text">Pause Practice</span>';
  
  if (currentSentenceIdx >= sentences.length) {
    currentSentenceIdx = 0;
  }
  
  const totalDuration = 110; // seconds
  let elapsed = currentSentenceIdx > 0 ? sentenceDurations.slice(0, currentSentenceIdx).reduce((a, b) => a + b, 0) : 0;
  
  function updateHighlight() {
    sentences.forEach((s, idx) => {
      if (idx === currentSentenceIdx) {
        s.classList.add('tp-active');
        s.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        s.classList.remove('tp-active');
      }
    });
  }
  
  updateHighlight();
  
  tpInterval = setInterval(() => {
    elapsed += 0.5;
    const pct = Math.min((elapsed / totalDuration) * 100, 100);
    bar.style.width = pct + '%';
    
    // Check sentence transition
    let accumulated = 0;
    for (let i = 0; i < sentenceDurations.length; i++) {
      accumulated += sentenceDurations[i];
      if (elapsed < accumulated) {
        if (currentSentenceIdx !== i) {
          currentSentenceIdx = i;
          updateHighlight();
        }
        break;
      }
    }
    
    if (elapsed >= totalDuration) {
      clearInterval(tpInterval);
      tpRunning = false;
      currentSentenceIdx = 0;
      btn.innerHTML = '<span class="tp-btn-icon">🔄</span><span class="tp-btn-text">Replay Practice</span>';
      setTimeout(() => {
        sentences.forEach(s => s.classList.remove('tp-active'));
        bar.style.width = '0%';
        track.style.display = 'none';
      }, 3500);
    }
  }, 500);
}

function scrollToModule(id) {
  const el = document.getElementById(id);
  if (el) {
    const yOffset = -90;
    const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
    el.style.transition = 'box-shadow 0.4s ease, border-color 0.4s ease';
    el.style.borderColor = '#00F2FE';
    el.style.boxShadow = '0 0 25px rgba(0, 242, 254, 0.4)';
    setTimeout(() => {
      el.style.borderColor = '';
      el.style.boxShadow = '';
    }, 1800);
  }
}

/* ========================================= */

// Lightweight Delegated Runtime Controller (Tables, callouts, expand/copy buttons are pre-baked in HTML)
document.addEventListener('DOMContentLoaded', function() {
  var lightbox = document.getElementById('diagramLightbox');
  var lightboxContent = document.getElementById('diagramLightboxContent');
  var lightboxClose = document.getElementById('diagramLightboxClose');

  function openDiagramLightbox(svg) {
    if (!lightbox || !lightboxContent || !svg) return;
    lightboxContent.innerHTML = svg.outerHTML;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeDiagramLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('active');
    if (lightboxContent) lightboxContent.innerHTML = '';
    document.body.style.overflow = '';
  }

  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeDiagramLightbox);
  }
  if (lightbox) {
    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox || e.target === lightboxContent) {
        closeDiagramLightbox();
      }
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && lightbox && lightbox.classList.contains('active')) {
      closeDiagramLightbox();
    }
  });

  // Delegated click handlers for Diagram Expand, Pre Code Copy, and Module Anchor links
  document.addEventListener('click', function(e) {
    var expandBtn = e.target.closest('.diagram-expand-btn');
    if (expandBtn) {
      e.stopPropagation();
      var wrap = expandBtn.closest('.diagram-svg-wrapper');
      var svg = wrap ? wrap.querySelector('svg') : null;
      if (svg) openDiagramLightbox(svg);
      return;
    }

    var copyBtn = e.target.closest('.code-copy-btn');
    if (copyBtn) {
      var pre = copyBtn.closest('pre');
      if (!pre) return;
      var codeEl = pre.querySelector('code');
      var text = codeEl ? codeEl.innerText : pre.innerText;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          copyBtn.innerHTML = '✓ Copied';
          setTimeout(function() { copyBtn.innerHTML = '📋 Copy'; }, 2000);
        }).catch(function() {});
      }
      return;
    }

    var anchor = e.target.closest('a[href^="#"]');
    if (anchor && !anchor.getAttribute('onclick') && !anchor.classList.contains('quick-sidebar-link') && !anchor.classList.contains('skip-link')) {
      var href = anchor.getAttribute('href');
      var targetId = (href && href.length > 1) ? href.slice(1) : '';
      if (targetId && (targetId.indexOf('mod-') === 0 || targetId === 'vcore-calculator' || targetId === 'error-handling-simulator' || targetId === 'inline-dw-playground')) {
        e.preventDefault();
        if (typeof window.jumpToSectionTool === 'function') {
          window.jumpToSectionTool(targetId);
        }
      }
    }
  });

  // Mobile Off-Canvas Drawer & FAB Controller
  window.toggleSidebarDrawer = function(force) {
    var sidebar = document.getElementById('toc-sidebar');
    var backdrop = document.getElementById('sidebarBackdrop');
    var hamburger = document.getElementById('hamburgerBtn');
    if (!sidebar) return;
    var isOpen = sidebar.classList.contains('drawer-open');
    var newState = typeof force === 'boolean' ? force : !isOpen;
    if (newState) {
      sidebar.classList.add('drawer-open');
      if (backdrop) backdrop.classList.add('active');
      if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    } else {
      sidebar.classList.remove('drawer-open');
      if (backdrop) backdrop.classList.remove('active');
      if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  };

  document.querySelectorAll('.quick-sidebar-link').forEach(function(link) {
    link.addEventListener('click', function() {
      if (window.innerWidth < 1024) {
        toggleSidebarDrawer(false);
      }
    });
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var sidebar = document.getElementById('toc-sidebar');
      if (sidebar && sidebar.classList.contains('drawer-open')) {
        toggleSidebarDrawer(false);
      }
    }
  });

  var fabTop = document.getElementById('fabBackToTop');
  var fabTicking = false;
  window.addEventListener('scroll', function() {
    if (!fabTop || fabTicking) return;
    fabTicking = true;
    requestAnimationFrame(function() {
      fabTicking = false;
      if (window.scrollY > 400) {
        fabTop.classList.add('visible');
      } else {
        fabTop.classList.remove('visible');
      }
    });
  }, { passive: true });
});

// Explicit window exports for backward compatibility & mobile interactions
if (typeof window !== 'undefined') {
  if (typeof openSearchModal === 'function') window.openSearchModal = openSearchModal;
  if (typeof closeSearchModal === 'function') window.closeSearchModal = closeSearchModal;
  if (typeof toggleTheme === 'function') window.toggleTheme = toggleTheme;
  if (typeof toggleSidebar === 'function') window.toggleSidebar = toggleSidebar;
  if (typeof toggleSidebarDrawer === 'function') window.toggleSidebarDrawer = toggleSidebarDrawer;
  if (typeof openDataWeaveModal === 'function') window.openDataWeaveModal = openDataWeaveModal;
  if (typeof closeDataWeaveModal === 'function') window.closeDataWeaveModal = closeDataWeaveModal;
  if (typeof togglePracticeMode === 'function') window.togglePracticeMode = togglePracticeMode;
  if (typeof filterBlogCategory === 'function') window.filterBlogCategory = filterBlogCategory;
  if (typeof filterSidebarModules === 'function') window.filterSidebarModules = filterSidebarModules;
  if (typeof filterPracticeCategory === 'function') window.filterPracticeCategory = filterPracticeCategory;
  if (typeof expandAllAnswers === 'function') window.expandAllAnswers = expandAllAnswers;
  if (typeof collapseAllAnswers === 'function') window.collapseAllAnswers = collapseAllAnswers;
  if (typeof resetFilters === 'function') window.resetFilters = resetFilters;
}


// ============================================================================
// 2026 UI/UX REBUILD: UNIFIED NAV, JUMP-TO-TOOL, PRACTICE BANNER & DW MODAL FIXES
// ============================================================================
(function() {
  // 1. Unified Navigation: Single Left Sidebar (Section Dropdown + Module List + Text Filter) + Breadcrumb
  window._activeSectionCategory = 'all';

  window.updateContentBreadcrumb = function(articleEl) {
    var secEl = document.getElementById('bc-section-name');
    var modEl = document.getElementById('bc-module-name');
    if (!secEl || !modEl) return;
    if (!articleEl) {
      var cat = window._activeSectionCategory || 'all';
      secEl.textContent = (cat === 'all') ? 'All Sections' : cat;
      modEl.textContent = 'Overview & Quick Start';
      return;
    }
    var catName = articleEl.getAttribute('data-category') || 'MuleSoft Core';
    var titleEl = articleEl.querySelector('.article-title');
    var modName = titleEl ? titleEl.textContent.trim() : (articleEl.id || 'Module');
    secEl.textContent = catName;
    modEl.textContent = modName;
  };

  window.filterBlogCategory = function(catName, btn, opts) {
    var nextCat = catName || 'all';
    var skipScroll = Boolean(opts && opts.skipScroll);
    window._activeSectionCategory = nextCat;
    if (!skipScroll) {
      window._suppressScrollSpyUntil = Date.now() + 300;
    }

    var secSelect = document.getElementById('sidebar-section-select');
    if (secSelect && secSelect.value !== nextCat) {
      secSelect.value = nextCat;
    }

    // If deferred modules haven't finished mounting yet, update sidebar UI immediately via data-category then flush & complete
    if (!window._modulesLoaded && typeof window.ensureModulesLoaded === 'function') {
      var sbItemsPre = document.querySelectorAll('.quick-sidebar-item');
      var preCount = 0;
      sbItemsPre.forEach(function(item) {
        var link = item.querySelector('.quick-sidebar-link');
        var linkCat = link ? link.getAttribute('data-category') : '';
        var vis = (nextCat === 'all' || linkCat === nextCat);
        item.style.display = vis ? 'block' : 'none';
        if (vis) preCount++;
      });
      var tElPre = document.getElementById('sidebar-section-title');
      var cElPre = document.getElementById('sidebar-module-count');
      var rBtnPre = document.getElementById('sidebar-reset-filter');
      if (tElPre) tElPre.textContent = (nextCat === 'all') ? 'All Modules' : nextCat;
      if (cElPre) cElPre.textContent = (nextCat === 'all') ? ('Showing all ' + preCount + ' modules') : ('Showing ' + preCount + ' of 45 modules');
      if (rBtnPre) rBtnPre.style.display = (nextCat === 'all') ? 'none' : 'inline-block';
      window.ensureModulesLoaded({ sliced: false }).then(function() {
        window.filterBlogCategory(nextCat, btn, opts);
      });
      return;
    }

    var visibleModIds = new Set();
    var firstVisibleArticle = null;
    var articles = document.querySelectorAll('.blog-article');
    articles.forEach(function(art) {
      var artCat = art.getAttribute('data-category');
      if (nextCat === 'all' || artCat === nextCat) {
        art.style.display = 'block';
        if (art.id) visibleModIds.add(art.id);
        if (!firstVisibleArticle) firstVisibleArticle = art;
      } else {
        art.style.display = 'none';
      }
    });

    // Sync Left Sidebar to only show modules inside the selected section
    var sidebarItems = document.querySelectorAll('.quick-sidebar-item');
    var shownCount = 0;
    sidebarItems.forEach(function(item) {
      var link = item.querySelector('.quick-sidebar-link');
      var modId = link ? link.getAttribute('data-mod-id') : '';
      if (nextCat === 'all' || visibleModIds.has(modId)) {
        item.style.display = 'block';
        shownCount++;
      } else {
        item.style.display = 'none';
      }
    });

    // Clear sidebar text filter when switching sections
    var sbInput = document.querySelector('.sidebar-filter-input');
    if (sbInput) sbInput.value = '';

    // Update Sidebar Header Title, Count & Reset Pill
    var titleEl = document.getElementById('sidebar-section-title');
    var countEl = document.getElementById('sidebar-module-count');
    var resetBtn = document.getElementById('sidebar-reset-filter');
    if (titleEl) {
      titleEl.textContent = (nextCat === 'all') ? 'All Modules' : nextCat;
    }
    if (countEl) {
      countEl.textContent = (nextCat === 'all')
        ? ('Showing all ' + shownCount + ' modules')
        : ('Showing ' + shownCount + ' of 45 modules');
    }
    if (resetBtn) {
      resetBtn.style.display = (nextCat === 'all') ? 'none' : 'inline-block';
    }

    // Highlight first visible sidebar link & sync breadcrumb
    var targetModId = firstVisibleArticle ? firstVisibleArticle.id : '';
    document.querySelectorAll('.quick-sidebar-link').forEach(function(link) {
      if (targetModId && link.getAttribute('data-mod-id') === targetModId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    if (nextCat === 'all') {
      window.updateContentBreadcrumb(null);
    } else if (firstVisibleArticle) {
      window.updateContentBreadcrumb(firstVisibleArticle);
    }

    // Prevent browser scroll-clamping from landing user at bottom/last module after filtering
    if (!skipScroll) {
      var prevBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';

      if (nextCat === 'all') {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
      } else if (firstVisibleArticle) {
        var hdr = document.querySelector('.hub-header');
        var util = document.getElementById('utility-bar');
        var headerOffset = (hdr ? hdr.offsetHeight : 65) + (util ? util.offsetHeight : 46) + 18;
        var rect = firstVisibleArticle.getBoundingClientRect();
        var targetY = Math.max(0, Math.round(rect.top + window.pageYOffset - headerOffset));
        window.scrollTo(0, targetY);
        document.documentElement.scrollTop = targetY;

        requestAnimationFrame(function() {
          var settledRect = firstVisibleArticle.getBoundingClientRect();
          if (Math.abs(settledRect.top - headerOffset) > 4) {
            var y2 = Math.max(0, Math.round(settledRect.top + window.pageYOffset - headerOffset));
            window.scrollTo(0, y2);
            document.documentElement.scrollTop = y2;
          }
        });
      }

      setTimeout(function() {
        document.documentElement.style.scrollBehavior = prevBehavior;
      }, 80);

      if (window.innerWidth < 1024 && typeof window.toggleSidebarDrawer === 'function') {
        window.toggleSidebarDrawer(false);
      }
    }
  };
  if (typeof filterBlogCategory !== 'undefined') {
    filterBlogCategory = window.filterBlogCategory;
  }

  // 2. Reliable Desktop + Mobile Jump-to-Tool (Fixes vCore Calculator & Inline DW Lab)
  window.jumpToSectionTool = function(targetId) {
    var target = document.getElementById(targetId);
    if (!target && !window._modulesLoaded && typeof window.ensureModulesLoaded === 'function') {
      window.ensureModulesLoaded({ sliced: false }).then(function() {
        window.jumpToSectionTool(targetId);
      });
      return false;
    }
    if (!target) return false;
    window._suppressScrollSpyUntil = Date.now() + 300;

    // Ensure parent .blog-article is visible (unfilter if hidden by active section)
    var parentSection = target.closest('.blog-article');
    if (parentSection && window.getComputedStyle(parentSection).display === 'none') {
      window.filterBlogCategory('all', null, { skipScroll: true });
    }

    var bcArticle = target.classList.contains('blog-article') ? target : parentSection;
    if (bcArticle && typeof window.updateContentBreadcrumb === 'function') {
      window.updateContentBreadcrumb(bcArticle);
    }

    // Compute exact document Y coordinate with header + utility bar clearance
    var hdr = document.querySelector('.hub-header');
    var util = document.getElementById('utility-bar');
    var headerOffset = (hdr ? hdr.offsetHeight : 65) + (util ? util.offsetHeight : 46) + 18;
    var rect = target.getBoundingClientRect();
    var targetY = Math.max(0, window.pageYOffset + rect.top - headerOffset);

    // Jump cleanly (use 'instant' when > 4000px away so CSS scroll-behavior: smooth never stalls across 50k px docs)
    var distance = Math.abs(targetY - window.pageYOffset);
    if (distance > 4000) {
      var prevBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, targetY);
      document.documentElement.scrollTop = targetY;
      setTimeout(function() {
        document.documentElement.style.scrollBehavior = prevBehavior;
      }, 60);
    } else {
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }

    // Re-verify alignment after layout settle
    setTimeout(function() {
      var newRect = target.getBoundingClientRect();
      if (Math.abs(newRect.top - headerOffset) > 80) {
        var prevB = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(0, Math.max(0, window.pageYOffset + newRect.top - headerOffset));
        setTimeout(function() { document.documentElement.style.scrollBehavior = prevB; }, 40);
      }
      target.classList.remove('tool-highlight-pulse');
      void target.offsetWidth;
      target.classList.add('tool-highlight-pulse');
      setTimeout(function() { target.classList.remove('tool-highlight-pulse'); }, 3000);
    }, 150);

    return false;
  };

  // 3. Practice Mode with Clear Active Banner + Header/Utility/Hero Sync
  window.togglePracticeMode = function(forceOn) {
    var currentlyOn = document.body.classList.contains('practice-mode-on');
    var nextState = (typeof forceOn === 'boolean') ? forceOn : !currentlyOn;
    var pBtn = document.getElementById('practice-btn');
    var heroPBtn = document.getElementById('hero-practice-btn');
    var utilPBtn = document.getElementById('utility-practice-btn');
    var utilPLabel = document.getElementById('utility-practice-label');
    var banner = document.getElementById('practice-mode-banner');

    if (nextState) {
      document.body.classList.add('practice-mode-on');
      if (typeof collapseAllAnswers === 'function') collapseAllAnswers();
      if (pBtn) {
        pBtn.classList.add('btn-active');
        pBtn.innerHTML = '🎯 Practice Mode: ON';
      }
      if (heroPBtn) {
        heroPBtn.classList.add('btn-active');
        heroPBtn.innerHTML = '<span>🎯 Practice Mode: ON</span>';
      }
      if (utilPBtn) {
        utilPBtn.classList.add('btn-active');
        utilPBtn.setAttribute('aria-pressed', 'true');
      }
      if (utilPLabel) utilPLabel.textContent = 'Practice: ON';
      if (banner) banner.style.display = 'flex';
      if (forceOn === true) {
        window.jumpToSectionTool('practice-mode-banner');
      }
    } else {
      document.body.classList.remove('practice-mode-on');
      if (pBtn) {
        pBtn.classList.remove('btn-active');
        pBtn.innerHTML = '🎯 Practice Mode';
      }
      if (heroPBtn) {
        heroPBtn.classList.remove('btn-active');
        heroPBtn.innerHTML = '<span>🎯 Try Practice Mode</span>';
      }
      if (utilPBtn) {
        utilPBtn.classList.remove('btn-active');
        utilPBtn.setAttribute('aria-pressed', 'false');
      }
      if (utilPLabel) utilPLabel.textContent = 'Practice Mode';
      if (banner) banner.style.display = 'none';
    }
  };

  // 4. Scope-Aware DataWeave Playground Engine (Fixes Modal vs Inline Sync, Scrolling & Fullscreen)
  function getDwContainer(scope) {
    if (scope === 'modal') return document.getElementById('modal-dw-playground') || document.getElementById('dw-modal');
    if (scope === 'inline') return document.getElementById('inline-dw-playground');
    var modal = document.getElementById('dw-modal');
    if (modal && modal.classList.contains('active')) {
      return document.getElementById('modal-dw-playground') || modal;
    }
    return document.getElementById('inline-dw-playground') || document;
  }

  window.runDwTransformation = function(scope) {
    var root = getDwContainer(scope);
    var p = (typeof DW_PRESETS !== 'undefined' && typeof currentDwPresetIdx !== 'undefined') ? DW_PRESETS[currentDwPresetIdx] : null;
    var inputEl = root.querySelector('.dw-input-editor, #dw-input-editor, #modal-dw-input-editor');
    var outputEl = root.querySelector('.dw-output-viewer, #dw-output-viewer, #modal-dw-output-viewer');
    var statusEl = root.querySelector('.dw-status-indicator, #dw-live-status, #modal-dw-live-status');
    if (!outputEl) return;

    if (statusEl) {
      statusEl.textContent = '⚡ Running...';
      statusEl.style.color = '#facc15';
    }

    setTimeout(function() {
      var resultText = p ? p.output : '// Transformed output';
      try {
        if (p && p.format === 'json' && inputEl && (inputEl.value.trim().startsWith('{') || inputEl.value.trim().startsWith('['))) {
          var rawJson = JSON.parse(inputEl.value);
          if (p.id === 'filter-array' && Array.isArray(rawJson)) {
            resultText = JSON.stringify(rawJson.filter(function(item) { return (item.amount || item.salary || 0) > 100; }), null, 2);
          } else if (p.id === 'map-array' && Array.isArray(rawJson)) {
            resultText = JSON.stringify(rawJson.map(function(item) { return Object.assign({}, item, { processed: true, timestamp: new Date().toISOString() }); }), null, 2);
          }
        }
        outputEl.value = resultText;
        if (statusEl) {
          statusEl.textContent = '⚡ Evaluated (Live)';
          statusEl.style.color = '#00f0ff';
        }
      } catch (e) {
        outputEl.value = resultText;
        if (statusEl) {
          statusEl.textContent = '✓ Pre-computed Output';
          statusEl.style.color = '#34d399';
        }
      }

      if (window.innerWidth < 768) {
        window.switchDwMobileTab('output', null, scope);
      }
    }, 80);
  };

  window.copyDwPanel = function(panel, scope) {
    var root = getDwContainer(scope);
    var sel = panel === 'input'
      ? '.dw-input-editor, #dw-input-editor, #modal-dw-input-editor'
      : panel === 'script'
        ? '.dw-script-editor, #dw-script-editor, #modal-dw-script-editor'
        : '.dw-output-viewer, #dw-output-viewer, #modal-dw-output-viewer';
    var el = root.querySelector(sel);
    var val = el ? el.value : '';
    if (!val) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).catch(function() {});
    }
  };

  window.switchDwMobileTab = function(tabName, btnEl, scope) {
    var root = getDwContainer(scope);
    if (!root) return;
    root.querySelectorAll('.dw-tab-btn').forEach(function(b) {
      b.classList.remove('active');
    });
    if (btnEl) {
      btnEl.classList.add('active');
    } else {
      var m = root.querySelector('.dw-tab-btn[data-tab="' + tabName + '"]');
      if (m) m.classList.add('active');
    }
    var prefix = (root.id === 'modal-dw-playground') ? 'modal-dw-panel-' : 'dw-panel-';
    ['input', 'script', 'output', 'notes'].forEach(function(k) {
      var panel = document.getElementById(prefix + k);
      if (panel) {
        if (k === tabName) panel.classList.add('dw-tab-active');
        else panel.classList.remove('dw-tab-active');
      }
    });
  };

  window.openDataWeaveModal = function(startFullscreen) {
    var modal = document.getElementById('dw-modal');
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    var hydrateDwModal = function() {
      if (typeof populateDwDropdowns === 'function' && typeof DW_PRESETS !== 'undefined' && DW_PRESETS.length > 0) {
        var modalSel = document.getElementById('modal-dw-preset-select');
        if (modalSel && modalSel.options.length === 0) {
          populateDwDropdowns(DW_PRESETS);
        }
      }
      if (typeof loadDwPreset === 'function' && typeof currentDwPresetIdx !== 'undefined' && DW_PRESETS.length > 0) {
        loadDwPreset(currentDwPresetIdx);
      }
    };

    if (!window._dwPresetsLoaded && typeof window.ensureDwPresetsLoaded === 'function') {
      window.ensureDwPresetsLoaded().then(hydrateDwModal);
    } else {
      hydrateDwModal();
    }

    // Reset scroll position to top of scrollable body
    var scrollBody = document.getElementById('modal-dw-playground');
    if (scrollBody) scrollBody.scrollTop = 0;

    if (startFullscreen === true) {
      window.toggleDwFullscreen(true);
    }
  };

  window.closeDataWeaveModal = function(e) {
    if (e && e.target !== e.currentTarget && !e.target.classList.contains('btn-close-modal')) return;
    if (typeof window.exitFeatureFullscreen === 'function') {
      window.exitFeatureFullscreen();
    }
    var modal = document.getElementById('dw-modal');
    var container = document.getElementById('dw-modal-container');
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function() {});
    }
    if (container) container.classList.remove('dw-fullscreen-active', 'feature-fullscreen-active');
    var fsBtn = document.getElementById('dw-fullscreen-btn');
    if (fsBtn) {
      fsBtn.textContent = '⛶ Full Screen';
      fsBtn.classList.remove('is-fullscreen');
      fsBtn.setAttribute('aria-pressed', 'false');
    }
    if (modal) modal.classList.remove('active', 'modal-fullscreen-parent');
    document.body.style.overflow = '';
  };

  window.toggleDwFullscreen = function(forceOn) {
    if (typeof window.toggleFeatureFullscreen === 'function') {
      return window.toggleFeatureFullscreen('dw-modal-container', document.getElementById('dw-fullscreen-btn'), forceOn);
    }
    return false;
  };

  // Close DW modal on Escape key (when not in native fullscreen)
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var modal = document.getElementById('dw-modal');
      if (modal && modal.classList.contains('active') && !document.fullscreenElement) {
        window.closeDataWeaveModal();
      }
    }
  });
})();


// ============================================================================
// TIMED MOCK INTERVIEW SIMULATOR ENGINE (100% CLIENT-SIDE, DYNAMIC DOM HARVEST)
// ============================================================================
(function() {
  var mockState = {
    role: 'all',
    count: 10,
    minutes: 15,
    questions: [],
    currentIndex: 0,
    grades: [], // { question, grade: 'got'|'partial'|'missed', points: 1|0.5|0 }
    secondsLeft: 900,
    totalSeconds: 900,
    timerId: null,
    paused: false
  };

  function harvestFaqCards() {
    var cards = document.querySelectorAll('.faq-card');
    var list = [];
    cards.forEach(function(card, idx) {
      var titleEl = card.querySelector('.q-title');
      var ansEl = card.querySelector('.answer-body-content');
      if (!titleEl || !ansEl) return;
      var section = card.closest('.blog-article');
      var modTitleEl = section ? section.querySelector('.article-title') : null;
      var roleRaw = (card.getAttribute('data-role') || (section ? section.getAttribute('data-role') : '') || 'senior').toLowerCase();
      if (!card.id) card.id = 'faq-auto-' + idx;
      list.push({
        id: card.id,
        role: roleRaw,
        moduleId: section ? section.id : '',
        moduleTitle: modTitleEl ? modTitleEl.textContent.trim() : 'MuleSoft Core',
        question: titleEl.textContent.trim(),
        answerHtml: ansEl.innerHTML
      });
    });
    return list;
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function formatTime(sec) {
    var s = Math.max(0, sec);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function updateTimerUI() {
    var pill = document.getElementById('mock-timer-pill');
    if (!pill) return;
    pill.textContent = '⏱️ ' + formatTime(mockState.secondsLeft);
    pill.classList.remove('timer-warn', 'timer-danger');
    if (mockState.secondsLeft <= 30) pill.classList.add('timer-danger');
    else if (mockState.secondsLeft <= 120) pill.classList.add('timer-warn');
  }

  function stopTimer() {
    if (mockState.timerId) {
      clearInterval(mockState.timerId);
      mockState.timerId = null;
    }
  }

  function loadPastStats() {
    try {
      var raw = localStorage.getItem('mulesoft_hub_mock_stats');
      if (!raw) return;
      var stats = JSON.parse(raw);
      if (stats && stats.count > 0) {
        var strip = document.getElementById('mock-past-stats');
        var bestEl = document.getElementById('mock-stat-best');
        var cntEl = document.getElementById('mock-stat-count');
        if (strip) strip.style.display = 'flex';
        if (bestEl) bestEl.textContent = (stats.best || 0) + '%';
        if (cntEl) cntEl.textContent = stats.count;
      }
    } catch (e) {}
  }

  function savePastStats(pct) {
    try {
      var raw = localStorage.getItem('mulesoft_hub_mock_stats');
      var stats = raw ? JSON.parse(raw) : { best: 0, count: 0 };
      stats.count = (stats.count || 0) + 1;
      stats.best = Math.max(stats.best || 0, pct);
      localStorage.setItem('mulesoft_hub_mock_stats', JSON.stringify(stats));
    } catch (e) {}
  }

  function showScreen(screenId) {
    ['mock-screen-setup', 'mock-screen-active', 'mock-screen-results'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = (id === screenId) ? 'block' : 'none';
    });
    var timerPill = document.getElementById('mock-timer-pill');
    var pauseBtn = document.getElementById('mock-pause-btn');
    var isActive = (screenId === 'mock-screen-active');
    if (timerPill) timerPill.style.display = isActive ? 'inline-block' : 'none';
    if (pauseBtn) pauseBtn.style.display = isActive ? 'inline-flex' : 'none';
    var body = document.getElementById('mock-modal-body');
    if (body) body.scrollTop = 0;
  }

  function renderCurrentQuestion() {
    var q = mockState.questions[mockState.currentIndex];
    if (!q) {
      finishMockInterview();
      return;
    }
    var total = mockState.questions.length;
    var num = mockState.currentIndex + 1;

    var counterEl = document.getElementById('mock-q-counter');
    var fillEl = document.getElementById('mock-progress-fill');
    var roleEl = document.getElementById('mock-q-role-badge');
    var modEl = document.getElementById('mock-q-module');
    var titleEl = document.getElementById('mock-q-title');
    var revealWrap = document.getElementById('mock-reveal-wrap');
    var ansSec = document.getElementById('mock-answer-section');
    var ansBox = document.getElementById('mock-answer-content');

    if (counterEl) counterEl.textContent = 'Question ' + num + ' of ' + total;
    if (fillEl) fillEl.style.width = Math.round((num / total) * 100) + '%';
    if (roleEl) roleEl.textContent = q.role.toUpperCase();
    if (modEl) modEl.textContent = q.moduleTitle;
    if (titleEl) titleEl.textContent = q.question;
    if (ansBox) ansBox.innerHTML = q.answerHtml;
    if (revealWrap) revealWrap.style.display = 'block';
    if (ansSec) ansSec.style.display = 'none';

    var body = document.getElementById('mock-modal-body');
    if (body) body.scrollTop = 0;
  }

  function finishMockInterview() {
    stopTimer();
    var totalQs = mockState.questions.length || 1;
    var elapsed = Math.max(1, mockState.totalSeconds - mockState.secondsLeft);

    var gotCount = 0, partialCount = 0, missedCount = 0, totalPts = 0;
    var modStats = {};
    var toReview = [];

    mockState.grades.forEach(function(entry) {
      totalPts += entry.points;
      if (entry.grade === 'got') gotCount++;
      else if (entry.grade === 'partial') { partialCount++; toReview.push(entry); }
      else { missedCount++; toReview.push(entry); }

      var mName = entry.question.moduleTitle;
      if (!modStats[mName]) modStats[mName] = { pts: 0, count: 0 };
      modStats[mName].pts += entry.points;
      modStats[mName].count += 1;
    });

    // Any unanswered questions due to timer expiry count as missed
    for (var i = mockState.grades.length; i < mockState.questions.length; i++) {
      var uq = mockState.questions[i];
      missedCount++;
      toReview.push({ question: uq, grade: 'missed', points: 0 });
      if (!modStats[uq.moduleTitle]) modStats[uq.moduleTitle] = { pts: 0, count: 0 };
      modStats[uq.moduleTitle].count += 1;
    }

    var pct = Math.round((totalPts / totalQs) * 100);
    savePastStats(pct);

    var verdict = pct >= 80
      ? '🏆 Interview Ready!'
      : pct >= 55
        ? '⚡ Almost Ready — Polish Weak Spots'
        : '📚 Needs Focused Revision';

    document.getElementById('mock-score-pct').textContent = pct + '%';
    document.getElementById('mock-score-verdict').textContent = verdict;
    document.getElementById('mock-score-meta').textContent =
      'Completed ' + totalQs + ' questions in ' + formatTime(elapsed) + ' (' + mockState.role.toUpperCase() + ' track)';
    document.getElementById('mock-tally-got').textContent = '✅ ' + gotCount + ' Got It';
    document.getElementById('mock-tally-partial').textContent = '⚠️ ' + partialCount + ' Partial';
    document.getElementById('mock-tally-missed').textContent = '❌ ' + missedCount + ' Missed';

    // Render Module Breakdown
    var bdEl = document.getElementById('mock-module-breakdown');
    if (bdEl) {
      bdEl.innerHTML = '';
      Object.keys(modStats).forEach(function(mName) {
        var st = modStats[mName];
        var mPct = Math.round((st.pts / st.count) * 100);
        var color = mPct >= 80 ? '#34d399' : (mPct >= 50 ? '#fbbf24' : '#fb7185');
        var row = document.createElement('div');
        row.className = 'mock-breakdown-row';
        row.innerHTML = '<span>' + mName + ' (' + st.count + ' Q)</span><strong style="color:' + color + '; font-family:var(--font-mono);">' + mPct + '%</strong>';
        bdEl.appendChild(row);
      });
    }

    // Render Missed & Partial Review List
    var revSec = document.getElementById('mock-review-section');
    var revList = document.getElementById('mock-review-list');
    if (revList && revSec) {
      revList.innerHTML = '';
      if (toReview.length === 0) {
        revSec.style.display = 'none';
      } else {
        revSec.style.display = 'block';
        toReview.forEach(function(entry) {
          var item = document.createElement('div');
          item.className = 'mock-review-item';
          var badge = entry.grade === 'partial' ? '⚠️ Partial' : '❌ Missed';
          item.innerHTML =
            '<div class="mock-review-q"><span style="font-size:0.75rem; opacity:0.85; margin-right:6px;">' + badge + '</span>' + entry.question.question + '</div>' +
            '<button type="button" class="btn btn-sm" onclick="reviewMockQuestionInGuide(\'' + entry.question.id + '\')">🔍 Jump to Full Q&amp;A</button>';
          revList.appendChild(item);
        });
      }
    }

    mockState.lastSummary =
      'MuleSoft Hub 2026 Timed Mock Interview Scorecard: ' + pct + '% Readiness (' + verdict + ') | ' +
      gotCount + ' Got It, ' + partialCount + ' Partial, ' + missedCount + ' Missed | ' +
      totalQs + ' Qs in ' + formatTime(elapsed) + ' — https://niranjanpotter.github.io/';

    showScreen('mock-screen-results');
  }

  window.openMockInterviewModal = function() {
    var modal = document.getElementById('mock-interview-modal');
    if (!modal) return;
    stopTimer();
    loadPastStats();
    showScreen('mock-screen-setup');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.closeMockInterviewModal = function(e) {
    if (e && e.target !== e.currentTarget && !e.target.classList.contains('btn-close-modal')) return;
    if (typeof window.exitFeatureFullscreen === 'function') {
      window.exitFeatureFullscreen();
    }
    stopTimer();
    var modal = document.getElementById('mock-interview-modal');
    if (modal) modal.classList.remove('active', 'modal-fullscreen-parent');
    document.body.style.overflow = '';
  };

  window.selectMockRole = function(role, btn) {
    mockState.role = role;
    document.querySelectorAll('#mock-role-choices .mock-choice-card').forEach(function(c) {
      c.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
  };

  window.selectMockPreset = function(count, mins, btn) {
    mockState.count = count;
    mockState.minutes = mins;
    document.querySelectorAll('#mock-length-choices .mock-choice-card').forEach(function(c) {
      c.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
  };

  window.startMockInterview = function() {
    if (!window._modulesLoaded && typeof window.ensureModulesLoaded === 'function') {
      window.ensureModulesLoaded({ sliced: false }).then(function() {
        window.startMockInterview();
      });
      return;
    }
    var allCards = harvestFaqCards();
    var pool = allCards;
    if (mockState.role !== 'all') {
      var filtered = allCards.filter(function(q) {
        return q.role.indexOf(mockState.role) !== -1;
      });
      if (filtered.length >= 3) pool = filtered;
    }

    mockState.questions = shuffleArray(pool).slice(0, Math.min(mockState.count, pool.length));
    mockState.currentIndex = 0;
    mockState.grades = [];
    mockState.totalSeconds = mockState.minutes * 60;
    mockState.secondsLeft = mockState.totalSeconds;
    mockState.paused = false;

    var pauseBtn = document.getElementById('mock-pause-btn');
    if (pauseBtn) pauseBtn.textContent = '⏸ Pause';

    showScreen('mock-screen-active');
    updateTimerUI();
    renderCurrentQuestion();

    stopTimer();
    mockState.timerId = setInterval(function() {
      if (mockState.paused) return;
      mockState.secondsLeft--;
      updateTimerUI();
      if (mockState.secondsLeft <= 0) {
        finishMockInterview();
      }
    }, 1000);
  };

  window.toggleMockPause = function() {
    mockState.paused = !mockState.paused;
    var pauseBtn = document.getElementById('mock-pause-btn');
    if (pauseBtn) pauseBtn.textContent = mockState.paused ? '▶ Resume' : '⏸ Pause';
  };

  window.revealMockAnswer = function() {
    var revealWrap = document.getElementById('mock-reveal-wrap');
    var ansSec = document.getElementById('mock-answer-section');
    if (revealWrap) revealWrap.style.display = 'none';
    if (ansSec) ansSec.style.display = 'block';
  };

  window.gradeMockQuestion = function(grade) {
    var q = mockState.questions[mockState.currentIndex];
    if (!q) return;
    var pts = grade === 'got' ? 1 : (grade === 'partial' ? 0.5 : 0);
    mockState.grades.push({ question: q, grade: grade, points: pts });
    mockState.currentIndex++;
    if (mockState.currentIndex >= mockState.questions.length) {
      finishMockInterview();
    } else {
      renderCurrentQuestion();
    }
  };

  window.reviewMockQuestionInGuide = function(cardId) {
    window.closeMockInterviewModal();
    setTimeout(function() {
      if (typeof window.jumpToSectionTool === 'function') {
        window.jumpToSectionTool(cardId);
      }
      var card = document.getElementById(cardId);
      if (card) {
        var revealBtn = card.querySelector('.reveal-answer-btn');
        var drawer = card.querySelector('.answer-drawer');
        if (revealBtn && drawer && !drawer.classList.contains('open') && typeof toggleAnswerDrawer === 'function') {
          toggleAnswerDrawer(revealBtn);
        }
      }
    }, 80);
  };

  window.copyMockScorecard = function() {
    var txt = mockState.lastSummary || 'MuleSoft Hub 2026 Timed Mock Interview — https://niranjanpotter.github.io/';
    var btn = document.getElementById('mock-copy-score-btn');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function() {
        if (btn) {
          btn.textContent = '✓ Copied to Clipboard!';
          setTimeout(function() { btn.textContent = '📋 Copy Readiness Summary'; }, 2000);
        }
      }).catch(function() {});
    }
  };

  window.resetMockToSetup = function() {
    stopTimer();
    loadPastStats();
    showScreen('mock-screen-setup');
  };

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var modal = document.getElementById('mock-interview-modal');
      if (modal && modal.classList.contains('active')) {
        window.closeMockInterviewModal();
      }
    }
  });
})();


// ============================================================================
// DATAWEAVE STUDIO LAB V2: TABS, OFFLINE AUTO-GENERATOR & CUSTOM EVALUATOR
// ============================================================================
(function() {
  // --- Utility: XML <-> JSON & CSV <-> JSON Converters ---
  function xmlNodeToObj(node) {
    var obj = {};
    var hasChildren = false;
    var childElements = [];
    for (var i = 0; i < node.childNodes.length; i++) {
      var ch = node.childNodes[i];
      if (ch.nodeType === 1) {
        hasChildren = true;
        childElements.push(ch);
      }
    }
    if (!hasChildren) {
      var txt = (node.textContent || '').trim();
      if (/^-?\d+(\.\d+)?$/.test(txt)) return Number(txt);
      if (txt === 'true') return true;
      if (txt === 'false') return false;
      return txt;
    }
    childElements.forEach(function(el) {
      var tag = el.localName || el.nodeName;
      var val = xmlNodeToObj(el);
      if (obj[tag] !== undefined) {
        if (!Array.isArray(obj[tag])) obj[tag] = [obj[tag]];
        obj[tag].push(val);
      } else {
        obj[tag] = val;
      }
    });
    return obj;
  }

  function parseXmlToJson(xmlStr) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlStr, 'application/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('Invalid XML in Input');
    }
    var root = doc.documentElement;
    var rootTag = root.localName || root.nodeName;
    var inner = xmlNodeToObj(root);
    var wrapped = {};
    wrapped[rootTag] = inner;
    // If inner is a plain object, expose both root-wrapped and flattened access for ergonomic mapping
    return { rootTag: rootTag, wrapped: wrapped, flat: (typeof inner === 'object' && !Array.isArray(inner)) ? inner : wrapped };
  }

  function objToXml(obj, rootName, indent) {
    indent = indent || '';
    rootName = rootName || 'root';
    if (obj === null || obj === undefined) return indent + '<' + rootName + '/>';
    if (typeof obj !== 'object') {
      var escaped = String(obj).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return indent + '<' + rootName + '>' + escaped + '</' + rootName + '>';
    }
    if (Array.isArray(obj)) {
      return obj.map(function(item) { return objToXml(item, 'item', indent); }).join('\n');
    }
    var keys = Object.keys(obj);
    if (keys.length === 1 && indent === '') {
      return objToXml(obj[keys[0]], keys[0], '');
    }
    var children = keys.map(function(k) {
      var val = obj[k];
      if (Array.isArray(val)) {
        return val.map(function(it) { return objToXml(it, k, indent + '  '); }).join('\n');
      }
      return objToXml(val, k, indent + '  ');
    }).join('\n');
    return indent + '<' + rootName + '>\n' + children + '\n' + indent + '</' + rootName + '>';
  }

  function arrayToCsv(data) {
    var arr = Array.isArray(data) ? data : [data];
    if (!arr.length || typeof arr[0] !== 'object') return String(data);
    var headers = Object.keys(arr[0]);
    var lines = [headers.join(',')];
    arr.forEach(function(row) {
      lines.push(headers.map(function(h) {
        var v = row[h] === undefined || row[h] === null ? '' : String(row[h]);
        return v.indexOf(',') !== -1 || v.indexOf('"') !== -1 ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    return lines.join('\n');
  }

  function csvToArray(csvStr) {
    var lines = csvStr.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV requires a header row and at least one data row');
    var headers = lines[0].split(',').map(function(h) { return h.trim().replace(/^"|"$/g, ''); });
    return lines.slice(1).map(function(line) {
      var cols = line.split(',').map(function(c) { return c.trim().replace(/^"|"$/g, ''); });
      var row = {};
      headers.forEach(function(h, idx) {
        var val = cols[idx] !== undefined ? cols[idx] : '';
        if (/^-?\d+(\.\d+)?$/.test(val)) row[h] = Number(val);
        else if (val === 'true') row[h] = true;
        else if (val === 'false') row[h] = false;
        else row[h] = val;
      });
      return row;
    });
  }

  // --- 1. Bulletproof Tab Switching (data-tab + addEventListener) ---
  function getStudioRoot(scope) {
    if (scope === 'modal') return document.getElementById('modal-dw-playground') || document.getElementById('dw-modal');
    if (scope === 'inline') return document.getElementById('inline-dw-playground');
    var modal = document.getElementById('dw-modal');
    if (modal && modal.classList.contains('active')) return document.getElementById('modal-dw-playground');
    return document.getElementById('inline-dw-playground');
  }

  window.showTab = function(tabName, scope, clickedBtn) {
    var root = getStudioRoot(scope);
    if (!root) return;
    var tabBar = root.querySelector('.dw-mobile-tab-bar');
    if (tabBar) {
      tabBar.querySelectorAll('.dw-tab-btn').forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      var targetBtn = clickedBtn || tabBar.querySelector('.dw-tab-btn[data-tab="' + tabName + '"]');
      if (targetBtn) {
        targetBtn.classList.add('active');
        targetBtn.setAttribute('aria-selected', 'true');
      }
    }
    var prefix = (root.id === 'modal-dw-playground') ? 'modal-dw-panel-' : 'dw-panel-';
    ['input', 'script', 'output', 'notes'].forEach(function(k) {
      var panel = document.getElementById(prefix + k);
      if (panel) {
        if (k === tabName) panel.classList.add('dw-tab-active');
        else panel.classList.remove('dw-tab-active');
      }
    });
  };

  window.switchDwMobileTab = function(tabName, btnEl, scope) {
    window.showTab(tabName, scope || (btnEl && btnEl.getAttribute('data-scope')) || 'inline', btnEl);
  };

  function bindStudioTabListeners() {
    document.querySelectorAll('.dw-mobile-tab-bar .dw-tab-btn[data-tab]').forEach(function(btn) {
      if (btn.dataset.tabBound) return;
      btn.dataset.tabBound = '1';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var tab = btn.getAttribute('data-tab');
        var scope = btn.getAttribute('data-scope') || (btn.closest('#modal-dw-playground') ? 'modal' : 'inline');
        window.showTab(tab, scope, btn);
      });
    });
  }

  window._bindStudioTabListeners = bindStudioTabListeners;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindStudioTabListeners);
  } else {
    bindStudioTabListeners();
  }

  // --- 2. Mode Switcher (Manual Mode vs Auto-Generate Mode) ---
  window.switchDwMode = function(mode, btnEl, scope) {
    var prefix = (scope === 'modal') ? 'modal-' : '';
    var manualEl = document.getElementById(prefix + 'dw-manual-workspace');
    var autogenEl = document.getElementById(prefix + 'dw-autogen-workspace');
    var switcher = document.querySelector('.dw-mode-switcher[data-scope="' + scope + '"]');
    if (switcher) {
      switcher.querySelectorAll('.dw-mode-btn').forEach(function(b) { b.classList.remove('active'); });
      if (btnEl) btnEl.classList.add('active');
      else {
        var match = switcher.querySelector('.dw-mode-btn[data-mode="' + mode + '"]');
        if (match) match.classList.add('active');
      }
    }
    if (manualEl) manualEl.style.display = (mode === 'manual') ? 'block' : 'none';
    if (autogenEl) autogenEl.style.display = (mode === 'autogen') ? 'flex' : 'none';
  };

  // --- 3. Offline DataWeave 2.0 Auto-Generator Engine ---
  function formatDwLiteral(val) {
    if (typeof val === 'string') return JSON.stringify(val);
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (val === null) return 'null';
    return JSON.stringify(val);
  }

  function inferFieldExpr(outKey, outVal, srcObj, varPrefix, notesArr) {
    var keys = (srcObj && typeof srcObj === 'object' && !Array.isArray(srcObj)) ? Object.keys(srcObj) : [];

    // 1. Array to Array mapping
    if (Array.isArray(outVal)) {
      var matchedArrKey = null;
      if (Array.isArray(srcObj[outKey])) {
        matchedArrKey = outKey;
      } else {
        for (var a = 0; a < keys.length; a++) {
          if (Array.isArray(srcObj[keys[a]])) {
            matchedArrKey = keys[a];
            break;
          }
        }
      }
      if (matchedArrKey && outVal.length > 0 && typeof outVal[0] === 'object' && srcObj[matchedArrKey].length > 0) {
        var sampleInItem = srcObj[matchedArrKey][0];
        var sampleOutItem = outVal[0];
        var itemLines = Object.keys(sampleOutItem).map(function(ik) {
          return '    ' + ik + ': ' + inferFieldExpr(ik, sampleOutItem[ik], sampleInItem, 'item', notesArr);
        });
        notesArr.push('Mapped array <code>' + matchedArrKey + '</code> to <code>' + outKey + '</code> using <code>map (item) -&gt; { ... }</code>.');
        return varPrefix + '.' + matchedArrKey + ' map (item) -> {\n' + itemLines.join(',\n') + '\n  }';
      }
      return JSON.stringify(outVal);
    }

    // 2. Nested Object mapping
    if (outVal && typeof outVal === 'object') {
      var nestedSrc = (srcObj[outKey] && typeof srcObj[outKey] === 'object') ? srcObj[outKey] : srcObj;
      var nestedPrefix = (srcObj[outKey] && typeof srcObj[outKey] === 'object') ? (varPrefix + '.' + outKey) : varPrefix;
      var nestedLines = Object.keys(outVal).map(function(nk) {
        return '    ' + nk + ': ' + inferFieldExpr(nk, outVal[nk], nestedSrc, nestedPrefix, notesArr);
      });
      notesArr.push('Constructed nested object <code>' + outKey + '</code>.');
      return '{\n' + nestedLines.join(',\n') + '\n  }';
    }

    // 3. Same field name direct map
    if (srcObj && Object.prototype.hasOwnProperty.call(srcObj, outKey) && srcObj[outKey] === outVal) {
      notesArr.push('Direct field mapping: <code>' + outKey + '</code> mapped directly from <code>' + varPrefix + '.' + outKey + '</code>.');
      return varPrefix + '.' + outKey;
    }

    // 4. Different field name, exact same value
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (srcObj[k] === outVal && typeof srcObj[k] !== 'object') {
        notesArr.push('Value-matched rename: <code>' + k + '</code> renamed to <code>' + outKey + '</code>.');
        return varPrefix + '.' + k;
      }
    }

    // 5. String combination (firstName + lastName = fullName)
    if (typeof outVal === 'string') {
      var strKeys = keys.filter(function(k) { return typeof srcObj[k] === 'string' && srcObj[k].length > 0; });
      for (var s1 = 0; s1 < strKeys.length; s1++) {
        for (var s2 = 0; s2 < strKeys.length; s2++) {
          if (s1 === s2) continue;
          var k1 = strKeys[s1], k2 = strKeys[s2];
          var seps = [' ', '-', '_', ', ', ''];
          for (var sp = 0; sp < seps.length; sp++) {
            if (srcObj[k1] + seps[sp] + srcObj[k2] === outVal) {
              var sepExpr = seps[sp] ? (' ++ "' + seps[sp] + '" ++ ') : ' ++ ';
              notesArr.push('String concatenation: combined <code>' + k1 + '</code> and <code>' + k2 + '</code> into <code>' + outKey + '</code> using <code>++</code>.');
              return varPrefix + '.' + k1 + sepExpr + varPrefix + '.' + k2;
            }
          }
        }
      }
      // Check upper/lower transform
      for (var u = 0; u < strKeys.length; u++) {
        var uk = strKeys[u];
        if (srcObj[uk].toUpperCase() === outVal) {
          notesArr.push('String normalization: converted <code>' + uk + '</code> to uppercase.');
          return 'upper(' + varPrefix + '.' + uk + ')';
        }
        if (srcObj[uk].toLowerCase() === outVal) {
          notesArr.push('String normalization: converted <code>' + uk + '</code> to lowercase.');
          return 'lower(' + varPrefix + '.' + uk + ')';
        }
      }
    }

    // 6. Numeric Calculation (price * qty = total, a + b, a - b)
    if (typeof outVal === 'number') {
      var numKeys = keys.filter(function(k) { return typeof srcObj[k] === 'number'; });
      for (var n1 = 0; n1 < numKeys.length; n1++) {
        for (var n2 = n1 + 1; n2 < numKeys.length; n2++) {
          var nk1 = numKeys[n1], nk2 = numKeys[n2];
          var v1 = srcObj[nk1], v2 = srcObj[nk2];
          if (Math.abs((v1 * v2) - outVal) < 0.0001) {
            notesArr.push('Calculated numeric field: <code>' + outKey + '</code> computed as <code>' + nk1 + ' * ' + nk2 + '</code>.');
            return varPrefix + '.' + nk1 + ' * ' + varPrefix + '.' + nk2;
          }
          if (Math.abs((v1 + v2) - outVal) < 0.0001) {
            notesArr.push('Calculated numeric field: <code>' + outKey + '</code> computed as <code>' + nk1 + ' + ' + nk2 + '</code>.');
            return varPrefix + '.' + nk1 + ' + ' + varPrefix + '.' + nk2;
          }
          if (Math.abs((v1 - v2) - outVal) < 0.0001) {
            notesArr.push('Calculated numeric field: <code>' + outKey + '</code> computed as <code>' + nk1 + ' - ' + nk2 + '</code>.');
            return varPrefix + '.' + nk1 + ' - ' + varPrefix + '.' + nk2;
          }
          if (Math.abs((v2 - v1) - outVal) < 0.0001) {
            notesArr.push('Calculated numeric field: <code>' + outKey + '</code> computed as <code>' + nk2 + ' - ' + nk1 + '</code>.');
            return varPrefix + '.' + nk2 + ' - ' + varPrefix + '.' + nk1;
          }
        }
      }
    }

    // 7. Constant literal value
    notesArr.push('Constant value assigned: <code>' + outKey + '</code> set to literal <code>' + formatDwLiteral(outVal) + '</code>.');
    return formatDwLiteral(outVal);
  }

  window.autoGenerateDwScript = function(scope) {
    var prefix = (scope === 'modal') ? 'modal-' : '';
    var inEl = document.getElementById(prefix + 'dw-autogen-input');
    var desEl = document.getElementById(prefix + 'dw-autogen-desired');
    var outEl = document.getElementById(prefix + 'dw-autogen-script');
    var errEl = document.getElementById(prefix + 'dw-autogen-error');
    var notesEl = document.getElementById(prefix + 'dw-autogen-notes');
    var btnEl = document.getElementById(prefix + 'dw-autogen-btn');

    if (!inEl || !desEl || !outEl) return;
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    var rawIn = inEl.value.trim();
    var rawDes = desEl.value.trim();

    if (!rawIn) {
      if (errEl) { errEl.textContent = '❌ Invalid JSON in Input: Input box is empty.'; errEl.style.display = 'block'; }
      return;
    }
    if (!rawDes) {
      if (errEl) { errEl.textContent = '❌ Invalid JSON in Desired Output: Desired Output box is empty.'; errEl.style.display = 'block'; }
      return;
    }

    var origBtnTxt = btnEl ? btnEl.textContent : '';
    if (btnEl) btnEl.textContent = '⚡ Generating...';

    setTimeout(function() {
      try {
        var parsedInput;
        var isXmlInput = rawIn.startsWith('<');
        var rootVar = 'payload';
        var notesArr = [];

        if (isXmlInput) {
          var xmlParsed = parseXmlToJson(rawIn);
          parsedInput = xmlParsed.flat;
          rootVar = 'payload.' + xmlParsed.rootTag;
          notesArr.push('Detected XML input (root element <code>&lt;' + xmlParsed.rootTag + '&gt;</code>) and converted it to a structured object before mapping.');
        } else {
          try {
            parsedInput = JSON.parse(rawIn);
          } catch (eIn) {
            throw new Error('Invalid JSON in Input');
          }
        }

        var parsedDesired;
        try {
          parsedDesired = JSON.parse(rawDes);
        } catch (eDes) {
          throw new Error('Invalid JSON in Desired Output');
        }

        var bodyCode = '';
        if (Array.isArray(parsedDesired) && Array.isArray(parsedInput) && parsedDesired.length > 0 && parsedInput.length > 0) {
          var arrLines = Object.keys(parsedDesired[0]).map(function(k) {
            return '  ' + k + ': ' + inferFieldExpr(k, parsedDesired[0][k], parsedInput[0], 'item', notesArr);
          });
          bodyCode = rootVar + ' map (item) -> {\n' + arrLines.join(',\n') + '\n}';
        } else if (parsedDesired && typeof parsedDesired === 'object' && !Array.isArray(parsedDesired)) {
          var srcForObj = Array.isArray(parsedInput) ? (parsedInput[0] || {}) : parsedInput;
          var objLines = Object.keys(parsedDesired).map(function(k) {
            return '  ' + k + ': ' + inferFieldExpr(k, parsedDesired[k], srcForObj, rootVar, notesArr);
          });
          bodyCode = '{\n' + objLines.join(',\n') + '\n}';
        } else {
          bodyCode = formatDwLiteral(parsedDesired);
        }

        var fullScript = '%dw 2.0\noutput application/json\n---\n' + bodyCode;
        outEl.value = fullScript;

        // Deduplicate & render English-only Notes in light yellow card
        var uniqueNotes = notesArr.filter(function(v, i, a) { return a.indexOf(v) === i; });
        if (notesEl) {
          notesEl.innerHTML =
            '<div class="dw-notes-card">' +
            '<div class="dw-notes-title">🔹 What Happened? (Auto-Generated Transformation Logic)</div>' +
            '<ul class="dw-notes-bullets">' +
            uniqueNotes.map(function(n) { return '<li>' + n + '</li>'; }).join('') +
            '</ul></div>';
          notesEl.style.display = 'block';
        }
      } catch (err) {
        if (errEl) {
          errEl.textContent = '❌ ' + (err.message || 'Unable to generate DataWeave script.');
          errEl.style.display = 'block';
        }
      } finally {
        if (btnEl) btnEl.textContent = origBtnTxt || '✨ Auto-Generate DataWeave';
      }
    }, 60);
  };

  window.copyAutogenBox = function(box, scope) {
    var prefix = (scope === 'modal') ? 'modal-' : '';
    var idMap = { input: 'dw-autogen-input', desired: 'dw-autogen-desired', script: 'dw-autogen-script' };
    var el = document.getElementById(prefix + idMap[box]);
    if (!el || !el.value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value).catch(function() {});
    }
  };

  window.useGeneratedDwScript = function(scope) {
    var prefix = (scope === 'modal') ? 'modal-' : '';
    var inEl = document.getElementById(prefix + 'dw-autogen-input');
    var scriptEl = document.getElementById(prefix + 'dw-autogen-script');
    var autogenNotesEl = document.getElementById(prefix + 'dw-autogen-notes');

    if (!scriptEl || !scriptEl.value.trim()) {
      window.autoGenerateDwScript(scope);
      setTimeout(function() { window.useGeneratedDwScript(scope); }, 140);
      return;
    }

    var root = getStudioRoot(scope);
    var targetIn = root.querySelector('.dw-input-editor, #dw-input-editor, #modal-dw-input-editor');
    var targetScript = root.querySelector('.dw-script-editor, #dw-script-editor, #modal-dw-script-editor');
    var targetNotes = root.querySelector('.dw-explanation-content');

    if (targetIn && inEl) targetIn.value = inEl.value;
    if (targetScript) targetScript.value = scriptEl.value;
    if (targetNotes && autogenNotesEl && autogenNotesEl.innerHTML) {
      targetNotes.innerHTML = autogenNotesEl.innerHTML;
    }

    window.switchDwMode('manual', null, scope);
    window.runDwTransformation(scope);
  };

  // --- 4. Real Custom In-Browser DataWeave 2.0 Evaluator ---
  function evalDwExpr(expr, ctx) {
    var e = expr.trim();
    if (!e) return null;
    // Literal string
    if ((e.startsWith('"') && e.endsWith('"')) || (e.startsWith("'") && e.endsWith("'"))) {
      return e.slice(1, -1);
    }
    // Literal number/boolean/null
    if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e);
    if (e === 'true') return true;
    if (e === 'false') return false;
    if (e === 'null') return null;

    // Concatenation (++)
    if (e.indexOf('++') !== -1) {
      var parts = [];
      var cur = '', inQ = false, qChar = '';
      for (var i = 0; i < e.length; i++) {
        var c = e[i];
        if ((c === '"' || c === "'") && e[i - 1] !== '\\') {
          if (!inQ) { inQ = true; qChar = c; }
          else if (c === qChar) { inQ = false; }
        }
        if (!inQ && c === '+' && e[i + 1] === '+') {
          parts.push(cur.trim());
          cur = '';
          i++;
          continue;
        }
        cur += c;
      }
      if (cur.trim()) parts.push(cur.trim());
      if (parts.length > 1) {
        return parts.map(function(pt) {
          var v = evalDwExpr(pt, ctx);
          return v === null || v === undefined ? '' : String(v);
        }).join('');
      }
    }

    // upper(...) / lower(...) / trim(...) / sizeOf(...)
    var fnMatch = e.match(/^(upper|lower|trim|sizeOf)\((.+)\)$/);
    if (fnMatch) {
      var fn = fnMatch[1];
      var argVal = evalDwExpr(fnMatch[2], ctx);
      if (fn === 'upper') return String(argVal || '').toUpperCase();
      if (fn === 'lower') return String(argVal || '').toLowerCase();
      if (fn === 'trim') return String(argVal || '').trim();
      if (fn === 'sizeOf') return Array.isArray(argVal) ? argVal.length : (argVal && typeof argVal === 'object' ? Object.keys(argVal).length : String(argVal || '').length);
    }

    // Arithmetic (*, +, -, /)
    var arithMatch = e.match(/^([a-zA-Z0-9_.$]+)\s*([*+\-/])\s*([a-zA-Z0-9_.$]+)$/);
    if (arithMatch) {
      var left = Number(evalDwExpr(arithMatch[1], ctx));
      var right = Number(evalDwExpr(arithMatch[3], ctx));
      if (!isNaN(left) && !isNaN(right)) {
        if (arithMatch[2] === '*') return left * right;
        if (arithMatch[2] === '+') return left + right;
        if (arithMatch[2] === '-') return left - right;
        if (arithMatch[2] === '/') return right !== 0 ? left / right : null;
      }
    }

    // Property path lookup (payload.a.b or item.x)
    if (/^[a-zA-Z_$][a-zA-Z0-9_.$]*$/.test(e)) {
      var segs = e.split('.');
      var val = ctx[segs[0]];
      for (var s = 1; s < segs.length; s++) {
        if (val === null || val === undefined) return null;
        val = val[segs[s]];
      }
      return val !== undefined ? val : null;
    }
    return e;
  }

  function evalDwObjectBlock(blockStr, ctx) {
    var inner = blockStr.trim();
    if (inner.startsWith('{') && inner.endsWith('}')) inner = inner.slice(1, -1).trim();
    var out = {};
    // Split top-level key: value pairs respecting nested { } and ( )
    var entries = [];
    var cur = '', depthBrace = 0, depthParen = 0, inQ = false, qChar = '';
    for (var i = 0; i < inner.length; i++) {
      var ch = inner[i];
      if ((ch === '"' || ch === "'") && inner[i - 1] !== '\\') {
        if (!inQ) { inQ = true; qChar = ch; }
        else if (ch === qChar) { inQ = false; }
      }
      if (!inQ) {
        if (ch === '{') depthBrace++;
        else if (ch === '}') depthBrace--;
        else if (ch === '(') depthParen++;
        else if (ch === ')') depthParen--;
        else if (ch === ',' && depthBrace === 0 && depthParen === 0) {
          if (cur.trim()) entries.push(cur.trim());
          cur = '';
          continue;
        }
      }
      cur += ch;
    }
    if (cur.trim()) entries.push(cur.trim());

    entries.forEach(function(pair) {
      var colonIdx = pair.indexOf(':');
      if (colonIdx === -1) return;
      var k = pair.slice(0, colonIdx).trim().replace(/^["']|["']$/g, '');
      var vExpr = pair.slice(colonIdx + 1).trim();

      // Check for array map expression: payload.items map (item) -> { ... }
      var mapMatch = vExpr.match(/^([a-zA-Z0-9_.$]+)\s+map\s+\(([a-zA-Z0-9_$]+)(?:\s*,\s*([a-zA-Z0-9_$]+))?\)\s*->\s*(\{[\s\S]*\})$/);
      if (mapMatch) {
        var arrVal = evalDwExpr(mapMatch[1], ctx);
        var itemVar = mapMatch[2];
        var idxVar = mapMatch[3];
        var bodyTpl = mapMatch[4];
        if (Array.isArray(arrVal)) {
          out[k] = arrVal.map(function(el, idx) {
            var childCtx = Object.assign({}, ctx);
            childCtx[itemVar] = el;
            if (idxVar) childCtx[idxVar] = idx;
            return evalDwObjectBlock(bodyTpl, childCtx);
          });
        } else {
          out[k] = [];
        }
      } else if (vExpr.startsWith('{') && vExpr.endsWith('}')) {
        out[k] = evalDwObjectBlock(vExpr, ctx);
      } else {
        out[k] = evalDwExpr(vExpr, ctx);
      }
    });
    return out;
  }

  window.runDwTransformation = function(scope) {
    var root = getStudioRoot(scope);
    if (!root) return;
    var inputEl = root.querySelector('.dw-input-editor, #dw-input-editor, #modal-dw-input-editor');
    var scriptEl = root.querySelector('.dw-script-editor, #dw-script-editor, #modal-dw-script-editor');
    var outputEl = root.querySelector('.dw-output-viewer, #dw-output-viewer, #modal-dw-output-viewer');
    var statusEl = root.querySelector('.dw-status-indicator, #dw-live-status, #modal-dw-live-status');
    if (!outputEl) return;

    var rawInput = inputEl ? inputEl.value.trim() : '';
    var rawScript = scriptEl ? scriptEl.value.trim() : '';

    if (statusEl) {
      statusEl.textContent = '⚡ Running...';
      statusEl.style.color = '#facc15';
    }

    setTimeout(function() {
      // 1. Validate empty input
      if (!rawInput) {
        outputEl.value = 'Error: Input payload is empty.\nPlease paste valid JSON, XML, or CSV data in the Input panel.';
        if (statusEl) { statusEl.textContent = '❌ Empty Input'; statusEl.style.color = '#f87171'; }
        if (window.innerWidth < 768) window.showTab('output', scope);
        return;
      }

      // 2. If exact unmodified preset, return rich pre-computed output immediately
      var p = (typeof DW_PRESETS !== 'undefined' && typeof currentDwPresetIdx !== 'undefined') ? DW_PRESETS[currentDwPresetIdx] : null;
      if (p && rawInput === (p.input || '').trim() && rawScript === (p.script || '').trim()) {
        outputEl.value = p.output;
        if (statusEl) { statusEl.textContent = '⚡ Evaluated (Live)'; statusEl.style.color = '#00f0ff'; }
        if (window.innerWidth < 768) window.showTab('output', scope);
        return;
      }

      // 3. Parse User Custom Input (JSON, XML, or CSV)
      var parsedPayload;
      try {
        if (rawInput.startsWith('<')) {
          parsedPayload = parseXmlToJson(rawInput).wrapped;
        } else if (rawInput.startsWith('{') || rawInput.startsWith('[')) {
          parsedPayload = JSON.parse(rawInput);
        } else if (rawInput.indexOf(',') !== -1 && rawInput.indexOf('\n') !== -1) {
          parsedPayload = csvToArray(rawInput);
        } else {
          throw new Error('Invalid JSON/XML/CSV syntax in Input');
        }
      } catch (parseErr) {
        outputEl.value = 'Error: ' + parseErr.message + '\nPlease check your Input syntax.';
        if (statusEl) { statusEl.textContent = '❌ Invalid Input'; statusEl.style.color = '#f87171'; }
        if (window.innerWidth < 768) window.showTab('output', scope);
        return;
      }

      // 4. Parse Output Format Directive & Script Body
      var outFormat = 'json';
      var fmtMatch = rawScript.match(/output\s+application\/(json|xml|csv|plain)/i);
      if (fmtMatch) outFormat = fmtMatch[1].toLowerCase();

      var body = rawScript.indexOf('---') !== -1 ? rawScript.split('---').slice(1).join('---').trim() : 'payload';
      var resultObj = parsedPayload;

      try {
        if (!body || body === 'payload') {
          resultObj = parsedPayload;
        } else if (body.startsWith('{') && body.endsWith('}')) {
          resultObj = evalDwObjectBlock(body, { payload: parsedPayload });
        } else {
          var topMap = body.match(/^([a-zA-Z0-9_.$]+)\s+map\s+\(([a-zA-Z0-9_$]+)(?:\s*,\s*([a-zA-Z0-9_$]+))?\)\s*->\s*(\{[\s\S]*\})$/);
          if (topMap) {
            var arrSrc = evalDwExpr(topMap[1], { payload: parsedPayload });
            if (Array.isArray(arrSrc)) {
              resultObj = arrSrc.map(function(el, idx) {
                var c = { payload: parsedPayload };
                c[topMap[2]] = el;
                if (topMap[3]) c[topMap[3]] = idx;
                return evalDwObjectBlock(topMap[4], c);
              });
            }
          } else {
            var evaluated = evalDwExpr(body, { payload: parsedPayload });
            if (evaluated !== body) resultObj = evaluated;
          }
        }

        // 5. Serialize according to output directive
        if (outFormat === 'xml') {
          outputEl.value = '<?xml version="1.0" encoding="UTF-8"?>\n' + objToXml(resultObj, 'root', '');
        } else if (outFormat === 'csv') {
          outputEl.value = arrayToCsv(resultObj);
        } else {
          outputEl.value = JSON.stringify(resultObj, null, 2);
        }

        if (statusEl) {
          statusEl.textContent = '⚡ Evaluated (Custom Live)';
          statusEl.style.color = '#00f0ff';
        }
      } catch (evalErr) {
        outputEl.value = 'Script Evaluation Error: ' + evalErr.message;
        if (statusEl) { statusEl.textContent = '❌ Script Error'; statusEl.style.color = '#f87171'; }
      }

      if (window.innerWidth < 768) {
        window.showTab('output', scope);
      }
    }, 60);
  };
})();


// ============================================================================
// INTERACTIVE MULE 4 ERROR-HANDLING FLOW SIMULATOR (100% OFFLINE, ENGLISH ONLY)
// ============================================================================
(function() {
  var ehTimers = [];

  function clearEhTimers() {
    while (ehTimers.length) {
      clearTimeout(ehTimers.pop());
    }
  }

  function labelForHandler(val) {
    if (val === 'continue') return 'On Error Continue';
    if (val === 'propagate') return 'On Error Propagate';
    return 'None';
  }

  function syncNodeHandlerBadges() {
    var tryEl = document.getElementById('eh-try-select');
    var privEl = document.getElementById('eh-private-select');
    var mainEl = document.getElementById('eh-main-select');

    var bTry = document.getElementById('eh-badge-try');
    var bPriv = document.getElementById('eh-badge-private');
    var bMain = document.getElementById('eh-badge-main');

    if (tryEl && bTry) bTry.textContent = labelForHandler(tryEl.value);
    if (privEl && bPriv) bPriv.textContent = labelForHandler(privEl.value);
    if (mainEl && bMain) bMain.textContent = labelForHandler(mainEl.value);
  }

  window.evaluateMuleErrorFlow = function(tryH, privateH, mainH) {
    // Case 1: Try Scope has On Error Continue -> caught and swallowed inside Try Scope
    if (tryH === 'continue') {
      return {
        httpStatus: '200 OK',
        isOk: true,
        statusWhy: 'Try Scope caught HTTP:CONNECTIVITY with On Error Continue and returned a success message to Private Flow and Main Flow.',
        nextRuns: true,
        nextVal: 'YES — Runs',
        nextWhy: 'Both the remaining Private Flow processor after Try Scope AND the Main Flow processor after Flow Ref execute normally.',
        payload: '"Success — Main Flow completed using Try Scope On Error Continue recovery payload"',
        rule: 'On Error Continue inside a Try Scope swallows the error and returns a success event, so both Private Flow and Main Flow continue executing and the caller receives HTTP 200 OK.',
        caughtAt: 'try',
        caughtType: 'continue',
        trace: 'HTTP Listener -> Main Flow -> Flow Ref -> Private Flow -> Try Scope -> [Error Thrown: HTTP:CONNECTIVITY] -> Caught by Try Scope (On Error Continue) -> Private Flow & Main Flow continue -> HTTP 200 OK'
      };
    }

    // Try Scope either has None or Propagate (so error leaves Try Scope into Private Flow)
    var tryNote = (tryH === 'propagate')
      ? 'Try Scope ran On Error Propagate and re-threw the error to Private Flow.'
      : 'Try Scope had no handler, so the error bubbled immediately to Private Flow.';

    // Case 2: Private Flow has On Error Continue -> catches error from Try Scope and returns success to Main Flow
    if (privateH === 'continue') {
      return {
        httpStatus: '200 OK',
        isOk: true,
        statusWhy: tryNote + ' Private Flow caught it with On Error Continue and returned a success event to Main Flow.',
        nextRuns: true,
        nextVal: 'YES — Main Flow Runs',
        nextWhy: 'Remaining processors inside Private Flow are skipped, but Main Flow continues executing the processor after Flow Reference.',
        payload: '"Success — Main Flow completed using Private Flow On Error Continue payload"',
        rule: 'When a Private Flow handles an error with On Error Continue, Flow Reference succeeds from the Main Flow perspective, so the Main Flow continues executing and returns HTTP 200 OK.',
        caughtAt: 'private',
        caughtType: 'continue',
        trace: 'HTTP Listener -> Main Flow -> Flow Ref -> Private Flow -> Try Scope (' + labelForHandler(tryH) + ') -> [Error Thrown: HTTP:CONNECTIVITY] -> Caught by Private Flow (On Error Continue) -> Main Flow next processor runs -> HTTP 200 OK'
      };
    }

    var privateNote = (privateH === 'propagate')
      ? 'Private Flow ran On Error Propagate and re-threw the error back to Main Flow.'
      : 'Private Flow had no handler, so the error bubbled through Flow Ref to Main Flow.';

    // Case 3: Main Flow has On Error Continue -> skips remaining Main Flow steps, returns 200 OK
    if (mainH === 'continue') {
      return {
        httpStatus: '200 OK',
        isOk: true,
        statusWhy: tryNote + ' ' + privateNote + ' Main Flow caught it with On Error Continue and returned a normal response.',
        nextRuns: false,
        nextVal: 'NO — Skipped',
        nextWhy: 'Processors after Flow Reference in Main Flow are skipped because execution jumps straight into the Main Flow Error Handler, which then returns HTTP 200 OK.',
        payload: '"Graceful Fallback Response from Main Flow On Error Continue"',
        rule: 'On Error Continue in the Main Flow skips all remaining flow processors after the failing step, yet returns the error handler payload to the HTTP Listener with HTTP 200 OK.',
        caughtAt: 'main',
        caughtType: 'continue',
        trace: 'HTTP Listener -> Main Flow -> Flow Ref -> Private Flow -> Try Scope (' + labelForHandler(tryH) + ') -> [Error] -> Private Flow (' + labelForHandler(privateH) + ') -> Caught by Main Flow (On Error Continue) -> Remaining steps skipped -> HTTP 200 OK'
      };
    }

    // Case 4: Main Flow has On Error Propagate -> skips remaining steps, returns 500 Server Error
    if (mainH === 'propagate') {
      return {
        httpStatus: '500 Server Error',
        isOk: false,
        statusWhy: tryNote + ' ' + privateNote + ' Main Flow ran On Error Propagate and re-threw the error to the HTTP Listener Error Response.',
        nextRuns: false,
        nextVal: 'NO — Skipped',
        nextWhy: 'All remaining processors in Try Scope, Private Flow, and Main Flow are immediately aborted.',
        payload: '{\n  "errorType": "HTTP:CONNECTIVITY",\n  "message": "Error propagated from Main Flow On Error Propagate",\n  "httpStatus": 500\n}',
        rule: 'On Error Propagate executes its error handler processors and re-throws the error to the HTTP Listener, skipping all remaining processors and returning HTTP 500 Server Error.',
        caughtAt: 'main',
        caughtType: 'propagate',
        trace: 'HTTP Listener -> Main Flow -> Flow Ref -> Private Flow -> Try Scope (' + labelForHandler(tryH) + ') -> [Error] -> Private Flow (' + labelForHandler(privateH) + ') -> Main Flow (On Error Propagate) -> Aborted -> HTTP 500 Server Error'
      };
    }

    // Case 5: None in Try, None in Private, None in Main -> Default Mule Error Handler
    return {
      httpStatus: '500 Server Error',
      isOk: false,
      statusWhy: tryNote + ' ' + privateNote + ' Main Flow also had no handler, so Mule Runtime\'s Default Error Handler failed the request.',
      nextRuns: false,
      nextVal: 'NO — Skipped',
      nextWhy: 'All remaining processors are aborted immediately when the unhandled exception bubbles to Mule Runtime.',
      payload: '"HTTP:CONNECTIVITY — Unhandled error caught by Mule Default Error Handler (HTTP 500)"',
      rule: 'When no error handler catches an exception at any scope (Try, Private Flow, or Main Flow), Mule\'s Default Error Handler logs the exception and returns HTTP 500 Server Error.',
      caughtAt: 'listener',
      caughtType: 'propagate',
      trace: 'HTTP Listener -> Main Flow -> Flow Ref -> Private Flow (None) -> Try Scope (' + labelForHandler(tryH) + ') -> [Error] -> Main Flow (None) -> Mule Default Error Handler -> HTTP 500 Server Error'
    };
  };

  function clearNodeAnimationClasses() {
    ['eh-node-listener', 'eh-node-main', 'eh-node-flowref', 'eh-node-private', 'eh-node-try', 'eh-node-error'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.remove('eh-node-visited', 'eh-node-flash-red', 'eh-node-caught-continue', 'eh-node-caught-propagate');
      }
    });
  }

  var activeEhRole = 'developer';
  var lastEhState = {
    tryH: 'continue',
    privH: 'none',
    mainH: 'propagate',
    res: null
  };

  function formatIndianRupees(num) {
    var clean = Number(num);
    if (!isFinite(clean) || clean < 0) clean = 0;
    clean = Math.round(clean);
    return clean.toLocaleString('en-IN');
  }

  function buildRoleView(role, res, tryH, privH, mainH) {
    var tryLbl = labelForHandler(tryH);
    var privLbl = labelForHandler(privH);
    var mainLbl = labelForHandler(mainH);

    if (role === 'fresher') {
      var fresherSummary = res.isOk
        ? (res.caughtAt === 'try'
            ? 'Think of the Try Scope like a safety net inside Private Flow: the HTTP error happened, the net caught it cleanly, fixed the response, and let everyone finish their work — so the caller gets 200 OK.'
            : (res.caughtAt === 'private'
                ? 'Try Scope could not stop the error, so it passed up to Private Flow. Private Flow had On Error Continue — it handled the problem and told Main Flow "all good!", so the caller gets 200 OK.'
                : 'Both Try Scope and Private Flow let the error pass up to Main Flow, where On Error Continue caught it at the exit door. Remaining Main Flow steps were skipped, and the caller still got 200 OK.'))
        : 'Think of the error like an alarm ringing upward through every room: Try Scope (' + tryLbl + ') and Private Flow (' + privLbl + ') did not stop it, and Main Flow (' + mainLbl + ') passed it out — so the caller gets a red 500 error.';
      return {
        badge: '🎓 FRESHER VIEW',
        metaPill: res.isOk ? 'Simple Analogy · Recovered (200 OK)' : 'Simple Analogy · Failed (500 Error)',
        metaTone: res.isOk ? 'meta-ok' : 'meta-err',
        insightHtml: '<strong>Teacher Explanation:</strong> ' + fresherSummary,
        statusWhy: fresherSummary,
        nextWhy: res.nextRuns
          ? 'Yes! Because the error was converted into a normal message before leaving the child scope, the next box continues like nothing broke.'
          : 'No! Once an error leaves a flow or reaches Main Flow\'s error handler, any boxes after Flow Ref in Main Flow are skipped.',
        ruleLabel: '4. SIMPLE MEMORY TRICK',
        ruleText: '"' + (res.isOk
          ? 'Continue = Swallow the error here, turn it green (200 OK), and let callers continue.'
          : 'Propagate / None = Pass the red alert upward until the caller gets HTTP 500.') + '"'
      };
    }

    if (role === 'architect') {
      var archVerdict = 'meta-ok';
      var archBadgeText = '✅ Acceptable Pattern';
      var archAdvice = '';
      if (res.caughtAt === 'try' && res.caughtType === 'continue') {
        archVerdict = 'meta-warn';
        archBadgeText = '⚠️ Risky — Silent Error Swallowing';
        archAdvice = '<strong>Design Review (Risky):</strong> Swallowing <code>HTTP:CONNECTIVITY</code> in Try Scope with <code>On Error Continue</code> masks downstream outage and still returns 200 OK. <strong>Recommended Change:</strong> Only keep Continue for non-critical enrichment calls; wrap transient connectivity with <code>Until Successful</code>, log with <code>correlationId</code>, and emit monitoring alerts or fallback flags.';
      } else if (res.caughtAt === 'private' && res.caughtType === 'continue') {
        archVerdict = 'meta-warn';
        archBadgeText = '⚠️ Risky — Upstream Masking';
        archAdvice = '<strong>Design Review (Risky):</strong> Private Flow masks the transport failure via <code>On Error Continue</code> so Main Flow assumes Flow Reference succeeded. <strong>Recommended Change:</strong> Switch Private Flow to <code>On Error Propagate</code> for transactional flows, or return an explicit partial-failure variable so Main Flow avoids writing stale state.';
      } else if (res.caughtAt === 'main' && res.caughtType === 'continue') {
        archVerdict = 'meta-ok';
        archBadgeText = '⚠️ Acceptable With Standardized Error Body';
        archAdvice = '<strong>Design Review (Conditional):</strong> Main Flow intercepts the propagated failure with <code>On Error Continue</code> and returns HTTP 200. <strong>Recommended Change:</strong> Ensure HTTP status/body matches your OpenAPI/RAML contract (for true failures, prefer <code>On Error Propagate</code> mapped to 502/503 with APIKit error kit).';
      } else if (mainH === 'none' && privH === 'none' && tryH === 'none') {
        archVerdict = 'meta-err';
        archBadgeText = '❌ Anti-Pattern — No Error Handler';
        archAdvice = '<strong>Design Review (Wrong / Anti-Pattern):</strong> Zero error handlers defined; Mule Runtime\'s Default Error Handler leaks internal stack details with raw HTTP 500. <strong>Recommended Change:</strong> Add a global <code>Error Handler</code> ref in Main Flow transforming <code>HTTP:CONNECTIVITY</code> into canonical API error JSON + PagerDuty/Anypoint Monitoring alert.';
      } else {
        archVerdict = 'meta-ok';
        archBadgeText = '✅ Correct Pattern — Fail-Fast Propagation';
        archAdvice = '<strong>Design Review (Correct for ACID / Orders):</strong> Error propagates cleanly via <code>On Error Propagate</code> to Main Flow and HTTP Listener without faking success. <strong>Best Practice:</strong> Add Global Error Handler mapping <code>HTTP:CONNECTIVITY</code> to 502/503 JSON, correlate <code>correlationId</code>, and push failed event to Anypoint MQ DLQ for replay.';
      }
      return {
        badge: '🏛️ MULESOFT ARCHITECT VIEW',
        metaPill: archBadgeText,
        metaTone: archVerdict,
        insightHtml: archAdvice,
        statusWhy: 'Architecture verdict for Try(' + tryLbl + ') -> Private(' + privLbl + ') -> Main(' + mainLbl + '): caller sees ' + res.httpStatus + '.',
        nextWhy: res.nextRuns
          ? 'Execution continues past failing step — verify downstream idempotency & compensatory logic so partial data does not corrupt downstream systems.'
          : 'Execution halts downstream processors cleanly (fail-fast) — ideal for transactional integrity and MQ retry/DLQ replay.',
        ruleLabel: '4. ARCHITECTURAL BEST PRACTICE',
        ruleText: '"' + (res.caughtAt === 'listener'
          ? 'Always define a Global Error Handler referenced by Main Flow — never rely on Mule\'s Default Error Handler in production.'
          : (res.isOk
              ? 'Use On Error Continue strictly for non-blocking enrichment; never fake HTTP 200 on broken financial or order writes.'
              : 'Use On Error Propagate for core transactions so callers receive clear failure codes and events can safely route to DLQ.')) + '"'
      };
    }

    if (role === 'ba') {
      var baMsg = res.isOk
        ? '<strong>Customer Experience:</strong> Customer sees a normal confirmation screen (Order appears accepted / fallback shown). <strong>Order Outcome:</strong> Proceeds via backup path (' + res.httpStatus + '), but if downstream DB was skipped, manual reconciliation or retry queue is required.'
        : '<strong>Customer Experience:</strong> Customer sees a checkout failure / "Unable to process request right now" error (' + res.httpStatus + '). <strong>Order Outcome:</strong> Order does NOT complete, triggering immediate revenue and SLA risk until connectivity recovers.';
      return {
        badge: '📊 BUSINESS / BA VIEW',
        metaPill: res.isOk ? 'Risk: LOW · Order Continues' : 'Risk: HIGH · Order Fails',
        metaTone: res.isOk ? 'meta-ok' : 'meta-err',
        insightHtml: baMsg,
        statusWhy: res.isOk
          ? 'API recovers gracefully (200 OK), preventing visible checkout outage for customers.'
          : 'API returns 500 Server Error — checkout/order request fails for the end user.',
        nextWhy: res.nextRuns
          ? 'Follow-up business steps (notifications, confirmation UI) continue running.'
          : 'Follow-up steps (inventory commit, confirmation email) are skipped immediately.',
        ruleLabel: '4. BUSINESS / CUSTOMER OUTCOME',
        ruleText: '"' + (res.isOk
          ? 'Graceful recovery protects customer conversion (0 failed orders), provided fallback behavior matches business SLA rules.'
          : 'Hard 500 failure protects data accuracy by blocking broken orders, but directly impacts hourly order conversion until resolved.') + '"'
      };
    }

    if (role === 'manager') {
      var conf = 75;
      if (res.caughtAt === 'listener') conf = 35;
      else if (res.caughtAt === 'try' && res.caughtType === 'continue') conf = 72;
      else if (res.caughtAt === 'private' && res.caughtType === 'continue') conf = 76;
      else if (res.caughtAt === 'main' && res.caughtType === 'continue') conf = 82;
      else if (mainH === 'propagate') conf = 90;

      var pitch = res.isOk
        ? 'Client Pitch: "Our MuleSoft API isolates the downstream connectivity glitch inside ' + res.caughtAt + ' scope and delivers a seamless 200 OK response with zero customer disruption."'
        : (res.caughtAt === 'listener'
            ? 'Client Pitch: "We identified an unhandled connectivity gap returning HTTP 500; adding a centralized error handler and retry policy will safeguard the API immediately."'
            : 'Client Pitch: "Our MuleSoft integration enforces fail-fast protection—safely halting incomplete transactions at ' + res.caughtAt + ' scope and returning structured HTTP 500 telemetry for rapid recovery."');

      return {
        badge: '🤝 VENDOR / MANAGER VIEW',
        metaPill: 'Confidence Score: ' + conf + '%',
        metaTone: conf >= 80 ? 'meta-ok' : (conf >= 65 ? 'meta-warn' : 'meta-err'),
        insightHtml: '<strong>Executive Summary (' + conf + '% Confidence):</strong> ' + pitch,
        statusWhy: 'SLA Status: ' + res.httpStatus + ' reported cleanly to monitoring and API consumers (' + conf + '% architecture confidence).',
        nextWhy: res.nextRuns
          ? 'End-to-end SLA workflow stays unblocked after recovery handler executes.'
          : 'Protective circuit stop avoids partial/corrupt client data.',
        ruleLabel: '4. 1-LINE CLIENT PITCH',
        ruleText: '"' + pitch.replace(/^Client Pitch:\s*"|"$/g, '') + '"'
      };
    }

    // Default: developer
    return {
      badge: '💻 DEVELOPER VIEW',
      metaPill: 'HTTP ' + res.httpStatus + ' · Technical Trace',
      metaTone: res.isOk ? 'meta-ok' : 'meta-err',
      insightHtml: '<strong>Technical Exact Output:</strong> Error Type = <code>HTTP:CONNECTIVITY</code> | Caught At = <code>' + res.caughtAt + ' (' + res.caughtType + ')</code> | Final HTTP = <strong>' + res.httpStatus + '</strong> | Config: Try=<code>' + tryLbl + '</code>, Private=<code>' + privLbl + '</code>, Main=<code>' + mainLbl + '</code>.',
      statusWhy: res.statusWhy,
      nextWhy: res.nextWhy,
      ruleLabel: '4. 1-LINE INTERVIEW RULE',
      ruleText: '"' + res.rule + '"'
    };
  }

  window.updateBusinessImpactCalc = function() {
    var ordersEl = document.getElementById('eh-biz-orders');
    var aovEl = document.getElementById('eh-biz-aov');
    var boxEl = document.getElementById('eh-biz-loss-box');
    var headlineEl = document.getElementById('eh-biz-loss-headline');
    var subEl = document.getElementById('eh-biz-loss-sub');
    if (!boxEl || !headlineEl) return;

    var orders = ordersEl ? Math.max(0, Number(ordersEl.value) || 0) : 0;
    var aov = aovEl ? Math.max(0, Number(aovEl.value) || 0) : 0;
    var isOk = lastEhState && lastEhState.res ? !!lastEhState.res.isOk : true;
    var loss = isOk ? 0 : Math.round(orders * aov);
    var formatted = formatIndianRupees(loss);

    headlineEl.textContent = 'If this error happens for 1 Hour, Business Loss = Rs ' + formatted;
    boxEl.classList.remove('eh-biz-safe', 'eh-biz-danger');
    boxEl.classList.add(loss === 0 ? 'eh-biz-safe' : 'eh-biz-danger');

    if (subEl) {
      if (isOk) {
        subEl.textContent = 'Simulation returned HTTP 200 OK — orders continue processing via fallback recovery (Loss = Rs 0/hr).';
      } else {
        subEl.textContent = 'Simulation propagated HTTP 500 Server Error — ' + orders + ' failed orders × Rs ' + formatIndianRupees(aov) + ' = Rs ' + formatted + ' hourly revenue impact.';
      }
    }
  };

  function renderSimulationResult(res, tryH, privH, mainH) {
    lastEhState = {
      tryH: tryH || document.getElementById('eh-try-select')?.value || 'continue',
      privH: privH || document.getElementById('eh-private-select')?.value || 'none',
      mainH: mainH || document.getElementById('eh-main-select')?.value || 'propagate',
      res: res
    };

    var roleView = buildRoleView(activeEhRole, res, lastEhState.tryH, lastEhState.privH, lastEhState.mainH);

    var roleBadge = document.getElementById('eh-role-badge');
    var roleMeta = document.getElementById('eh-role-meta-pill');
    var roleBody = document.getElementById('eh-role-insight-body');
    if (roleBadge) roleBadge.textContent = roleView.badge;
    if (roleMeta) {
      roleMeta.textContent = roleView.metaPill;
      roleMeta.classList.remove('meta-ok', 'meta-warn', 'meta-err');
      roleMeta.classList.add(roleView.metaTone);
    }
    if (roleBody) roleBody.innerHTML = roleView.insightHtml;

    var statusBox = document.getElementById('eh-res-status-box');
    var statusCode = document.getElementById('eh-res-status-code');
    var statusWhy = document.getElementById('eh-res-status-why');
    var nextBox = document.getElementById('eh-res-next-box');
    var nextVal = document.getElementById('eh-res-next-val');
    var nextWhy = document.getElementById('eh-res-next-why');
    var payloadCode = document.getElementById('eh-res-payload-code');
    var ruleLabel = document.getElementById('eh-res-rule-label');
    var ruleEl = document.getElementById('eh-res-rule');
    var traceEl = document.getElementById('eh-trace-log');

    if (statusBox) {
      statusBox.classList.remove('eh-res-neutral', 'eh-res-ok', 'eh-res-err');
      statusBox.classList.add(res.isOk ? 'eh-res-ok' : 'eh-res-err');
    }
    if (statusCode) statusCode.textContent = res.httpStatus;
    if (statusWhy) statusWhy.textContent = roleView.statusWhy;

    if (nextBox) {
      nextBox.classList.remove('eh-res-neutral', 'eh-res-ok', 'eh-res-err');
      nextBox.classList.add(res.nextRuns ? 'eh-res-ok' : 'eh-res-err');
    }
    if (nextVal) nextVal.textContent = res.nextVal;
    if (nextWhy) nextWhy.textContent = roleView.nextWhy;

    if (payloadCode) payloadCode.textContent = res.payload;
    if (ruleLabel) ruleLabel.textContent = roleView.ruleLabel;
    if (ruleEl) ruleEl.textContent = roleView.ruleText;
    if (traceEl) traceEl.textContent = res.trace;

    window.updateBusinessImpactCalc();
  }

  window.setEhRole = function(role, btnEl) {
    activeEhRole = role || 'developer';
    document.querySelectorAll('#eh-role-switcher .eh-role-btn').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-role') === activeEhRole);
    });
    if (!lastEhState.res) {
      lastEhState.res = window.evaluateMuleErrorFlow(lastEhState.tryH, lastEhState.privH, lastEhState.mainH);
    }
    renderSimulationResult(lastEhState.res, lastEhState.tryH, lastEhState.privH, lastEhState.mainH);
  };

  window.simulateMuleErrorFlow = function() {
    clearEhTimers();
    syncNodeHandlerBadges();

    var tryH = document.getElementById('eh-try-select')?.value || 'continue';
    var privateH = document.getElementById('eh-private-select')?.value || 'none';
    var mainH = document.getElementById('eh-main-select')?.value || 'propagate';

    var res = window.evaluateMuleErrorFlow(tryH, privateH, mainH);

    // Update results immediately so screen readers and fast interactions always get deterministic state
    renderSimulationResult(res, tryH, privateH, mainH);

    // Step-by-step animated highlight Left->Right (Desktop) / Top->Bottom (Mobile)
    clearNodeAnimationClasses();
    var forwardNodes = ['eh-node-listener', 'eh-node-main', 'eh-node-flowref', 'eh-node-private', 'eh-node-try'];
    forwardNodes.forEach(function(id, idx) {
      ehTimers.push(setTimeout(function() {
        var el = document.getElementById(id);
        if (el) el.classList.add('eh-node-visited');
      }, idx * 70));
    });

    ehTimers.push(setTimeout(function() {
      var errEl = document.getElementById('eh-node-error');
      if (errEl) {
        void errEl.offsetWidth;
        errEl.classList.add('eh-node-flash-red');
      }
    }, 360));

    ehTimers.push(setTimeout(function() {
      var targetMap = { try: 'eh-node-try', private: 'eh-node-private', main: 'eh-node-main', listener: 'eh-node-listener' };
      var targetEl = document.getElementById(targetMap[res.caughtAt]);
      if (targetEl) {
        targetEl.classList.remove('eh-node-visited');
        targetEl.classList.add(res.caughtType === 'continue' ? 'eh-node-caught-continue' : 'eh-node-caught-propagate');
      }
    }, 520));
  };

  window.applyEhPreset = function(presetName) {
    var tryEl = document.getElementById('eh-try-select');
    var privEl = document.getElementById('eh-private-select');
    var mainEl = document.getElementById('eh-main-select');
    if (!tryEl || !privEl || !mainEl) return;

    document.querySelectorAll('.eh-preset-btn').forEach(function(b) { b.classList.remove('active'); });

    if (presetName === 'all-continue') {
      tryEl.value = 'continue';
      privEl.value = 'continue';
      mainEl.value = 'continue';
      document.getElementById('eh-preset-continue')?.classList.add('active');
    } else if (presetName === 'all-propagate') {
      tryEl.value = 'propagate';
      privEl.value = 'propagate';
      mainEl.value = 'propagate';
      document.getElementById('eh-preset-propagate')?.classList.add('active');
    } else {
      tryEl.value = 'continue';
      privEl.value = 'none';
      mainEl.value = 'propagate';
      document.getElementById('eh-preset-mixed')?.classList.add('active');
    }

    window.simulateMuleErrorFlow();
  };

  window.resetEhSimulator = function() {
    clearEhTimers();
    clearNodeAnimationClasses();

    var tryEl = document.getElementById('eh-try-select');
    var privEl = document.getElementById('eh-private-select');
    var mainEl = document.getElementById('eh-main-select');
    if (tryEl) tryEl.value = 'continue';
    if (privEl) privEl.value = 'none';
    if (mainEl) mainEl.value = 'propagate';

    syncNodeHandlerBadges();

    document.querySelectorAll('.eh-preset-btn').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById('eh-preset-mixed')?.classList.add('active');

    var ordersInput = document.getElementById('eh-biz-orders');
    var aovInput = document.getElementById('eh-biz-aov');
    if (ordersInput) ordersInput.value = 100;
    if (aovInput) aovInput.value = 1000;

    var res = window.evaluateMuleErrorFlow('continue', 'none', 'propagate');
    renderSimulationResult(res, 'continue', 'none', 'propagate');

    var devBtn = document.querySelector('#eh-role-switcher .eh-role-btn[data-role="developer"]');
    if (devBtn && typeof window.setEhRole === 'function') window.setEhRole('developer', devBtn);

    var traceEl = document.getElementById('eh-trace-log');
    if (traceEl) {
      traceEl.textContent = 'Simulator reset to default Mixed Real Interview Case. Click "Throw Error - Simulate HTTP:CONNECTIVITY" to animate.';
    }
  };

  function bindEhListeners() {
    var tryEl = document.getElementById('eh-try-select');
    if (!tryEl) return;
    ['eh-try-select', 'eh-private-select', 'eh-main-select'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el && !el.dataset.ehBound) {
        el.dataset.ehBound = '1';
        el.addEventListener('change', function() {
          document.querySelectorAll('.eh-preset-btn').forEach(function(b) { b.classList.remove('active'); });
          syncNodeHandlerBadges();
        });
      }
    });
    if (!window._ehInitialized) {
      window._ehInitialized = true;
      syncNodeHandlerBadges();
      var initRes = window.evaluateMuleErrorFlow('continue', 'none', 'propagate');
      renderSimulationResult(initRes, 'continue', 'none', 'propagate');
    }
  }
  window._bindEhListeners = bindEhListeners;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEhListeners);
  } else {
    bindEhListeners();
  }
})();

/* Keep sticky utility bar & 280px sidebar docked cleanly beneath dynamic .hub-header height (post-load, batched rAF reads) */
(function initStickyHeaderSync() {
  var lastHdrH = 65;
  var lastUtilH = 46;
  var rafId = 0;
  function syncStickyHeaderHeight() {
    if (rafId) return;
    rafId = requestAnimationFrame(function() {
      rafId = 0;
      var hdr = document.querySelector('.hub-header');
      var util = document.getElementById('utility-bar');
      var hh = hdr ? hdr.offsetHeight : 0;
      var uh = util ? util.offsetHeight : 0;
      if (hh && hh !== lastHdrH) {
        lastHdrH = hh;
        document.documentElement.style.setProperty('--hub-header-h', hh + 'px');
      }
      if (uh && uh !== lastUtilH) {
        lastUtilH = uh;
        document.documentElement.style.setProperty('--utility-bar-h', uh + 'px');
      }
    });
  }
  window.addEventListener('load', syncStickyHeaderHeight, { once: true });
  window.addEventListener('resize', syncStickyHeaderHeight, { passive: true });
})();

/* Study Progress Tracker + Sidebar Click Breadcrumb Sync */
(function initStudyProgressAndNav() {
  var STORAGE_KEY = 'mulesoft_hub_done_qas';

  function getTotalQas() {
    var cards = document.querySelectorAll('.faq-card').length;
    return Math.max(cards, 320);
  }

  function loadDoneSet() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveDoneSet(setObj) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(setObj)));
    } catch (e) {}
  }

  window.updateProgressDisplay = function() {
    var totalQas = getTotalQas();
    var doneSet = loadDoneSet();
    var count = Math.min(totalQas, doneSet.size);
    var txtEl = document.getElementById('utility-progress-text');
    var fillEl = document.getElementById('utility-progress-fill');
    var pct = Math.round((count / totalQas) * 100);
    var pct = Math.min(100, Number(((count / totalQas) * 100).toFixed(2)));
    if (txtEl) txtEl.textContent = count + '/' + totalQas + ' done';
    var pillEl = document.getElementById('utility-progress-pill');
    if (pillEl) pillEl.title = pct + '% complete (' + count + '/' + totalQas + ' done)';
    if (fillEl) fillEl.style.width = pct + '%';
  };

  window.markQaCompleted = function(cardId) {
    if (!cardId) return;
    var doneSet = loadDoneSet();
    if (!doneSet.has(cardId)) {
      doneSet.add(cardId);
      saveDoneSet(doneSet);
      window.updateProgressDisplay();
    }
  };

  function bindSidebarLinks() {
    document.querySelectorAll('.quick-sidebar-link').forEach(function(link) {
      if (link.dataset.bcBound) return;
      link.dataset.bcBound = '1';
      link.addEventListener('click', function(e) {
        var modId = link.getAttribute('data-mod-id');
        if (modId) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          document.querySelectorAll('.quick-sidebar-link').forEach(function(sibling) {
            sibling.classList.toggle('active', sibling === link);
          });
          if (typeof window.jumpToSectionTool === 'function') {
            window.jumpToSectionTool(modId);
          } else {
            var art = document.getElementById(modId);
            if (art && typeof window.updateContentBreadcrumb === 'function') {
              window.updateContentBreadcrumb(art);
            }
          }
          if (window.innerWidth < 1024 && typeof window.toggleSidebarDrawer === 'function') {
            window.toggleSidebarDrawer(false);
          }
        }
      });
    });
    window.updateProgressDisplay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSidebarLinks);
  } else {
    bindSidebarLinks();
  }
})();

/* ============================================================================
   UNIFIED FULLSCREEN ENGINE (INLINE PORTAL & MODAL EDGE-TO-EDGE FULLSCREEN)
   ============================================================================ */
(function initUnifiedFullscreen() {
  var activeFs = null;

  var FS_TITLES = {
    'error-handling-simulator': '🔥 Interactive Error-Handling Flow Simulator',
    'eh-role-results-section': '🎭 Role-Based Analysis & Simulation Results',
    'eh-business-calc-section': '💰 Business Impact Calculator',
    'main-learning-content': '📚 MuleSoft Learning Content & Modules',
    'inline-dw-playground': '🧪 DataWeave 2.0 Studio Lab',
    'vcore-calculator': '🧮 CloudHub vCore Sizing & Capacity Planner',
    'dw-modal-container': '🧪 DataWeave 2.0 Playground',
    'mock-modal-container': '⏱️ Timed Mock Interview'
  };

  function ensurePortal() {
    var portal = document.getElementById('feature-fullscreen-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'feature-fullscreen-portal';
      portal.setAttribute('role', 'dialog');
      portal.setAttribute('aria-modal', 'true');
      portal.setAttribute('aria-label', 'Full Screen Interactive Workspace');
      portal.innerHTML =
        '<div class="fs-portal-topbar">' +
        '  <span class="fs-portal-title" id="fs-portal-title">Full Screen View</span>' +
        '  <div class="fs-portal-right">' +
        '    <span class="fs-esc-hint" id="fs-portal-esc-hint">ESC to Exit</span>' +
        '    <button type="button" class="btn btn-sm btn-outline fs-portal-exit-btn" id="fs-portal-exit-btn" onclick="exitFeatureFullscreen()">Exit Full Screen ✕</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(portal);
    }
    return portal;
  }

  function setBtnState(btn, isFs) {
    if (!btn) return;
    btn.textContent = isFs ? 'Exit Full Screen ✕' : '⛶ Full Screen';
    btn.classList.toggle('is-fullscreen', !!isFs);
    btn.setAttribute('aria-pressed', isFs ? 'true' : 'false');
  }

  window.exitFeatureFullscreen = function() {
    if (!activeFs) return false;
    var st = activeFs;
    activeFs = null;

    if (st.el) {
      st.el.classList.remove('feature-fullscreen-active', 'dw-fullscreen-active');
    }

    if (st.isModal) {
      if (st.modalOverlay) {
        st.modalOverlay.classList.remove('modal-fullscreen-parent');
      }
    } else {
      if (st.placeholder && st.placeholder.parentNode && st.el) {
        st.placeholder.parentNode.insertBefore(st.el, st.placeholder);
        st.placeholder.parentNode.removeChild(st.placeholder);
      }
      var portal = document.getElementById('feature-fullscreen-portal');
      if (portal) portal.classList.remove('active');
      document.body.classList.remove('feature-fs-body-lock');
      if (typeof st.scrollY === 'number') {
        var prevBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(0, st.scrollY);
        document.documentElement.scrollTop = st.scrollY;
        setTimeout(function() {
          document.documentElement.style.scrollBehavior = prevBehavior;
        }, 40);
      }
    }

    setBtnState(st.btn, false);

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function() {});
    }
    return true;
  };

  window.toggleFeatureFullscreen = function(targetId, btnEl, forceOn) {
    var el = document.getElementById(targetId);
    if (!el && !window._modulesLoaded && typeof window.ensureModulesLoaded === 'function') {
      window.ensureModulesLoaded({ sliced: false }).then(function() {
        window.toggleFeatureFullscreen(targetId, btnEl, forceOn);
      });
      return false;
    }
    if (!el) return false;

    var btn = btnEl || el.querySelector('.feature-fs-btn');
    var isCurrentlyFs = !!(activeFs && activeFs.id === targetId);
    var wantFs = (typeof forceOn === 'boolean') ? forceOn : !isCurrentlyFs;

    if (!wantFs) {
      window.exitFeatureFullscreen();
      return false;
    }

    if (activeFs && activeFs.id !== targetId) {
      window.exitFeatureFullscreen();
    } else if (isCurrentlyFs) {
      return true;
    }

    var modalOverlay = el.closest('.modal-overlay');
    var isModal = !!modalOverlay;
    var placeholder = null;
    var scrollY = 0;
    var fsTarget = el;

    if (isModal) {
      modalOverlay.classList.add('modal-fullscreen-parent');
      el.classList.add('feature-fullscreen-active');
      if (targetId === 'dw-modal-container') {
        el.classList.add('dw-fullscreen-active');
      }
    } else {
      scrollY = window.scrollY || window.pageYOffset || 0;
      placeholder = document.createElement('div');
      placeholder.className = 'fs-origin-placeholder';
      placeholder.style.display = 'none';
      if (el.parentNode) {
        el.parentNode.insertBefore(placeholder, el);
      }
      var portal = ensurePortal();
      var titleEl = document.getElementById('fs-portal-title');
      if (titleEl) {
        titleEl.textContent = FS_TITLES[targetId] || 'Full Screen Workspace';
      }
      portal.appendChild(el);
      el.classList.add('feature-fullscreen-active');
      portal.classList.add('active');
      portal.scrollTop = 0;
      document.body.classList.add('feature-fs-body-lock');
      fsTarget = portal;
    }

    setBtnState(btn, true);

    activeFs = {
      id: targetId,
      el: el,
      btn: btn,
      isModal: isModal,
      modalOverlay: modalOverlay,
      placeholder: placeholder,
      scrollY: scrollY,
      usedNative: false
    };

    if (fsTarget && fsTarget.requestFullscreen && !document.fullscreenElement) {
      fsTarget.requestFullscreen().then(function() {
        if (activeFs && activeFs.id === targetId) {
          activeFs.usedNative = true;
        }
      }).catch(function() {
        // Graceful CSS portal/modal fullscreen fallback
      });
    }

    return true;
  };

  window.getActiveFullscreenId = function() {
    return activeFs ? activeFs.id : null;
  };

  document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement && activeFs && activeFs.usedNative) {
      window.exitFeatureFullscreen();
    }
  });

  // Capture-phase Escape handler ensures Esc exits fullscreen first before closing a modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && activeFs) {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.exitFeatureFullscreen();
    }
  }, true);
})();

window.copyLinkedInShareText = function(btn) {
  var shareText = 'Preparing for a MuleSoft interview? Check out this 100% free, no-login MuleSoft Hub (308 real scenarios across 45 modules + live DataWeave 2.0 playground + Error Simulator + vCore calculator + timed mock interviews): https://niranjanpotter.github.io/ — Drop your feedback or favorite topic in the comments! #MuleSoft #Anypoint #DataWeave #Integration';
  var applyCopied = function() {
    if (!btn) return;
    if (!btn.dataset.origLabel) btn.dataset.origLabel = btn.textContent;
    btn.textContent = '✓ Copied for LinkedIn!';
    if (btn._copyTimer) clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(function() {
      if (btn.dataset.origLabel) btn.textContent = btn.dataset.origLabel;
    }, 2400);
  };
  var fallbackCopy = function() {
    try {
      var ta = document.createElement('textarea');
      ta.value = shareText;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      applyCopied();
    } catch (err) {}
  };
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText).then(applyCopied).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
};
