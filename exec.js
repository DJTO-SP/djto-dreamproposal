// ══════════════════════════════════════════════════════════
// ██  제안실행상 접수  ██
//   - 대상: 2025년 하반기 · 2026년 상반기 제안 (통합관리대장 DATA에서 드롭다운 구성)
//   - 제출: 제안실행자(팀) / 실행 개요 / 증빙 자료
//   - 서버: Apps Script  dreamExecSubmit → dreamExecSaveFile(파일별)
//   script.js 의 DATA, apiPost, fileToBase64, showLoadingOverlay, switchTab 을 사용합니다.
// ══════════════════════════════════════════════════════════

// 접수 대상 기간 — 순번 앞 4자리(연도) → 표시 이름
var EXEC_TARGETS = { '2025': '2025년 하반기 제안', '2026': '2026년 상반기 제안' };
// 연도 중 접수 대상이 시작되는 순번 — 2025년은 2025-41부터가 하반기 제안 (2025-01~40은 상반기라 제외)
var EXEC_MIN_NO = { '2025': 41 };

var EXEC_MAX_FILE = 15 * 1024 * 1024;   // 파일당 15MB
var EXEC_MAX_TOTAL = 40 * 1024 * 1024;  // 전체 40MB
// 모든 형식 허용, 단 실행·스크립트 파일은 보안상 제외
var EXEC_BLOCKED = ['exe','bat','cmd','com','scr','msi','dll','js','jse','vbs','vbe','wsf','ps1','jar','lnk','reg','apk','sh'];

var _execRetry = 0; // 대상 제안 목록 로딩 재시도 횟수

