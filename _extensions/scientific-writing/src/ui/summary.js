// src/ui/summary.js — Document summary card and issue guidance.
// Built into ../scientific-writing.js by build/build-scientific-writing.mjs.

  function buildDocSummaryCard(opts) {
    var pt = LANG === 'pt';
    var sentMean = opts.sentLengths.length ? mean(opts.sentLengths) : 0;
    var sentCv   = sentMean > 0 ? opts.sentStd / sentMean : 0;
    var maxParaLen = opts.paraLengths && opts.paraLengths.length ? Math.max.apply(null, opts.paraLengths) : 0;

    function D(lines) {
      return '<span class="ws-sum-detail">' + lines.join('<br>') + '</span>';
    }
    function em(s) { return '<em>' + s + '</em>'; }
    function topList(items, limit, formatter) {
      if (!items || !items.length) return '';
      return items.slice(0, limit || 4).map(formatter || function (x) {
        return typeof x === 'string' ? x : (x.text ? x.text + (x.count ? ' ×' + x.count : '') : String(x));
      }).join(', ');
    }
    function connectorTotal(byCat) {
      byCat = byCat || {};
      return (byCat.add || 0) + (byCat.contrast || 0) + (byCat.cause || 0) + (byCat.conclusion || 0) + (byCat.time || 0);
    }
    function rhythmLabel(cv) {
      if (cv < 0.30) return pt ? 'cadência muito regular' : 'very regular cadence';
      if (cv <= 0.55) return pt ? 'cadência variada e controlada' : 'varied, controlled cadence';
      return pt ? 'cadência bastante irregular' : 'markedly uneven cadence';
    }
    function sectionCadenceLabel(cv) {
      if (cv < 0.25) return pt ? 'distribuição bem uniforme' : 'very even distribution';
      if (cv < 0.35) return pt ? 'distribuição relativamente equilibrada' : 'relatively balanced distribution';
      if (cv < 0.55) return pt ? 'distribuição desigual entre seções' : 'uneven section distribution';
      return pt ? 'distribuição fortemente concentrada' : 'strongly concentrated distribution';
    }
    function buildTextProfile() {
      var sections = opts.sections || [];
      var paraMean = opts.paraLengths && opts.paraLengths.length ? mean(opts.paraLengths) : 0;
      var minutes = Math.max(1, Math.round((opts.totalWords || 0) / READ_WPM));

      function ind(v, wThresh, aThresh) {
        return v >= aThresh ? ' ws-profile-alert' : v >= wThresh ? ' ws-profile-warn' : '';
      }
      function indLow(v, wThresh, aThresh) {
        return v <= aThresh ? ' ws-profile-alert' : v <= wThresh ? ' ws-profile-warn' : '';
      }
      function pval(text, cls) {
        return '<span class="ws-profile-val' + (cls || '') + '">' + escapeHTML(String(text)) + '</span>';
      }
      function row(label, vals) {
        return '<div class="ws-profile-row">' +
          '<span class="ws-profile-label">' + escapeHTML(label) + '</span>' +
          '<span class="ws-profile-vals">' + vals + '</span>' +
          '</div>';
      }
      function fleschLabel(f) {
        if (f == null) return '';
        if (f >= 70) return pt ? ' — fácil' : ' — easy';
        if (f >= 60) return pt ? ' — relativamente fácil' : ' — fairly easy';
        if (f >= 50) return pt ? ' — padrão' : ' — standard';
        if (f >= 30) return pt ? ' — difícil' : ' — difficult';
        return pt ? ' — muito difícil' : ' — very difficult';
      }

      var DOT = ' \xb7 ';
      var readability = opts.readability || {};
      var fleschVal = typeof readability.flesch === 'number' ? readability.flesch : null;
      var fleschCls = fleschVal != null ? indLow(fleschVal, 50, 30) : '';
      var cvCls = sentCv >= 0.55 ? ' ws-profile-alert' : sentCv < 0.30 ? ' ws-profile-warn' : '';
      var longRateCls = ind(opts.longSentenceRate || 0, 6, 20);
      var lexCls = indLow(opts.lexDiv || 0, 55, 40);
      var passiveCls = ind(opts.passiveTotal || 0, 20, 40);
      var passiveDensity = opts.totalWords ? round1((opts.passiveTotal || 0) / opts.totalWords * 1000) : 0;
      var sectionCv = (opts.sectionBalance && opts.sectionBalance.cv) || 0;
      var sectionCvCls = ind(sectionCv, 0.35, 0.55);
      var byCat = opts.connectorByCat || {};
      var catCount = ['add', 'contrast', 'cause', 'conclusion', 'time'].filter(function (c) { return (byCat[c] || 0) > 0; }).length;
      var catCls = catCount <= 1 ? ' ws-profile-warn' : '';
      var unusedRefCount = (opts.referencesDefined > 0 && opts.referencesUsed < opts.referencesDefined)
        ? opts.referencesDefined - opts.referencesUsed : 0;
      var refCls = unusedRefCount > 0 ? ' ws-profile-warn' : '';
      var figRefd = opts.figureCrossRefs != null ? opts.figureCrossRefs : null;
      var figCls = (figRefd != null && figRefd < (opts.figuresTotal || 0)) ? ' ws-profile-warn' : '';

      var rows =
        row(pt ? 'Documento' : 'Document',
          pval((opts.totalWords || 0).toLocaleString() + (pt ? 'p' : 'w')) +
          DOT + pval(sections.length + (pt ? ' seções' : ' sections')) +
          DOT + '~' + pval(minutes + ' min read')) +
        row(pt ? 'Frases' : 'Sentences',
          (pt ? 'méd ' : 'avg ') + pval(round1(sentMean) + (pt ? 'p' : 'w')) +
          DOT + 'max ' + pval((opts.maxSentLen || 0) + (pt ? 'p' : 'w')) +
          DOT + 'CV ' + pval(round1(sentCv) + ' — ' + rhythmLabel(sentCv), cvCls) +
          DOT + pval(round1(opts.longSentenceRate || 0) + '% long', longRateCls)) +
        row(pt ? 'Parágrafos' : 'Paragraphs',
          (pt ? 'méd ' : 'avg ') + pval(round1(paraMean) + (pt ? 'p' : 'w')) +
          DOT + 'max ' + pval(maxParaLen + (pt ? 'p' : 'w'), maxParaLen > PARA_LONG ? ' ws-profile-warn' : '') +
          ((opts.longParagraphCount || 0) > 0 ? DOT + pval(opts.longParagraphCount + (pt ? ' longos' : ' long'), ' ws-profile-warn') : '') +
          DOT + (pt ? 'seções CV ' : 'sections CV ') + pval(round1(sectionCv) + ' — ' + sectionCadenceLabel(sectionCv), sectionCvCls)) +
        row(pt ? 'Legibilidade' : 'Readability',
          'Flesch ' + pval((fleschVal != null ? fleschVal : '—') + fleschLabel(fleschVal), fleschCls) +
          DOT + 'Grade ' + pval(readability.grade != null ? readability.grade : '—') +
          DOT + 'Fog ' + pval(readability.fog != null ? readability.fog : '—')) +
        row('Style',
          (pt ? 'div ' : 'div ') + pval((opts.lexDiv || 0) + '%', lexCls) +
          DOT + pval((opts.passiveTotal || 0) + ' passive (' + passiveDensity + '‰)', passiveCls) +
          DOT + pval((opts.hedgeCount || 0) + (pt ? ' aten' : ' hedges')) +
          DOT + pval((opts.connectorCount || 0) + ' connectors · ' + catCount + '/5 cat', catCls)) +
        row(pt ? 'Evidências' : 'Evidence',
          pval((opts.citationsTotal || 0) + (pt ? ' cit' : ' citations')) +
          DOT + pval((opts.referencesUsed || 0) + '/' + (opts.referencesDefined || 0) + ' refs' +
            (unusedRefCount > 0 ? ' (' + unusedRefCount + (pt ? ' não usadas' : ' unused') + ')' : ''), refCls) +
          (figRefd != null
            ? DOT + pval(figRefd + '/' + (opts.figuresTotal || 0) + (pt ? ' figs ref.' : ' figs cross-ref\'d'), figCls)
            : DOT + pval((opts.figuresTotal || 0) + ' figs')) +
          DOT + pval((opts.tablesTotal || 0) + (pt ? ' tab' : ' tables')));

      var sectionWords = sections.map(function (s) {
        var title = s.title || (pt ? 'Seção' : 'Section');
        var share = opts.totalWords ? Math.round(((s.words || 0) / opts.totalWords) * 100) : 0;
        return '<span class="ws-sum-section-pill">' +
          '<strong>' + escapeHTML(title) + '</strong> ' +
          escapeHTML(String(s.words || 0)) + (pt ? 'p' : 'w') +
          ' \xb7 ' + escapeHTML(String(share)) + '%' +
          (s.sentences ? ' \xb7 ' + escapeHTML(String(s.sentences)) + (pt ? 'fr' : 's') : '') +
          (s.avgSentence ? ' \xb7 ' + escapeHTML(round1(s.avgSentence) + (pt ? 'p/fr' : 'w/s')) : '') +
        '</span>';
      }).join('');

      return '<div class="ws-sum-profile">' +
        '<div class="ws-sum-section-label ws-sum-section-profile">' + (pt ? 'Perfil do texto' : 'Text profile') + '</div>' +
        '<div class="ws-profile-grid">' + rows + '</div>' +
        (sectionWords ? '<div class="ws-sum-section-words">' + sectionWords + '</div>' : '') +
      '</div>';
    }

    var issues = [];

    // Frases longas
    if (opts.longSentenceRate >= 6) {
      issues.push({ level: opts.longSentenceRate >= 20 ? 'alert' : 'warn',
        text: pt
          ? round1(opts.longSentenceRate) + '% das frases superam ' + SENT_LONG + ' palavras (max detectado: ' + opts.maxSentLen + 'p)'
          : round1(opts.longSentenceRate) + '% of sentences exceed ' + SENT_LONG + ' words (longest detected: ' + opts.maxSentLen + 'w)',
        detail: pt
          ? D(['· divida em conjunções coordenativas: ' + em('e, mas, pois, portanto, porém'),
               '· elimine orações relativas encadeadas: ' + em('"…que foi então submetido…" → frase separada'),
               '· nominalizações inflam frases — prefira verbos: ' + em('"a análise foi realizada" → "analisamos"'),
               '· meta: 15–25 palavras por frase para máxima legibilidade'])
          : D(['· split at coordinating conjunctions: ' + em('and, but, so, yet, therefore'),
               '· break stacked relative clauses: ' + em('"…which was then submitted…" → separate sentence'),
               '· nominalizations inflate length — prefer verbs: ' + em('"an analysis was performed" → "we analyzed"'),
               '· target: 15–25 words per sentence for best readability']) });
    }

    // Complexidade sintática
    if (opts.complexSentenceRate >= 12 || opts.complexSentenceCount > 8) {
      issues.push({ level: opts.complexSentenceRate >= 28 ? 'alert' : 'warn',
        text: pt
          ? opts.complexSentenceCount + (opts.complexSentenceCount === 1 ? ' frase complexa detectada' : ' frases complexas detectadas') + ' (' + round1(opts.complexSentenceRate || 0) + '%)'
          : opts.complexSentenceCount + (opts.complexSentenceCount === 1 ? ' complex sentence detected' : ' complex sentences detected') + ' (' + round1(opts.complexSentenceRate || 0) + '%)',
        detail: pt
          ? D(['· procure cadeias com "que", "quando", "embora", "enquanto" e múltiplas vírgulas',
               '· separe condição, método e resultado em frases distintas',
               '· mantenha uma oração principal clara antes de qualificadores longos',
               '· use o card "frases complexas" para destacar os trechos'])
          : D(['· look for chains with "which", "that", "although", "whereas" and multiple commas',
               '· separate condition, method, and result into distinct sentences',
               '· keep a clear main clause before long qualifiers',
               '· use the complex-sentence card to highlight passages']) });
    }

    // Frases sem verbo principal claro
    if (opts.noVerbCount > 0) {
      issues.push({ level: opts.noVerbCount > 4 ? 'alert' : 'warn',
        text: pt
          ? opts.noVerbCount + (opts.noVerbCount === 1 ? ' frase sem' : ' frases sem') + ' verbo principal claro'
          : opts.noVerbCount + (opts.noVerbCount === 1 ? ' sentence has' : ' sentences have') + ' no clear main verb',
        detail: pt
          ? D(['· verifique fragmentos em legendas, listas e frases iniciadas por abreviações',
               '· transforme rótulos em afirmações completas quando estiverem no corpo do texto',
               '· garanta sujeito + verbo + complemento em resultados e conclusões'])
          : D(['· check fragments in captions, lists, and abbreviation-led sentences',
               '· turn labels into full claims when they appear in body prose',
               '· ensure subject + verb + complement in Results and Conclusions']) });
    }

    // Legibilidade global
    if (opts.readability && (opts.readability.flesch < 45 || opts.readability.grade > 16 || opts.readability.fog > 18)) {
      var readAlert = opts.readability.flesch < 30 || opts.readability.grade > 20 || opts.readability.fog > 22;
      issues.push({ level: readAlert ? 'alert' : 'warn',
        text: pt
          ? 'Legibilidade difícil: Flesch ' + opts.readability.flesch + ', grade ' + opts.readability.grade + ', fog ' + opts.readability.fog
          : 'Difficult readability: Flesch ' + opts.readability.flesch + ', grade ' + opts.readability.grade + ', fog ' + opts.readability.fog,
        detail: pt
          ? D(['· priorize frases longas, palavras complexas e nominalizações',
               '· artigos científicos aceitam densidade, mas valores extremos atrasam revisão',
               '· reduza uma ideia secundária por frase antes de trocar terminologia técnica'])
          : D(['· prioritize long sentences, complex words, and nominalizations',
               '· scientific articles tolerate density, but extreme scores slow review',
               '· remove one secondary idea per sentence before changing technical terms']) });
    }

    // Ritmo irregular
    if (sentCv > 0.55) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Variação alta no comprimento das frases (CV ' + round1(sentCv) + ') — ritmo pode ser irregular'
          : 'High sentence length variation (CV ' + round1(sentCv) + ') — rhythm may feel uneven',
        detail: pt
          ? D(['· alterne: frase curta de impacto (8–12p) seguida de análise mais longa',
               '· evite sequências de 4+ frases com comprimento parecido',
               '· frases curtas no final de parágrafo reforçam a conclusão',
               '· meta: CV entre 0.30 e 0.55'])
          : D(['· alternate: short punchy sentence (8–12w) followed by a longer analytical one',
               '· avoid runs of 4+ sentences of similar length',
               '· short sentences at paragraph end reinforce the conclusion',
               '· target: CV between 0.30 and 0.55']) });
    }

    // Parágrafos longos
    if (opts.longParagraphCount > 0) {
      issues.push({ level: opts.longParagraphCount > 2 ? 'alert' : 'warn',
        text: pt
          ? opts.longParagraphCount + (opts.longParagraphCount === 1 ? ' parágrafo excede' : ' parágrafos excedem') + ' ' + PARA_LONG + ' palavras (max: ' + maxParaLen + 'p)'
          : opts.longParagraphCount + (opts.longParagraphCount === 1 ? ' paragraph exceeds' : ' paragraphs exceed') + ' ' + PARA_LONG + ' words (max: ' + maxParaLen + 'w)',
        detail: pt
          ? D(['· a primeira frase deve enunciar o tópico; a última deve concluí-lo',
               '· divida onde houver mudança de subtópico ou evidência nova',
               '· use um conector de abertura na frase inicial do segundo parágrafo',
               '· parágrafo ideal: 3–6 frases desenvolvendo uma ideia central'])
          : D(['· first sentence states the topic; last sentence closes it',
               '· split where a new sub-topic or piece of evidence begins',
               '· open the second paragraph with a transition connector',
               '· ideal paragraph: 3–6 sentences developing one central idea']) });
    }

    // Gaps de coesão
    if (opts.cohesionGaps > 0) {
      issues.push({ level: opts.cohesionGaps > 3 ? 'alert' : 'warn',
        text: pt
          ? opts.cohesionGaps + (opts.cohesionGaps === 1 ? ' parágrafo sem' : ' parágrafos sem') + ' conector de abertura após parágrafo longo'
          : opts.cohesionGaps + (opts.cohesionGaps === 1 ? ' paragraph missing' : ' paragraphs missing') + ' an opening connector after a multi-sentence paragraph',
        detail: pt
          ? D(['· aditivo ' + em('(continua o raciocínio)') + ': ' + em('além disso, também, ademais, igualmente'),
               '· contraste ' + em('(nova perspectiva)') + ': ' + em('porém, entretanto, no entanto, todavia'),
               '· causa/efeito ' + em('(relação lógica)') + ': ' + em('portanto, assim, por isso, consequentemente'),
               '· temporal ' + em('(sequência)') + ': ' + em('em seguida, posteriormente, então, nesse momento'),
               '· conclusão ' + em('(fechamento)') + ': ' + em('em suma, dessa forma, assim sendo, diante disso')])
          : D(['· additive ' + em('(continues reasoning)') + ': ' + em('furthermore, in addition, also, moreover'),
               '· contrast ' + em('(new perspective)') + ': ' + em('however, nevertheless, yet, on the other hand'),
               '· causal ' + em('(logical link)') + ': ' + em('therefore, because, thus, consequently'),
               '· temporal ' + em('(sequence)') + ': ' + em('subsequently, then, following this, at this stage'),
               '· conclusion ' + em('(closing)') + ': ' + em('in summary, thus, overall, taken together')]) });
    }

    // Aberturas repetidas de parágrafo
    if (opts.paraOpeningRepeats && opts.paraOpeningRepeats.length > 0) {
      var paraOpenList = topList(opts.paraOpeningRepeats, 4, function (x) { return (x.word || x.start || x.text) + ' ×' + x.count; });
      issues.push({ level: opts.paraOpeningRepeats.length > 4 ? 'alert' : 'warn',
        text: pt
          ? opts.paraOpeningRepeats.length + (opts.paraOpeningRepeats.length === 1 ? ' abertura de parágrafo repetida' : ' aberturas de parágrafo repetidas')
          : opts.paraOpeningRepeats.length + (opts.paraOpeningRepeats.length === 1 ? ' repeated paragraph opening' : ' repeated paragraph openings'),
        detail: pt
          ? D((paraOpenList ? ['· exemplos: ' + em(paraOpenList)] : []).concat([
               '· varie a função da primeira frase: contexto, contraste, resultado, consequência',
               '· quando a repetição for intencional, mantenha só em blocos paralelos',
               '· conectores diferentes ajudam a explicitar a progressão lógica']))
          : D((paraOpenList ? ['· examples: ' + em(paraOpenList)] : []).concat([
               '· vary the function of first sentences: context, contrast, result, consequence',
               '· when repetition is intentional, keep it only in parallel blocks',
               '· varied connectors make the logical progression explicit'])) });
    }

    // Cobertura conceitual das seções
    if ((opts.conceptCoverageAvg > 0 && opts.conceptCoverageAvg < 70) || opts.conceptMissingTotal > 0 || (opts.conceptWeakSections || []).length > 0) {
      var weakSections = topList(opts.conceptWeakSections || [], 5);
      issues.push({ level: opts.conceptCoverageAvg < 50 || opts.conceptMissingTotal > 5 ? 'alert' : 'warn',
        text: pt
          ? 'Cobertura conceitual incompleta: ' + (opts.conceptCoverageAvg || 0) + '% média, ' + (opts.conceptMissingTotal || 0) + ' lacunas'
          : 'Incomplete concept coverage: ' + (opts.conceptCoverageAvg || 0) + '% average, ' + (opts.conceptMissingTotal || 0) + ' gaps',
        detail: pt
          ? D((weakSections ? ['· seções frágeis: ' + em(weakSections)] : []).concat([
               '· Introdução deve explicitar lacuna, objetivo e relevância',
               '· Métodos deve cobrir desenho, amostra, análise e reprodutibilidade',
               '· Resultados precisa de achados quantitativos; Discussão precisa interpretação, limitações e implicações']))
          : D((weakSections ? ['· weak sections: ' + em(weakSections)] : []).concat([
               '· Introduction should state gap, objective, and significance',
               '· Methods should cover design, sample, analysis, and reproducibility',
               '· Results need quantitative findings; Discussion needs interpretation, limitations, and implications'])) });
    }

    // Lacunas de citação (Introdução / Discussão)
    if (opts.citationGapCount > 0) {
      issues.push({ level: opts.citationGapCount > 2 ? 'alert' : 'warn',
        text: pt
          ? opts.citationGapCount + (opts.citationGapCount === 1 ? ' parágrafo da Introdução/Discussão' : ' parágrafos da Introdução/Discussão') + ' sem citação detectada'
          : opts.citationGapCount + (opts.citationGapCount === 1 ? ' Introduction/Discussion paragraph' : ' Introduction/Discussion paragraphs') + ' without a detected citation',
        detail: pt
          ? D(['· toda afirmação de contexto ou interpretação deve ser ancorada',
               '· insira com ' + em('@chave') + ' — Quarto converte automaticamente para o estilo da revista',
               '· Introdução: cite ao estabelecer gaps; Discussão: cite ao comparar achados',
               '· parágrafos sinalizados estão destacados no painel de coesão'])
          : D(['· every context claim or interpretive statement needs a literature anchor',
               '· insert with ' + em('@citationKey') + ' — Quarto renders it to the journal\'s citation style',
               '· Introduction: cite when establishing gaps; Discussion: cite when comparing findings',
               '· flagged paragraphs are highlighted in the cohesion panel']) });
    }

    // Citações em Resultados
    if (opts.resultsCitationCount > 0) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.resultsCitationCount + (opts.resultsCitationCount === 1 ? ' parágrafo de Resultados' : ' parágrafos de Resultados') + ' com citação bibliográfica'
          : opts.resultsCitationCount + (opts.resultsCitationCount === 1 ? ' Results paragraph' : ' Results paragraphs') + ' contains a bibliographic citation',
        detail: pt
          ? D(['· Resultados relata dados e achados — não compara com literatura',
               '· mova a citação para a Discussão, onde ela serve de contraponto ou suporte',
               '· exceção aceitável: validação de protocolo metodológico na própria seção',
               '· se necessário, combine Results+Discussion em uma única seção'])
          : D(['· Results reports data and findings — it does not compare to prior literature',
               '· move the citation to Discussion where it serves as support or counterpoint',
               '· acceptable exception: method protocol validation within the same section',
               '· if needed, combine Results+Discussion into a single section']) });
    }

    // Variáveis não usadas
    if (opts.unusedVars && opts.unusedVars.length > 0) {
      var unusedList = opts.unusedVars.join(', ');
      issues.push({ level: 'alert',
        text: pt
          ? opts.unusedVars.length + (opts.unusedVars.length === 1 ? ' variável definida' : ' variáveis definidas') + ' em _variables.yml mas não referenciada' + (opts.unusedVars.length === 1 ? '' : 's') + ' no texto'
          : opts.unusedVars.length + (opts.unusedVars.length === 1 ? ' variable defined' : ' variables defined') + ' in _variables.yml but not referenced in text',
        detail: pt
          ? D(['· variáveis: ' + em(unusedList),
               '· referencie com ' + em('{{&lt; var nome &gt;}}') + ' no local do valor numérico',
               '· se a variável foi renomeada na análise, atualize a chave em ' + em('_variables.yml'),
               '· se não for mais necessária, remova para evitar confusão'])
          : D(['· variables: ' + em(unusedList),
               '· reference with ' + em('{{&lt; var name &gt;}}') + ' at the location of the numeric value',
               '· if the variable was renamed in the analysis, update the key in ' + em('_variables.yml'),
               '· if no longer needed, remove it to avoid confusion']) });
    }

    // Evidências não parametrizadas
    if (opts.evidenceUnparameterized > 0) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.evidenceUnparameterized + (opts.evidenceUnparameterized === 1 ? ' valor numérico' : ' valores numéricos') + ' hardcoded sem variável associada'
          : opts.evidenceUnparameterized + (opts.evidenceUnparameterized === 1 ? ' hardcoded numeric value' : ' hardcoded numeric values') + ' without a variable binding',
        detail: pt
          ? D(['· defina em ' + em('_variables.yml') + ': ' + em('nome_da_variavel: 42.3'),
               '· insira no texto: ' + em('{{&lt; var nome_da_variavel &gt;}}'),
               '· se o dado mudar na análise, basta atualizar o arquivo YAML',
               '· os valores estão destacados no painel de evidências'])
          : D(['· define in ' + em('_variables.yml') + ': ' + em('variable_name: 42.3'),
               '· insert in text: ' + em('{{&lt; var variable_name &gt;}}'),
               '· if the value changes in the analysis, only the YAML file needs updating',
               '· the values are highlighted in the evidence panel']) });
    }

    // Evidências numéricas sem citação próxima
    if (opts.evidenceHardcoded > 0) {
      issues.push({ level: opts.evidenceHardcoded > 12 ? 'alert' : 'warn',
        text: pt
          ? opts.evidenceHardcoded + (opts.evidenceHardcoded === 1 ? ' evidência numérica' : ' evidências numéricas') + ' sem citação bibliográfica próxima'
          : opts.evidenceHardcoded + (opts.evidenceHardcoded === 1 ? ' numeric evidence item' : ' numeric evidence items') + ' without a nearby bibliographic citation',
        detail: pt
          ? D(['· cite a fonte de valores importados da literatura',
               '· para achados próprios, garanta que a frase deixe claro que o dado vem deste estudo',
               '· valores parametrizados resolvem atualização; citações resolvem rastreabilidade',
               '· revise o painel de Evidências antes da submissão'])
          : D(['· cite the source for values imported from literature',
               '· for original findings, make clear that the value comes from this study',
               '· parameterization solves updating; citations solve traceability',
               '· review the Evidence panel before submission']) });
    }

    // Baixa densidade de evidência
    if (opts.totalWords >= 800 && opts.evidenceDensity < 3) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Baixa densidade de evidências detectáveis: ' + round1(opts.evidenceDensity || 0) + '/1000p'
          : 'Low detectable evidence density: ' + round1(opts.evidenceDensity || 0) + '/1000w',
        detail: pt
          ? D(['· verifique se afirmações centrais estão acompanhadas por números, tabelas, figuras ou citações',
               '· se o manuscrito for conceitual/qualitativo, esse alerta pode ser menos relevante',
               '· em Resultados, prefira achados quantificados a descrições genéricas'])
          : D(['· check whether central claims are supported by numbers, tables, figures, or citations',
               '· if the manuscript is conceptual/qualitative, this warning may be less relevant',
               '· in Results, prefer quantified findings over generic descriptions']) });
    }

    // Referências citadas mas não definidas
    if (opts.undefinedRefs && opts.undefinedRefs.length > 0) {
      var undefRefList = topList(opts.undefinedRefs, 5);
      issues.push({ level: 'alert',
        text: pt
          ? opts.undefinedRefs.length + (opts.undefinedRefs.length === 1 ? ' citação aponta' : ' citações apontam') + ' para chave ausente no ref.bib'
          : opts.undefinedRefs.length + (opts.undefinedRefs.length === 1 ? ' citation points' : ' citations point') + ' to a key missing from ref.bib',
        detail: pt
          ? D(['· chaves: ' + em(undefRefList),
               '· adicione as entradas ao .bib ou corrija a grafia da chave',
               '· esse problema costuma quebrar renderizações e referências finais'])
          : D(['· keys: ' + em(undefRefList),
               '· add entries to the .bib file or correct the citation key spelling',
               '· this often breaks rendering and final reference lists']) });
    }

    // Figuras/tabelas presentes mas não referenciadas
    if ((opts.figureMissing && opts.figureMissing.length) || (opts.tableMissing && opts.tableMissing.length)) {
      var missingBits = [];
      if (opts.figureMissing && opts.figureMissing.length) missingBits.push((pt ? 'figuras: ' : 'figures: ') + topList(opts.figureMissing, 4));
      if (opts.tableMissing && opts.tableMissing.length) missingBits.push((pt ? 'tabelas: ' : 'tables: ') + topList(opts.tableMissing, 4));
      issues.push({ level: 'alert',
        text: pt
          ? 'Figuras ou tabelas aparecem sem chamada no texto'
          : 'Figures or tables appear without an in-text callout',
        detail: pt
          ? D(['· ' + em(missingBits.join(' | ')),
               '· todo elemento visual deve ser citado antes ou perto de sua apresentação',
               '· use @fig-id e @tbl-id para manter a numeração automática'])
          : D(['· ' + em(missingBits.join(' | ')),
               '· every visual element should be cited before or near its appearance',
               '· use @fig-id and @tbl-id to keep numbering automatic']) });
    }

    // Order breaks de figuras
    if (opts.figureOrderIssues > 0) {
      var figExamples = opts.figureOrderExamples && opts.figureOrderExamples.length
        ? opts.figureOrderExamples.slice(0, 4).join(', ') : '';
      issues.push({ level: 'alert',
        text: pt
          ? opts.figureOrderIssues + (opts.figureOrderIssues === 1 ? ' quebra de ordem' : ' quebras de ordem') + ' nas referências de figuras'
          : opts.figureOrderIssues + (opts.figureOrderIssues === 1 ? ' figure reference' : ' figure references') + ' out of sequence',
        detail: pt
          ? D((figExamples ? ['· quebras detectadas: ' + em(figExamples)] : []).concat([
               '· figuras devem ser citadas em ordem crescente conforme surgem no texto',
               '· verifique se figuras foram renumeradas na análise sem atualizar o manuscrito',
               '· use o painel de cross-references para navegar até cada referência']))
          : D((figExamples ? ['· detected breaks: ' + em(figExamples)] : []).concat([
               '· figures must be cited in ascending order as they appear in text',
               '· check if figures were renumbered in analysis without updating the manuscript',
               '· use the cross-references panel to navigate to each reference'])) });
    }

    // Order breaks de tabelas
    if (opts.tableOrderIssues > 0) {
      var tblExamples = opts.tableOrderExamples && opts.tableOrderExamples.length
        ? opts.tableOrderExamples.slice(0, 4).join(', ') : '';
      issues.push({ level: 'alert',
        text: pt
          ? opts.tableOrderIssues + (opts.tableOrderIssues === 1 ? ' quebra de ordem' : ' quebras de ordem') + ' nas referências de tabelas'
          : opts.tableOrderIssues + (opts.tableOrderIssues === 1 ? ' table reference' : ' table references') + ' out of sequence',
        detail: pt
          ? D((tblExamples ? ['· quebras detectadas: ' + em(tblExamples)] : []).concat([
               '· tabelas devem ser citadas em ordem crescente conforme surgem no texto',
               '· verifique se tabelas foram renumeradas na análise sem atualizar o manuscrito',
               '· use o painel de cross-references para navegar até cada referência']))
          : D((tblExamples ? ['· detected breaks: ' + em(tblExamples)] : []).concat([
               '· tables must be cited in ascending order as they appear in text',
               '· check if tables were renumbered in analysis without updating the manuscript',
               '· use the cross-references panel to navigate to each reference'])) });
    }

    // Tamanho do abstract
    if (opts.abstractWordCount > 0 && (opts.abstractWordCount < 150 || opts.abstractWordCount > 300)) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Abstract com ' + opts.abstractWordCount + ' palavras — faixa típica: 150–300'
          : 'Abstract has ' + opts.abstractWordCount + ' words — typical range: 150–300',
        detail: pt
          ? D(['· se estiver curto, acrescente resultado quantitativo e implicação',
               '· se estiver longo, remova contexto secundário e detalhes de método',
               '· sempre confirme o limite específico da revista'])
          : D(['· if it is short, add a quantitative result and implication',
               '· if it is long, remove secondary context and method details',
               '· always confirm the target journal limit']) });
    }

    // Cobertura do abstract
    if (opts.abstractWordCount > 0 && opts.abstractCoverage.score < 75) {
      var missItems = opts.abstractCoverage.missing || [];
      var abstractHints = pt
        ? { objective:   'objetivo — ' + em('Este estudo visa…, O objetivo foi…, Buscou-se…'),
            method:      'método — ' + em('foram avaliados…, utilizou-se…, o experimento consistiu em…'),
            result:      'resultado — ' + em('os resultados indicam…, observou-se…, verificou-se que…'),
            conclusion:  'conclusão — ' + em('conclui-se que…, os dados sugerem…, portanto…') }
        : { objective:   'objective — ' + em('This study aims to…, The purpose was…, We sought to…'),
            method:      'method — ' + em('We used…, Samples were collected…, The experiment consisted of…'),
            result:      'result — ' + em('Results showed…, We found…, It was observed that…'),
            conclusion:  'conclusion — ' + em('We conclude…, The data suggest…, Therefore…') };
      issues.push({ level: opts.abstractCoverage.score < 50 ? 'alert' : 'warn',
        text: pt
          ? 'Abstract cobre ' + opts.abstractCoverage.score + '% dos elementos esperados (objetivo, método, resultado, conclusão)'
          : 'Abstract covers ' + opts.abstractCoverage.score + '% of expected elements (objective, method, result, conclusion)',
        detail: D(missItems.length
          ? (pt ? ['· elementos ausentes:'] : ['· missing elements:']).concat(missItems.map(function(m) {
              return '&nbsp;&nbsp;– ' + (abstractHints[m] || em(m));
            }))
          : (pt ? ['· revise os sinalizadores de presença de cada elemento'] : ['· review signal phrases for each element'])) });
    }

    // Equilíbrio entre seções
    if (opts.sectionBalance.cv >= 0.35) {
      var outliers = opts.sectionBalance.outliers || [];
      issues.push({ level: opts.sectionBalance.cv >= 0.55 ? 'alert' : 'warn',
        text: pt
          ? 'Desequilíbrio entre seções — CV ' + opts.sectionBalance.cv
          : 'Section length imbalance — CV ' + opts.sectionBalance.cv,
        detail: pt
          ? D((outliers.length ? ['· seções discrepantes: ' + em(outliers.slice(0, 3).join(', '))] : []).concat([
               '· CV atual: ' + em(String(opts.sectionBalance.cv)) + ' — meta ≤ 0.35 (alerta ≥ 0.55)',
               '· Métodos pode ser legitimamente mais longa — verifique Introdução e Discussão primeiro',
               '· seções muito curtas podem indicar argumentação incompleta']))
          : D((outliers.length ? ['· outlier sections: ' + em(outliers.slice(0, 3).join(', '))] : []).concat([
               '· current CV: ' + em(String(opts.sectionBalance.cv)) + ' — target ≤ 0.35 (alert at ≥ 0.55)',
               '· Methods is legitimately longer — check Introduction and Discussion first',
               '· very short sections may indicate incomplete argumentation'])) });
    }

    // Perfil de conectores
    if (opts.totalWords >= 500) {
      var connTotal = connectorTotal(opts.connectorByCat);
      var connDensity = opts.totalWords ? (connTotal / opts.totalWords) * 1000 : 0;
      var contrastCause = ((opts.connectorByCat || {}).contrast || 0) + ((opts.connectorByCat || {}).cause || 0);
      var addShare = connTotal ? (((opts.connectorByCat || {}).add || 0) / connTotal) : 0;
      if (connDensity < 6 || (connTotal >= 12 && addShare > 0.7) || (connTotal >= 8 && contrastCause === 0)) {
        issues.push({ level: connDensity < 3 ? 'alert' : 'warn',
          text: pt
            ? 'Perfil de conectores pode enfraquecer a progressão lógica (' + round1(connDensity) + '/1000p)'
            : 'Connector profile may weaken logical progression (' + round1(connDensity) + '/1000w)',
          detail: pt
            ? D(['· baixa densidade sugere parágrafos justapostos, não encadeados',
                 '· excesso de aditivos cria lista; inclua contraste, causa e consequência',
                 '· bons pontos de revisão: início de parágrafos e transição Resultados→Discussão'])
            : D(['· low density suggests juxtaposed rather than connected paragraphs',
                 '· too many additive connectors creates a list; add contrast, cause, and consequence',
                 '· good revision points: paragraph openings and the Results→Discussion transition']) });
      }
    }

    // Voz passiva elevada
    if (opts.passiveDensity > 60) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Densidade de voz passiva elevada: ' + round1(opts.passiveDensity) + '/1000p (meta ≤ 60)'
          : 'High passive voice density: ' + round1(opts.passiveDensity) + '/1000w (target ≤ 60)',
        detail: pt
          ? D(['· converta: ' + em('"foram coletadas amostras" → "coletamos amostras"'),
               '· converta: ' + em('"foi observado que" → "observamos que"'),
               '· passiva é aceitável em Métodos e quando o agente é desconhecido',
               '· prefira ativa em Resultados e Discussão para maior clareza'])
          : D(['· convert: ' + em('"samples were collected" → "we collected samples"'),
               '· convert: ' + em('"it was observed that" → "we observed that"'),
               '· passive is acceptable in Methods and when the agent is unknown',
               '· prefer active in Results and Discussion for greater clarity']) });
    }

    // Hedges excessivos
    if (opts.hedgeDensity > 30) {
      issues.push({ level: 'warn',
        text: pt
          ? 'Alta densidade de atenuadores: ' + round1(opts.hedgeDensity) + '/1000p (meta ≤ 30)'
          : 'High hedge density: ' + round1(opts.hedgeDensity) + '/1000w (target ≤ 30)',
        detail: pt
          ? D(['· reduza: ' + em('pode, poderia, talvez, parece, aparentemente, possivelmente'),
               '· hedges são necessários para afirmações incertas — mas não para resultados diretos',
               '· troque: ' + em('"parece indicar" → "indica"') + ' quando os dados suportam',
               '· assertividade calibrada aumenta a credibilidade científica do texto'])
          : D(['· reduce: ' + em('may, might, could, possibly, appears to, seems to, perhaps'),
               '· hedges are needed for uncertain claims — but not for direct results',
               '· replace: ' + em('"appears to indicate" → "indicates"') + ' when data supports it',
               '· calibrated assertiveness strengthens the scientific credibility of the text']) });
    }

    // Nominalizações
    if (opts.nominalizationCount > 0 && opts.totalWords > 0) {
      var nominalDensity = (opts.nominalizationCount / opts.totalWords) * 1000;
      if (nominalDensity > 18 || opts.nominalizationCount > 30) {
        issues.push({ level: nominalDensity > 35 ? 'alert' : 'warn',
          text: pt
            ? 'Nominalizações elevadas: ' + opts.nominalizationCount + ' (' + round1(nominalDensity) + '/1000p)'
            : 'High nominalization load: ' + opts.nominalizationCount + ' (' + round1(nominalDensity) + '/1000w)',
          detail: pt
            ? D(['· transforme nomes abstratos em verbos quando a ação importa',
                 '· exemplo: ' + em('"a realização da análise" → "analisamos"'),
                 '· preserve termos técnicos estáveis, mas reduza cadeias como "avaliação da determinação da variação"',
                 '· esse ajuste costuma reduzir frases longas e melhorar Flesch/Fog'])
            : D(['· turn abstract nouns into verbs when the action matters',
                 '· example: ' + em('"the performance of the analysis" → "we analyzed"'),
                 '· preserve stable technical terms, but reduce chains like "evaluation of determination of variation"',
                 '· this often shortens sentences and improves Flesch/Fog']) });
      }
    }

    // Pronomes ambíguos
    if (opts.pronounAmbigCount > 2) {
      issues.push({ level: opts.pronounAmbigCount > 8 ? 'alert' : 'warn',
        text: pt
          ? opts.pronounAmbigCount + (opts.pronounAmbigCount === 1 ? ' pronome ambíguo' : ' pronomes ambíguos') + ' no início de frase'
          : opts.pronounAmbigCount + (opts.pronounAmbigCount === 1 ? ' ambiguous pronoun' : ' ambiguous pronouns') + ' at sentence start',
        detail: pt
          ? D(['· troque "isso/isto/eles" por um referente explícito',
               '· exemplo: ' + em('"Isso sugere…" → "Esse aumento sugere…"'),
               '· em parágrafos densos, pronomes fazem o leitor procurar o antecedente'])
          : D(['· replace "this/it/they" with an explicit referent',
               '· example: ' + em('"This suggests…" → "This increase suggests…"'),
               '· in dense paragraphs, pronouns force readers to search for the antecedent']) });
    }

    // Modais, primeira pessoa e pontuação enfática
    if (opts.modalVerbCount > 12) {
      issues.push({ level: opts.modalVerbCount > 28 ? 'alert' : 'warn',
        text: pt
          ? opts.modalVerbCount + ' verbos modais detectados — revise cautela excessiva'
          : opts.modalVerbCount + ' modal verbs detected — review excessive caution',
        detail: pt
          ? D(['· mantenha modais em hipóteses, limitações e recomendações',
               '· em Resultados, substitua "pode indicar" por "indica" quando o dado sustenta',
               '· diferencie incerteza real de hábito de escrita defensiva'])
          : D(['· keep modals for hypotheses, limitations, and recommendations',
               '· in Results, replace "may indicate" with "indicates" when the data supports it',
               '· distinguish real uncertainty from defensive writing habit']) });
    }
    if (opts.firstPersonCount > 8) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.firstPersonCount + ' usos de primeira pessoa — confirme a política da revista'
          : opts.firstPersonCount + ' first-person uses — confirm the journal policy',
        detail: pt
          ? D(['· primeira pessoa pode ser aceitável em periódicos modernos',
               '· se a revista preferir impessoalidade, reescreva sem voltar à passiva excessiva',
               '· evite alternar "nós", "os autores" e voz passiva para a mesma ação'])
          : D(['· first person can be acceptable in modern journals',
               '· if the journal prefers impersonal style, revise without overusing passive voice',
               '· avoid alternating "we", "the authors", and passive voice for the same action']) });
    }
    if (opts.emphaticPunct > 0) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.emphaticPunct + (opts.emphaticPunct === 1 ? ' pontuação enfática' : ' pontuações enfáticas') + ' detectada' + (opts.emphaticPunct === 1 ? '' : 's')
          : opts.emphaticPunct + (opts.emphaticPunct === 1 ? ' emphatic punctuation mark' : ' emphatic punctuation marks') + ' detected',
        detail: pt
          ? D(['· substitua exclamações e perguntas retóricas por afirmações analíticas',
               '· em manuscritos científicos, ênfase deve vir de dados, contraste e conclusão'])
          : D(['· replace exclamation marks and rhetorical emphasis with analytical statements',
               '· in scientific manuscripts, emphasis should come from data, contrast, and conclusion']) });
    }

    // Voz passiva fora de Métodos
    if (opts.nonMethodsPassiveDensity > 45) {
      issues.push({ level: opts.nonMethodsPassiveDensity > 80 ? 'alert' : 'warn',
        text: pt
          ? 'Voz passiva elevada fora de Métodos: ' + round1(opts.nonMethodsPassiveDensity) + '/1000p (meta ≤ 45)'
          : 'High passive voice outside Methods: ' + round1(opts.nonMethodsPassiveDensity) + '/1000w (target ≤ 45)',
        detail: pt
          ? D(['· Introdução, Resultados e Discussão beneficiam de voz ativa',
               '· converta: ' + em('"foi observado que" → "observamos que"'),
               '· converta: ' + em('"foram coletados dados" → "coletamos dados"'),
               '· voz passiva em Métodos é esperada — concentre revisão nas demais seções'])
          : D(['· Introduction, Results, and Discussion benefit from active voice',
               '· convert: ' + em('"it was observed that" → "we observed that"'),
               '· convert: ' + em('"data were collected" → "we collected data"'),
               '· passive in Methods is expected — focus revisions on other sections']) });
    }

    // Termos coloquiais
    if (opts.colloquialCount > 0) {
      issues.push({ level: opts.colloquialCount > 3 ? 'alert' : 'warn',
        text: pt
          ? opts.colloquialCount + (opts.colloquialCount === 1 ? ' expressão coloquial' : ' expressões coloquiais') + ' detectada' + (opts.colloquialCount === 1 ? '' : 's') + ' — inadequada' + (opts.colloquialCount === 1 ? '' : 's') + ' em escrita científica'
          : opts.colloquialCount + (opts.colloquialCount === 1 ? ' colloquial expression' : ' colloquial expressions') + ' detected — inappropriate in scientific writing',
        detail: pt
          ? D(['· substitua: ' + em('"muito bom" → "notável, substancial"'),
               '· substitua: ' + em('"tipo" → "como, tal como"') + ', ' + em('"coisa" → "elemento, fator"'),
               '· use o painel de Tom/Estilo para localizar cada ocorrência',
               '· registros coloquiais reduzem a credibilidade do manuscrito'])
          : D(['· replace: ' + em('"a lot" → "substantial, considerable"'),
               '· replace: ' + em('"kind of" → "somewhat, relatively"') + ', ' + em('"huge" → "substantial, marked"'),
               '· use the Voice & Tone panel to locate each occurrence',
               '· colloquial register undermines the credibility of the manuscript']) });
    }

    // Quantificadores vagos
    if (opts.vagueCount > 8) {
      issues.push({ level: opts.vagueCount > 25 ? 'alert' : 'warn',
        text: pt
          ? opts.vagueCount + ' quantificadores vagos sem dados precisos (' + em('muitos, vários, alguns…') + ')'
          : opts.vagueCount + ' vague quantifiers without precise data (' + em('many, several, some…') + ')',
        detail: pt
          ? D(['· substitua por valores exatos: ' + em('"muitos" → "43 (82%)"'),
               '· se o número exato não for relevante, use: ' + em('"a maioria (>75%)"'),
               '· quantificadores vagos são aceitáveis apenas em contexto qualitativo explícito',
               '· valores em _variables.yml facilitam a parametrização desses dados'])
          : D(['· replace with exact values: ' + em('"many" → "43 (82%)"'),
               '· if exact count is not meaningful, use: ' + em('"the majority (>75%)"'),
               '· vague quantifiers are acceptable only in explicitly qualitative contexts',
               '· define values in _variables.yml to keep numbers updateable']) });
    }

    // Frases com abertura fraca (It is / There is / This is)
    if (opts.weakOpenerCount > 3) {
      issues.push({ level: opts.weakOpenerCount > 10 ? 'alert' : 'warn',
        text: pt
          ? opts.weakOpenerCount + (opts.weakOpenerCount === 1 ? ' frase abre' : ' frases abrem') + ' com sujeito vazio (estrutura It is / There is)'
          : opts.weakOpenerCount + (opts.weakOpenerCount === 1 ? ' sentence opens' : ' sentences open') + ' with an empty subject (It is / There is / This is)',
        detail: pt
          ? D(['· converta: ' + em('"É importante notar que…" → "Nota-se que…" ou omita'),
               '· converta: ' + em('"Há evidências de que…" → "Evidências indicam que…"'),
               '· converta: ' + em('"This is consistent with…" → "These findings are consistent with…"'),
               '· sujeito direto comunica com mais clareza e autoridade'])
          : D(['· convert: ' + em('"It is important to note that…" → "Notably,…" or omit'),
               '· convert: ' + em('"There is evidence that…" → "Evidence indicates that…"'),
               '· convert: ' + em('"This is consistent with…" → "These findings are consistent with…"'),
               '· direct subject communicates with greater clarity and authority']) });
    }

    // Frases iniciando com citação
    if (opts.citationSentStartCount > 3) {
      issues.push({ level: 'warn',
        text: pt
          ? opts.citationSentStartCount + (opts.citationSentStartCount === 1 ? ' frase inicia' : ' frases iniciam') + ' com citação — o argumento deve preceder a referência'
          : opts.citationSentStartCount + (opts.citationSentStartCount === 1 ? ' sentence starts' : ' sentences start') + ' with a citation — the argument should precede the reference',
        detail: pt
          ? D(['· reestruture: ' + em('"@Smith2020 mostrou que X" → "X foi demonstrado [@Smith2020]"'),
               '· a ideia do autor deve abrir a frase; a citação ancora ao final',
               '· excepção: revisões de literatura podem citar o autor como sujeito'])
          : D(['· restructure: ' + em('"@Smith2020 showed that X" → "X has been demonstrated [@Smith2020]"'),
               '· the author\'s idea should open the sentence; the citation anchors at the end',
               '· exception: literature reviews may use the cited author as grammatical subject']) });
    }

    // Siglas não definidas
    if (opts.undefinedAcronyms && opts.undefinedAcronyms.length > 0) {
      var acroList = opts.undefinedAcronyms.slice(0, 6).map(function(a) { return a.acronym; }).join(', ');
      issues.push({ level: opts.undefinedAcronyms.length > 2 ? 'alert' : 'warn',
        text: pt
          ? opts.undefinedAcronyms.length + (opts.undefinedAcronyms.length === 1 ? ' sigla usada' : ' siglas usadas') + ' sem definição prévia'
          : opts.undefinedAcronyms.length + (opts.undefinedAcronyms.length === 1 ? ' acronym used' : ' acronyms used') + ' without prior definition',
        detail: pt
          ? D(['· siglas: ' + em(acroList),
               '· defina na primeira ocorrência: ' + em('Nome Completo (NC)'),
               '· exceção: siglas universalmente conhecidas (DNA, RNA, pH, CO₂)',
               '· verifique também se a sigla está consistente ao longo do texto'])
          : D(['· acronyms: ' + em(acroList),
               '· define at first use: ' + em('Full Name (FN)'),
               '· exception: universally recognized acronyms (DNA, RNA, pH, CO₂)',
               '· also verify consistent capitalization throughout the text']) });
    }

    // Frases com expressões prolixas
    if (opts.wordyCount > 5) {
      issues.push({ level: opts.wordyCount > 20 ? 'alert' : 'warn',
        text: pt
          ? opts.wordyCount + (opts.wordyCount === 1 ? ' expressão prolixa' : ' expressões prolixas') + ' detectada' + (opts.wordyCount === 1 ? '' : 's'  )
          : opts.wordyCount + (opts.wordyCount === 1 ? ' wordy phrase' : ' wordy phrases') + ' detected',
        detail: pt
          ? D(['· substitua: ' + em('"pelo fato de que" → "porque"'),
               '· substitua: ' + em('"no que diz respeito a" → "sobre"') + ', ' + em('"com o objetivo de" → "para"'),
               '· substitua: ' + em('"é necessário que" → "deve"') + ', ' + em('"em função de" → "por"'),
               '· use o painel de Tom/Estilo para localizar cada ocorrência'])
          : D(['· replace: ' + em('"due to the fact that" → "because"'),
               '· replace: ' + em('"in order to" → "to"') + ', ' + em('"with regard to" → "regarding"'),
               '· replace: ' + em('"it is necessary to" → "must"') + ', ' + em('"in the event that" → "if"'),
               '· use the Voice & Tone panel to locate each occurrence']) });
    }

    // Inconsistência de unidades
    if (opts.unitInconsistency && opts.unitInconsistency.length > 0) {
      var unitList = opts.unitInconsistency.slice(0, 4).join('; ');
      issues.push({ level: 'alert',
        text: pt
          ? opts.unitInconsistency.length + (opts.unitInconsistency.length === 1 ? ' inconsistência de unidade' : ' inconsistências de unidades') + ' detectada' + (opts.unitInconsistency.length === 1 ? '' : 's')
          : opts.unitInconsistency.length + (opts.unitInconsistency.length === 1 ? ' unit inconsistency' : ' unit inconsistencies') + ' detected',
        detail: pt
          ? D(['· conflitos: ' + em(unitList),
               '· padronize: use ' + em('mg kg⁻¹') + ' ou ' + em('mg/kg') + ' — nunca os dois',
               '· prefira notação com expoente negativo em periódicos científicos',
               '· verifique também % vs. por cento e h vs. hora'])
          : D(['· conflicts: ' + em(unitList),
               '· standardize: use ' + em('mg kg⁻¹') + ' or ' + em('mg/kg') + ' — never both',
               '· prefer negative exponent notation in scientific journals',
               '· also check % vs. percent and h vs. hour']) });
    }

    // Variantes terminológicas
    if (opts.termVariants && opts.termVariants.length > 3) {
      var tvList = opts.termVariants.slice(0, 4).map(function(v) {
        return v.forms ? v.forms.slice(0, 2).join('/') : '';
      }).filter(Boolean).join(', ');
      issues.push({ level: 'warn',
        text: pt
          ? opts.termVariants.length + ' grupos de variantes terminológicas — risco de ambiguidade conceitual'
          : opts.termVariants.length + ' terminology variant groups — risk of conceptual ambiguity',
        detail: pt
          ? D((tvList ? ['· exemplos: ' + em(tvList)] : []).concat([
               '· escolha uma forma canônica e use-a consistentemente',
               '· variantes como ' + em('análise/analisar/analítico') + ' podem ser intencionais — revise',
               '· inconsistência terminológica dificulta buscas bibliográficas']))
          : D((tvList ? ['· examples: ' + em(tvList)] : []).concat([
               '· choose a canonical form and use it consistently',
               '· variants like ' + em('analyze/analysis/analytical') + ' may be intentional — review',
               '· terminology inconsistency hampers literature search and review'])) });
    }

    // Repetição lexical global
    if (opts.repeatedTermCount > 12) {
      var repeatedList = topList(opts.topRepeated, 6, function (x) {
        if (typeof x === 'string') return x;
        return (x.text || '') + (x.count ? ' ×' + x.count : '');
      });
      issues.push({ level: opts.repeatedTermCount > 28 ? 'alert' : 'warn',
        text: pt
          ? opts.repeatedTermCount + ' termos com repetição forte no documento'
          : opts.repeatedTermCount + ' strongly repeated terms in the document',
        detail: pt
          ? D((repeatedList ? ['· mais repetidos: ' + em(repeatedList)] : []).concat([
               '· preserve palavras-chave técnicas quando forem necessárias para rastreabilidade',
               '· revise repetições de verbos genéricos, conectores e nomes abstratos',
               '· se o termo central domina muitas seções, varie a estrutura da frase em vez de trocar o termo']))
          : D((repeatedList ? ['· most repeated: ' + em(repeatedList)] : []).concat([
               '· preserve technical keywords when needed for traceability',
               '· review repeated generic verbs, connectors, and abstract nouns',
               '· if the central term dominates many sections, vary sentence structure rather than replacing the term'])) });
    }

    // Inícios repetidos de frase
    if (opts.repeatedStarts && opts.repeatedStarts.length > 2) {
      var startList = topList(opts.repeatedStarts, 4, function (x) { return (x.start || x.word || x.text) + ' ×' + x.count; });
      issues.push({ level: opts.repeatedStarts.length > 6 ? 'alert' : 'warn',
        text: pt
          ? opts.repeatedStarts.length + ' padrões repetidos de início de frase'
          : opts.repeatedStarts.length + ' repeated sentence-start patterns',
        detail: pt
          ? D((startList ? ['· exemplos: ' + em(startList)] : []).concat([
               '· varie sujeito, conector e ordem da informação conhecida/nova',
               '· repetição pode ser recurso retórico, mas perde força quando aparece por hábito',
               '· revise principalmente sequências de Resultados']))
          : D((startList ? ['· examples: ' + em(startList)] : []).concat([
               '· vary subject, connector, and old/new information order',
               '· repetition can be rhetorical, but weakens when it appears by habit',
               '· review Results sequences first'])) });
    }

    // Baixa diversidade lexical
    if (opts.lexDiv < 50) {
      issues.push({ level: opts.lexDiv < 35 ? 'alert' : 'warn',
        text: pt
          ? 'Baixa diversidade lexical: ' + opts.lexDiv + '% (meta ≥ 50%)'
          : 'Low lexical diversity: ' + opts.lexDiv + '% (target ≥ 50%)',
        detail: pt
          ? D(['· diversidade mede palavras únicas / total de palavras de conteúdo',
               '· varie o vocabulário: use sinônimos precisos, não genéricos',
               '· repetição controlada de termos técnicos é esperada — o problema é a repetição de verbo/conectivo',
               '· revise os termos mais repetidos abaixo no painel de Vocabulário'])
          : D(['· diversity measures unique / total content words in the document',
               '· vary vocabulary: use precise synonyms, not generic ones',
               '· controlled repetition of technical terms is expected — the issue is verb/connector repetition',
               '· review most repeated terms in the Vocabulary panel below']) });
    }

    // Sinais NLP de densidade e fluxo
    var nlpTotals = opts.nlpTotals || {};
    if ((nlpTotals.nominalLoadCount || 0) > 5 || (nlpTotals.weakVerbCount || 0) > 8 || (nlpTotals.nounStackCount || 0) > 4) {
      var nlpAlert = (nlpTotals.nominalLoadCount || 0) > 18 || (nlpTotals.weakVerbCount || 0) > 24 || (nlpTotals.nounStackCount || 0) > 12;
      issues.push({ level: nlpAlert ? 'alert' : 'warn',
        text: pt
          ? 'NLP detectou densidade nominal/verbos fracos: ' + (nlpTotals.nominalLoadCount || 0) + ' frases densas, ' + (nlpTotals.weakVerbCount || 0) + ' verbos genéricos, ' + (nlpTotals.nounStackCount || 0) + ' noun stacks'
          : 'NLP detected nominal density/weak predicates: ' + (nlpTotals.nominalLoadCount || 0) + ' dense sentences, ' + (nlpTotals.weakVerbCount || 0) + ' generic verbs, ' + (nlpTotals.nounStackCount || 0) + ' noun stacks',
        detail: pt
          ? D(['· substitua verbos genéricos por relações científicas precisas: aumenta, reduz, prediz, modula',
               '· quebre cadeias nominais com preposições ou frases relativas curtas',
               '· revise os highlights NLP antes de editar terminologia técnica'])
          : D(['· replace generic verbs with precise scientific relations: increases, reduces, predicts, modulates',
               '· break noun chains with prepositions or short relative clauses',
               '· review NLP highlights before editing technical terminology']) });
    }
    if ((nlpTotals.entityOverloadCount || 0) > 0 || opts.nlpEntityDensity > 8) {
      issues.push({ level: (nlpTotals.entityOverloadCount || 0) > 5 || opts.nlpEntityDensity > 16 ? 'alert' : 'warn',
        text: pt
          ? 'Alta concentração de entidades/nomes próprios (' + round1(opts.nlpEntityDensity || 0) + '/100p)'
          : 'High concentration of entities/proper names (' + round1(opts.nlpEntityDensity || 0) + '/100w)',
        detail: pt
          ? D(['· agrupe nomes institucionais, softwares e locais quando possível',
               '· explique a função do nome próprio na primeira menção',
               '· frases com muitas entidades tendem a obscurecer a relação científica'])
          : D(['· group institutional names, software, and locations where possible',
               '· explain the role of a proper name at first mention',
               '· entity-heavy sentences can obscure the scientific relationship']) });
    }
    if (opts.nlpActionVerbScore < 55 || opts.nlpSemanticRedundancy > 22 || (opts.nlpFlowScore > 0 && opts.nlpFlowScore < 45) || (nlpTotals.termDriftCount || 0) > 0) {
      issues.push({ level: opts.nlpActionVerbScore < 35 || opts.nlpSemanticRedundancy > 35 || (opts.nlpFlowScore > 0 && opts.nlpFlowScore < 30) ? 'alert' : 'warn',
        text: pt
          ? 'Sinais NLP de fluxo/redundância: ação ' + round1(opts.nlpActionVerbScore || 0) + '%, redundância ' + round1(opts.nlpSemanticRedundancy || 0) + '%, fluxo ' + round1(opts.nlpFlowScore || 0) + '%'
          : 'NLP flow/redundancy signals: action ' + round1(opts.nlpActionVerbScore || 0) + '%, redundancy ' + round1(opts.nlpSemanticRedundancy || 0) + '%, flow ' + round1(opts.nlpFlowScore || 0) + '%',
        detail: pt
          ? D(['· frases vizinhas muito parecidas devem ser fundidas ou diferenciadas',
               '· baixo fluxo geralmente pede conector ou retomada explícita do conceito anterior',
               '· drift terminológico sugere escolher uma forma canônica para o mesmo conceito'])
          : D(['· very similar adjacent sentences should be merged or differentiated',
               '· low flow usually needs a connector or explicit reprise of the previous concept',
               '· term drift suggests choosing one canonical form for the same concept']) });
    }
    if (LANG === 'en' && ((nlpTotals.contractionCount || 0) > 0 || (nlpTotals.questionCount || 0) > 1)) {
      issues.push({ level: 'warn',
        text: (nlpTotals.contractionCount || 0) + ' contractions and ' + (nlpTotals.questionCount || 0) + ' interrogative sentences detected',
        detail: D(['· avoid contractions in formal scientific English',
                   '· convert rhetorical questions into explicit knowledge gaps or objectives',
                   '· questions are acceptable only when the article genre explicitly supports them']) });
    }
    if (opts.winkStats && opts.winkStats.winkAvailable && (
      (opts.winkStats.complexWordDensity || 0) > 18 ||
      (opts.winkStats.pronounDensity || 0) > 5 ||
      (opts.winkStats.auxiliaryVerbRatio || 0) > 70 ||
      (opts.winkStats.posNounStackCount || 0) > 5
    )) {
      issues.push({ level: (opts.winkStats.complexWordDensity || 0) > 24 || (opts.winkStats.posNounStackCount || 0) > 14 ? 'alert' : 'warn',
        text: pt
          ? 'wink-nlp reforça sinais de prosa densa em inglês'
          : 'wink-nlp confirms dense English prose signals',
        detail: pt
          ? D(['· revise palavras complexas, pronomes, auxiliares e noun stacks nos cards wink',
               '· essa checagem usa POS tagging e complementa as heurísticas internas'])
          : D(['· review complex words, pronouns, auxiliaries, and noun stacks in wink cards',
               '· this check uses POS tagging and complements the built-in heuristics']) });
    }

    // Referências não citadas
    if (opts.unusedRefs && opts.unusedRefs.length > 0) {
      var unusedRefList = opts.unusedRefs.slice(0, 5).join(', ');
      issues.push({ level: 'warn',
        text: pt
          ? opts.unusedRefs.length + (opts.unusedRefs.length === 1 ? ' referência definida' : ' referências definidas') + ' em ref.bib mas não citada' + (opts.unusedRefs.length === 1 ? '' : 's') + ' no texto'
          : opts.unusedRefs.length + (opts.unusedRefs.length === 1 ? ' reference defined' : ' references defined') + ' in ref.bib but not cited in text',
        detail: pt
          ? D(['· chaves: ' + em(unusedRefList),
               '· remova do .bib se não for relevante para o manuscrito atual',
               '· ou insira uma citação onde o trabalho sustenta uma afirmação',
               '· bibliografias infladas são penalizadas em revisão por pares'])
          : D(['· keys: ' + em(unusedRefList),
               '· remove from .bib if not relevant to the current manuscript',
               '· or insert a citation where the work supports a claim',
               '· inflated reference lists are flagged in peer review']) });
    }

    var alerts = issues.filter(function(i) { return i.level === 'alert'; });
    var warns  = issues.filter(function(i) { return i.level === 'warn'; });

    function renderIssue(iss) {
      return '<div class="ws-sum-issue ws-sum-issue-' + iss.level + '">' +
        (iss.level === 'alert' ? '⚠ ' : '› ') + escapeHTML(iss.text) +
        (iss.detail ? '<br>' + iss.detail : '') +
      '</div>';
    }

    var html = buildTextProfile();
    if (issues.length === 0) {
      html += '<div class="ws-sum-ok">' + (pt ? '✓ Nenhum problema detectado.' : '✓ No issues detected.') + '</div>';
    } else {
      if (alerts.length > 0) {
        html += '<div class="ws-sum-section-label ws-sum-section-alert">' + (pt ? 'Problemas críticos' : 'Key issues') + '</div>';
        html += alerts.map(renderIssue).join('');
      }
      if (warns.length > 0) {
        html += '<div class="ws-sum-section-label ws-sum-section-warn">' + (pt ? 'Atenções' : 'Notices') + '</div>';
        html += warns.map(renderIssue).join('');
      }
    }

    return '<div class="ws-doc-summary">' +
      '<div class="ws-sum-header">' +
        '<span class="ws-sum-title">' + (pt ? 'Análise do documento' : 'Document analysis') + '</span>' +
        '<span class="ws-sum-badge">' + (pt ? 'automático' : 'auto') + '</span>' +
      '</div>' +
      html +
    '</div>';
  }