function execEsc_(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// [실행상 접수] 탭 진입 시 호출 — 폼 초기화 + 대상 제안 목록 구성
function initExecTab() {
  var done = document.getElementById('exec-done');
  if (done) done.style.display = 'none';
  document.querySelectorAll('#tab-exec .card > *:not(#exec-done)').forEach(function(e) { e.style.display = ''; });
  clearExecForm_();
  buildExecProposalOptions_();
}

function clearExecForm_() {
  ['ex-name','ex-team','ex-summary','ex-result','ex-link','ex-start','ex-end'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  ['ex-proposal','ex-dept'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.selectedIndex = 0;
  });
  var fe = document.getElementById('ex-files'); if (fe) fe.value = '';
  var pk = document.getElementById('ex-picked'); if (pk) pk.innerHTML = '';
  var typeInd = document.querySelector('input[name="ex-type"][value="개인"]');
  if (typeInd) typeInd.checked = true;
  document.querySelectorAll('input[name="ex-status"]').forEach(function(r) { r.checked = false; });
  var list = document.getElementById('ex-members-list');
  if (list) list.innerHTML = '';
  var meta = document.getElementById('ex-proposal-meta');
  if (meta) meta.textContent = '';
  toggleExecType();
  onExecStatusChange();
}

// 통합관리대장(DATA)에서 2025·2026 제안만 뽑아 드롭다운 구성
function buildExecProposalOptions_() {
  var sel = document.getElementById('ex-proposal');
  if (!sel) return;
  if (!DATA_LOADED) {
    sel.innerHTML = '<option value="">제안 목록을 불러오는 중...</option>';
    if (_execRetry < 20) { _execRetry++; setTimeout(buildExecProposalOptions_, 500); }
    return;
  }
  _execRetry = 0;

  // 통합관리대장(Sheet1) 행만 대상 — 서버가 순번 대신 legacy_행번호를 주므로,
  // 연도별로 행 순서대로 번호를 매겨 '2025-01' 형식 표시번호를 만든다.
  var groups = {};
  DATA.forEach(function(d) {
    var yr = String(d.period || '');
    if (!EXEC_TARGETS[yr] || String(d.source) !== 'legacy') return;
    var rowNo = parseInt(String(d.id).replace(/\D/g, ''), 10) || 0;
    (groups[yr] = groups[yr] || []).push({ rowNo: rowNo, title: d.title || '', category: d.category || '', award: d.award || '' });
  });
  Object.keys(groups).forEach(function(yr) {
    groups[yr].sort(function(a, b) { return a.rowNo - b.rowNo; });
    groups[yr].forEach(function(p, i) {
      p.no = i + 1;
      p.id = yr + '-' + (i < 9 ? '0' : '') + (i + 1);
    });
    var minNo = EXEC_MIN_NO[yr] || 1;
    groups[yr] = groups[yr].filter(function(p) { return p.no >= minNo; });
  });

  var html = '<option value="">-- 제안을 선택하세요 --</option>';
  Object.keys(EXEC_TARGETS).sort().forEach(function(yr) {
    var list = groups[yr] || [];
    if (!list.length) return;
    html += '<optgroup label="' + execEsc_(EXEC_TARGETS[yr]) + ' (' + list.length + '건)">';
    list.forEach(function(p) {
      var aw = p.award ? ' [' + p.award + ']' : '';
      html += '<option value="' + execEsc_(p.id) + '" data-title="' + execEsc_(p.title) + '" data-cat="' + execEsc_(p.category) + '" data-award="' + execEsc_(p.award) + '">'
            + execEsc_(p.id + ' · ' + p.title + aw) + '</option>';
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
}

function onExecProposalChange() {
  var sel = document.getElementById('ex-proposal');
  var meta = document.getElementById('ex-proposal-meta');
  if (!sel || !meta) return;
  var opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { meta.textContent = ''; return; }
  var yr = opt.value.substring(0, 4);
  meta.textContent = '선택: ' + (EXEC_TARGETS[yr] || '') + ' · ' + (opt.getAttribute('data-cat') || '')
    + (opt.getAttribute('data-award') ? ' · ' + opt.getAttribute('data-award') : '');
}

// 개인 / 그룹 전환
function toggleExecType() {
  var sel = document.querySelector('input[name="ex-type"]:checked');
  var type = sel ? sel.value : '개인';
  var nameLabel = document.getElementById('ex-name-label');
  var deptLabel = document.getElementById('ex-dept-label');
  var groupArea = document.getElementById('ex-group-area');
  if (type === '그룹') {
    if (nameLabel) nameLabel.innerHTML = '대표자 성명 <span class="field-req">*</span>';
    if (deptLabel) deptLabel.innerHTML = '대표자 소속 <span class="field-req">*</span>';
    if (groupArea) {
      groupArea.style.display = '';
      if (!document.querySelector('#ex-members-list .sf-member-row')) addExecMemberRow();
    }
  } else {
    if (nameLabel) nameLabel.innerHTML = '성명 <span class="field-req">*</span>';
    if (deptLabel) deptLabel.innerHTML = '소속 <span class="field-req">*</span>';
    if (groupArea) groupArea.style.display = 'none';
  }
}

function addExecMemberRow() {
  var list = document.getElementById('ex-members-list');
  if (!list) return;
  var row = document.createElement('div');
  row.className = 'sf-member-row';
  row.innerHTML = '<input type="text" class="ex-member-name" placeholder="이름"><button type="button" onclick="this.parentElement.remove()">✕</button>';
  list.appendChild(row);
}

// 추진 상태에 따라 종료일 문구 변경
function onExecStatusChange() {
  var sel = document.querySelector('input[name="ex-status"]:checked');
  var st = sel ? sel.value : '';
  var endLabel = document.getElementById('ex-end-label');
  if (endLabel) endLabel.innerHTML = (st === '완료' ? '종료일' : '종료(예정)일') + ' <span class="field-req">*</span> <span class="lbl-hint">(연도-월)</span>';
}

// 선택한 증빙 파일 목록 표시
function showExecPicked() {
  var input = document.getElementById('ex-files');
  var box = document.getElementById('ex-picked');
  if (!input || !box) return;
  var fs = Array.prototype.slice.call(input.files || []);
  if (!fs.length) { box.innerHTML = ''; return; }
  var total = 0;
  var html = fs.map(function(f) { total += f.size; return '📄 ' + execEsc_(f.name) + ' (' + execFmtSize_(f.size) + ')'; }).join('<br>');
  box.innerHTML = html + '<br><b>총 ' + fs.length + '개 · ' + execFmtSize_(total) + '</b>';
}

function execFileExt_(name) {
  var i = String(name || '').lastIndexOf('.');
  return i < 0 ? '' : name.substring(i + 1).toLowerCase();
}

function execFmtSize_(n) {
  return n < 1024 * 1024 ? Math.round(n / 1024) + 'KB' : (n / (1024 * 1024)).toFixed(1) + 'MB';
}

// ── 접수 ────────────────────────────────────────────────
function submitExecution() {
  var propSel = document.getElementById('ex-proposal');
  var propOpt = propSel && propSel.options[propSel.selectedIndex];
  var proposalNo = propOpt ? propOpt.value : '';
  var proposalTitle = propOpt ? (propOpt.getAttribute('data-title') || '') : '';

  var typeEl = document.querySelector('input[name="ex-type"]:checked');
  var type = typeEl ? typeEl.value : '개인';
  var name = (document.getElementById('ex-name').value || '').trim();
  var dept = (document.getElementById('ex-dept').value || '').trim();
  var team = (document.getElementById('ex-team').value || '').trim();
  var members = [];
  if (type === '그룹') {
    members = Array.prototype.slice.call(document.querySelectorAll('#ex-members-list .ex-member-name'))
      .map(function(i) { return (i.value || '').trim(); }).filter(Boolean);
  }
  var stEl = document.querySelector('input[name="ex-status"]:checked');
  var status = stEl ? stEl.value : '';
  var start = document.getElementById('ex-start').value;
  var end = document.getElementById('ex-end').value;
  var summary = (document.getElementById('ex-summary').value || '').trim();
  var result = (document.getElementById('ex-result').value || '').trim();
  var link = (document.getElementById('ex-link').value || '').trim();

  var pickedFiles = Array.prototype.slice.call(document.getElementById('ex-files').files || []);

  // 필수 검증
  if (!proposalNo) return alert('실행한 제안을 선택해주세요.');
  if (!name) return alert(type === '그룹' ? '대표자 성명을 입력해주세요.' : '성명을 입력해주세요.');
  if (!dept) return alert(type === '그룹' ? '대표자 소속을 선택해주세요.' : '소속을 선택해주세요.');
  if (type === '그룹' && members.length === 0) return alert('그룹 신청은 함께한 분을 1명 이상 입력해주세요.');
  if (!status) return alert('추진 상태(진행 중/완료)를 선택해주세요.');
  if (!start) return alert('추진 시작일을 입력해주세요.');
  if (!end) return alert(status === '완료' ? '종료일을 입력해주세요.' : '종료(예정)일을 입력해주세요.');
  if (end < start) return alert('종료일이 시작일보다 앞설 수 없습니다.');
  if (!summary) return alert('실행 개요를 입력해주세요.');
  if (!result) return alert('주요 성과를 입력해주세요.');
  if (!pickedFiles.length) return alert('증빙자료를 1개 이상 첨부해주세요.\n(사업계획서, 결과보고서, 기타 증빙자료 등)');
  if (link && !/^https?:\/\//i.test(link)) return alert('증빙 링크는 http:// 또는 https:// 로 시작해야 합니다.');

  // 파일 검증
  var files = pickedFiles.map(function(f) { return { kind: '증빙자료', file: f }; });
  var total = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i].file;
    if (EXEC_BLOCKED.indexOf(execFileExt_(f.name)) >= 0) return alert('보안상 첨부할 수 없는 파일 형식입니다 (실행·스크립트 파일): ' + f.name);
    if (f.size > EXEC_MAX_FILE) return alert('파일이 15MB를 넘습니다: ' + f.name + ' (' + execFmtSize_(f.size) + ')\n큰 파일은 증빙 링크로 제출해주세요.');
    total += f.size;
  }
  if (total > EXEC_MAX_TOTAL) return alert('첨부 파일 전체 크기가 40MB를 넘습니다. (' + execFmtSize_(total) + ')');
  if (!SCRIPT_URL) return alert('Apps Script가 연결되지 않았습니다.');

  if (!confirm('"' + proposalTitle + '"\n제안실행상을 접수하시겠습니까?\n\n(접수 후에는 직접 수정할 수 없습니다. 보완이 필요하면 담당자에게 문의하세요.)')) return;

  var btn = document.getElementById('ex-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '접수 중...'; }
  showLoadingOverlay('제안실행상 접수 중...');

  var execNo = '', token = '';
  apiPost({
    action: 'dreamExecSubmit',
    proposalNo: proposalNo, proposalTitle: proposalTitle,
    type: type, name: name, dept: dept, team: team, members: members,
    status: status, startDate: start, endDate: end,
    summary: summary, result: result, link: link,
    fileCount: files.length
  }).then(function(res) {
    if (!res || !res.ok || !res.execNo) throw new Error((res && res.error) || '접수 실패 (서버를 확인해주세요)');
    execNo = res.execNo; token = res.token || '';
    return uploadExecFiles_(execNo, token, files);
  }).then(function(failed) {
    hideLoadingOverlay();
    if (btn) { btn.disabled = false; btn.textContent = '제안실행상 접수'; }
    if (failed.length) {
      alert('⚠️ 접수는 완료됐으나 일부 파일 업로드에 실패했습니다.\n\n'
        + failed.map(function(x) { return '  • ' + x; }).join('\n')
        + '\n\n담당자에게 접수번호(' + execNo + ')와 함께 해당 파일을 전달해주세요.');
    }
    showExecDone_(execNo, proposalNo, proposalTitle, name, type, team);
  }).catch(function(e) {
    hideLoadingOverlay();
    if (btn) { btn.disabled = false; btn.textContent = '제안실행상 접수'; }
    alert('❌ 오류: ' + e.message + (execNo ? '\n접수번호: ' + execNo + ' (담당자에게 문의)' : ''));
  });
}

// 파일을 한 개씩 순서대로 업로드 — 실패한 파일명 목록 반환
function uploadExecFiles_(execNo, token, files) {
  var failed = [];
  var chain = Promise.resolve();
  files.forEach(function(item, idx) {
    chain = chain.then(function() {
      showLoadingOverlay('증빙 업로드 중... (' + (idx + 1) + '/' + files.length + ') ' + item.file.name);
      return fileToBase64(item.file).then(function(b64) {
        return apiPost({
          action: 'dreamExecSaveFile',
          execNo: execNo, token: token,
          kind: item.kind, fileName: item.file.name, mime: item.file.type || '', base64: b64
        });
      }).then(function(r) {
        if (!r || r.ok !== true || !r.url) failed.push(item.file.name);
      }).catch(function() { failed.push(item.file.name); });
    });
  });
  return chain.then(function() { return failed; });
}

function showExecDone_(execNo, proposalNo, proposalTitle, name, type, team) {
  document.querySelectorAll('#tab-exec .card > *:not(#exec-done)').forEach(function(e) { e.style.display = 'none'; });
  var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
  set('ex-done-no', execNo);
  set('ex-done-title', proposalNo + ' · ' + proposalTitle);
  set('ex-done-name', type === '그룹' && team ? team + ' (' + name + ' 외)' : name);
  var done = document.getElementById('exec-done');
  if (done) done.style.display = 'block';
  window.scrollTo(0, 0);
}
